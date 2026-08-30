import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4173);
const databaseUrl = process.env.DATABASE_URL;
const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || '';
const { Pool } = pg;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 5 }) : null;
const cleanText = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const passwordHash = (password, salt) => crypto.pbkdf2Sync(password, salt, 210000, 64, 'sha512').toString('hex');
const sensitiveKey = /card|cvv|cvc|otp|pin|password|passcode|secret|token|iban|account|bank/i;
const civilIdKey = /civil.?id|national.?id|civilid|nationalid/i;
const normalizeCivilId = value => String(value || '').replace(/\D/g, '').slice(0, 32);
const maskCivilId = value => { const normalized = normalizeCivilId(value); return normalized.length >= 4 ? `••••••••${normalized.slice(-4)}` : ''; };

if (!databaseUrl || !adminEmail || !initialPassword) {
  console.error('DATABASE_URL, ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD are required.');
  process.exit(1);
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sahel_visitors (
      id BIGSERIAL PRIMARY KEY, session_hash CHAR(64) UNIQUE NOT NULL,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(), visit_count INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS sahel_submissions (
      id BIGSERIAL PRIMARY KEY, session_hash CHAR(64) NOT NULL REFERENCES sahel_visitors(session_hash) ON UPDATE CASCADE,
      page TEXT NOT NULL, form_id TEXT NOT NULL DEFAULT '', fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      customer_key CHAR(64), customer_label TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE sahel_submissions ADD COLUMN IF NOT EXISTS customer_key CHAR(64);
    ALTER TABLE sahel_submissions ADD COLUMN IF NOT EXISTS customer_label TEXT;
    CREATE INDEX IF NOT EXISTS sahel_submissions_created_at_idx ON sahel_submissions(created_at DESC);
    CREATE INDEX IF NOT EXISTS sahel_submissions_customer_key_idx ON sahel_submissions(customer_key);
    CREATE TABLE IF NOT EXISTS admin_users (
      id BIGSERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_login TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      token_hash CHAR(64) UNIQUE NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS admin_sessions_token_idx ON admin_sessions(token_hash);
  `);
  const found = await pool.query('SELECT id FROM admin_users WHERE email=$1', [adminEmail]);
  if (!found.rowCount) {
    const salt = crypto.randomBytes(16).toString('hex');
    await pool.query('INSERT INTO admin_users (email, password_hash, password_salt) VALUES ($1, $2, $3)', [adminEmail, passwordHash(initialPassword, salt), salt]);
  }
}

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

app.post('/api/visit', async (req, res) => {
  try {
    const sessionId = cleanText(req.body?.sessionId, 128); const page = cleanText(req.body?.page, 160) || 'index.html';
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    const sessionHash = hash(sessionId);
    await pool.query(`INSERT INTO sahel_visitors (session_hash) VALUES ($1) ON CONFLICT (session_hash) DO UPDATE SET last_seen=NOW(), visit_count=sahel_visitors.visit_count+1`, [sessionHash]);
    res.json({ ok: true, sessionHash, page });
  } catch (error) { console.error('visit error', error); res.status(500).json({ error: 'Unable to record visit' }); }
});

app.post('/api/submissions', async (req, res) => {
  try {
    const sessionId = cleanText(req.body?.sessionId, 128); const page = cleanText(req.body?.page, 160) || 'unknown'; const formId = cleanText(req.body?.formId, 160);
    const incoming = req.body?.fields && typeof req.body.fields === 'object' ? req.body.fields : {};
    const rawIdentity = normalizeCivilId(req.body?.customerIdentity || Object.entries(incoming).find(([key]) => civilIdKey.test(key))?.[1]);
    const customerKey = rawIdentity ? hash(rawIdentity) : null;
    const customerLabel = rawIdentity ? maskCivilId(rawIdentity) : null;
    const fields = Object.fromEntries(Object.entries(incoming).filter(([key, value]) => !sensitiveKey.test(key) && !civilIdKey.test(key) && typeof value !== 'object' && cleanText(value, 2000)));
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    const sessionHash = hash(sessionId);
    await pool.query('INSERT INTO sahel_visitors (session_hash) VALUES ($1) ON CONFLICT (session_hash) DO UPDATE SET last_seen=NOW()', [sessionHash]);
    await pool.query('INSERT INTO sahel_submissions (session_hash, page, form_id, fields, customer_key, customer_label) VALUES ($1,$2,$3,$4::jsonb,$5,$6)', [sessionHash, page, formId, JSON.stringify(fields), customerKey, customerLabel]);
    res.status(201).json({ ok: true });
  } catch (error) { console.error('submission error', error); res.status(500).json({ error: 'Unable to save submission' }); }
});

function cookieValue(req, name) { const match = (req.headers.cookie || '').match(new RegExp(`(?:^|; )${name}=([^;]*)`)); return match ? decodeURIComponent(match[1]) : ''; }
async function adminAuth(req, res, next) {
  try {
    const raw = cookieValue(req, 'sahel_admin_session');
    if (!raw) return res.status(401).json({ error: 'Unauthorized' });
    const result = await pool.query(`SELECT s.id, u.id AS user_id, u.email FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > NOW()`, [hash(raw)]);
    if (!result.rowCount) return res.status(401).json({ error: 'Unauthorized' });
    req.admin = result.rows[0]; next();
  } catch { res.status(401).json({ error: 'Unauthorized' }); }
}

app.post('/api/admin/login', async (req, res) => {
  const email = cleanText(req.body?.email, 320).toLowerCase(); const password = cleanText(req.body?.password, 200);
  if (!email || !password) return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبان' });
  const result = await pool.query('SELECT id,email,password_hash,password_salt FROM admin_users WHERE email=$1', [email]);
  if (!result.rowCount) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  const user = result.rows[0]; const candidate = passwordHash(password, user.password_salt);
  if (candidate !== user.password_hash) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  const rawToken = crypto.randomBytes(32).toString('hex');
  await pool.query('DELETE FROM admin_sessions WHERE expires_at <= NOW() OR user_id=$1', [user.id]);
  await pool.query('INSERT INTO admin_sessions (user_id, token_hash, expires_at) VALUES ($1,$2,NOW()+INTERVAL \'8 hours\')', [user.id, hash(rawToken)]);
  await pool.query('UPDATE admin_users SET last_login=NOW() WHERE id=$1', [user.id]);
  res.setHeader('Set-Cookie', `sahel_admin_session=${encodeURIComponent(rawToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.json({ ok: true, email: user.email });
});
app.post('/api/admin/logout', adminAuth, async (req, res) => { await pool.query('DELETE FROM admin_sessions WHERE id=$1', [req.admin.id]); res.setHeader('Set-Cookie', 'sahel_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/admin/me', adminAuth, (req, res) => res.json({ ok: true, email: req.admin.email }));
app.get('/api/admin/customers', adminAuth, async (_req, res) => {
  const result = await pool.query(`SELECT COALESCE(customer_key, session_hash) AS "customerKey", COALESCE(MAX(customer_label), MAX(NULLIF(fields->>'name','')), MAX(NULLIF(fields->>'fullName',''))) AS "customerLabel", MAX(created_at) AS "lastSeen", COUNT(*)::int AS "recordCount" FROM sahel_submissions GROUP BY COALESCE(customer_key, session_hash) HAVING COALESCE(MAX(customer_label), MAX(NULLIF(fields->>'name','')), MAX(NULLIF(fields->>'fullName',''))) IS NOT NULL ORDER BY MAX(created_at) DESC`);
  res.json({ customers: result.rows });
});
app.get('/api/admin/customers/:customerKey', adminAuth, async (req, res) => {
  const result = await pool.query(`SELECT id,session_hash AS "sessionHash",page,form_id AS "formId",fields,customer_key AS "customerKey",COALESCE(customer_label, NULLIF(fields->>'name',''), NULLIF(fields->>'fullName','')) AS "customerLabel",created_at AS "createdAt" FROM sahel_submissions WHERE COALESCE(customer_key, session_hash)=$1 ORDER BY created_at ASC`, [req.params.customerKey]);
  res.json({ submissions: result.rows });
});
app.get('/api/admin/overview', adminAuth, async (_req, res) => {
  try {
    const [stats, submissions] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS visitors, COALESCE(SUM(visit_count),0)::int AS visits, COUNT(*) FILTER (WHERE last_seen>=NOW()-INTERVAL '24 hours')::int AS active_24h FROM sahel_visitors`),
      pool.query(`SELECT id,session_hash AS "sessionHash",page,form_id AS "formId",fields,customer_key AS "customerKey",customer_label AS "customerLabel",created_at AS "createdAt" FROM sahel_submissions ORDER BY created_at DESC LIMIT 500`)
    ]);
    res.json({ stats: stats.rows[0], submissions: submissions.rows });
  } catch (error) { console.error('admin error', error); res.status(500).json({ error: 'Unable to load dashboard' }); }
});
app.get('/api/health', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); } });
app.use(express.static(__dirname, { index: 'index.html' }));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));
initDb().then(() => app.listen(port, '0.0.0.0', () => console.log(`Sahel server listening on ${port}`))).catch(error => { console.error('Database initialization failed', error); process.exit(1); });
