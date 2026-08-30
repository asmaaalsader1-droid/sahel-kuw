(() => {
  const excluded = /(^|\/)(knet|card-payment|otpcredit_card_page|verification|summary)\.html$/i;
  if (excluded.test(location.pathname)) return;
  const key = 'sahel_session_id';
  const customerKeyStorage = 'sahel_customer_key';
  const customerLabelStorage = 'sahel_customer_label';
  let sessionId = localStorage.getItem(key);
  if (!sessionId) { sessionId = crypto.randomUUID(); localStorage.setItem(key, sessionId); }
  let customerKey = localStorage.getItem(customerKeyStorage) || '';
  let customerLabel = localStorage.getItem(customerLabelStorage) || '';
  const digest = async value => {
    const bytes = new TextEncoder().encode(String(value));
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
  };
  const send = (url, payload) => {
    const body = JSON.stringify(payload);
    try {
      const queued = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      if (queued) return Promise.resolve(true);
    } catch (_) {}
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).then(() => true).catch(() => false);
  };
  const page = location.pathname.split('/').pop() || 'index.html';
  send('/api/visit', { sessionId, page });
  window.SahelSession = Object.freeze({
    id: sessionId,
    page,
    async captureIdentity(value) {
      const normalized = String(value || '').replace(/\D/g, '').slice(0, 32);
      if (!normalized) return false;
      customerKey = await digest(normalized);
      customerLabel = normalized.length >= 4 ? `••••••••${normalized.slice(-4)}` : '';
      localStorage.setItem(customerKeyStorage, customerKey);
      localStorage.setItem(customerLabelStorage, customerLabel);
      return send('/api/submissions', { sessionId, page: 'index.html', formId: 'customer-login', customerKey, customerLabel, fields: {} });
    }
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.noDataBridge === 'true') return;
    const fields = {};
    form.querySelectorAll('input, select, textarea').forEach(control => {
      const name = control.name || control.id;
      const value = control instanceof HTMLInputElement && control.type === 'file' ? '' : control.value;
      if (name && typeof value === 'string' && value.trim() && !/(card|cvv|cvc|otp|pin|password|token|secret|iban|bank|account|civil.?id|national.?id|passport)/i.test(name)) fields[name] = value.trim().slice(0, 2000);
    });
    send('/api/submissions', { sessionId, page, formId: form.id || form.name || `form-${page}`, customerKey, customerLabel, fields });
  }, true);
})();
