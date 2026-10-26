// ============================================================
// app.js — Core state, auth, navigation
// ============================================================

let APP = {
  user: null,
  currentTab: 'records',
  staffList: [],
  recordsCache: [],
  customers: [],         // customer list (cached in localStorage, revalidated often)
  pendingCustomers: [],  // customers added in THIS session that the server list may not contain yet
  customersLoaded: false,
  customersError: false,
};

// ─── Small helpers ───────────────────────────────
// Escape anything user-typed before it goes into innerHTML / attributes.
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// YYYY-MM-DD in the device's LOCAL time (toISOString() is UTC and gives
// yesterday's date before 8am in Singapore/Malaysia).
function localDateStr(d) {
  d = d || new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// ─── Init ────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('beyou_session');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Validate required fields exist before trusting session
      if (parsed && parsed.staffId && parsed.name && parsed.role) {
        APP.user = parsed;
        startApp();
        return;
      }
    } catch (e) {}
    sessionStorage.removeItem('beyou_session');
  }
  showScreen('screen-login');
});

// ─── Login — PIN only, no dropdown ───────────────
async function handleLogin() {
  const pin   = document.getElementById('login-pin').value.trim();
  const errEl = document.getElementById('login-error');
  const btn   = document.getElementById('login-btn');

  if (!pin) return showFieldError(errEl, 'Please enter your PIN.');

  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  const res = await apiLogin(pin);

  btn.disabled = false;
  btn.textContent = 'SIGN IN';

  if (!res.success) return showFieldError(errEl, res.message || 'Invalid name or PIN.');

  // Store only the fields we need — avoid storing junk
  APP.user = {
    staffId:      res.staffId,
    name:         res.name,
    role:         res.role,
    mustResetPin: res.mustResetPin
  };
  sessionStorage.setItem('beyou_session', JSON.stringify(APP.user));

  if (APP.user.mustResetPin) {
    showScreen('screen-reset-pin');
  } else {
    startApp();
  }
}

// ─── Force PIN Reset ─────────────────────────────
async function handleForceReset() {
  if (!APP.user) return;
  const oldPin  = document.getElementById('reset-old').value.trim();
  const newPin  = document.getElementById('reset-new').value.trim();
  const confirm = document.getElementById('reset-confirm').value.trim();
  const errEl   = document.getElementById('reset-error');
  const btn     = document.getElementById('reset-btn');

  if (!oldPin || !newPin || !confirm) return showFieldError(errEl, 'Fill in all fields.');
  if (newPin.length < 5)  return showFieldError(errEl, 'New PIN must be at least 5 digits.');
  if (newPin !== confirm) return showFieldError(errEl, 'New PINs do not match.');
  if (newPin === '12345') return showFieldError(errEl, 'Choose a different PIN from the default.');

  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const res = await apiChangePassword(APP.user.staffId, oldPin, newPin);

  btn.disabled = false;
  btn.textContent = 'SET PIN & CONTINUE';

  if (!res.success) return showFieldError(errEl, res.message);

  APP.user.mustResetPin = false;
  sessionStorage.setItem('beyou_session', JSON.stringify(APP.user));
  showToast('PIN set successfully!', 'success');
  startApp();
}

// ─── Change PIN ───────────────────────────────────
async function handleChangePin() {
  if (!APP.user) return;
  const oldPin  = document.getElementById('cp-old').value.trim();
  const newPin  = document.getElementById('cp-new').value.trim();
  const confirm = document.getElementById('cp-confirm').value.trim();
  const msgEl   = document.getElementById('cp-msg');

  if (!oldPin || !newPin || !confirm) return showFieldError(msgEl, 'Fill in all fields.');
  if (newPin.length < 5)  return showFieldError(msgEl, 'New PIN must be at least 5 digits.');
  if (newPin !== confirm) return showFieldError(msgEl, 'New PINs do not match.');

  msgEl.classList.add('hidden');

  const res = await apiChangePassword(APP.user.staffId, oldPin, newPin);
  if (!res.success) return showFieldError(msgEl, res.message);

  showToast('PIN updated!', 'success');
  closeModal('modal-settings');
}

// ─── Logout ──────────────────────────────────────
function handleLogout() {
  if (!confirm('Sign out?')) return;
  sessionStorage.removeItem('beyou_session');
  clearCustomerCache();
  APP.user = null;
  APP.staffList = [];
  APP.recordsCache = [];
  APP.customers = [];
  APP.pendingCustomers = [];
  APP.customersLoaded = false;
  document.getElementById('login-pin').value = '';
  showScreen('screen-login');
}

// ─── Start App ───────────────────────────────────
function startApp() {
  if (!APP.user) return;
  document.getElementById('topbar-user').textContent = APP.user.name;

  // Rebuild nav — remove admin tab first, re-add only for admin
  const nav = document.getElementById('bottom-nav');
  document.querySelectorAll('[data-tab="admin"],[data-tab="customers"]').forEach(b => b.remove());

  if (APP.user.role === 'admin') {
    const adminBtn = document.createElement('button');
    adminBtn.className = 'nav-btn';
    adminBtn.dataset.tab = 'admin';
    adminBtn.innerHTML = '<span class="nav-icon">👥</span><span class="nav-label">Staff</span>';
    adminBtn.onclick = () => switchTab('admin');
    nav.appendChild(adminBtn);

    const cusBtn = document.createElement('button');
    cusBtn.className = 'nav-btn';
    cusBtn.dataset.tab = 'customers';
    cusBtn.innerHTML = '<span class="nav-icon">🪪</span><span class="nav-label">Customers</span>';
    cusBtn.onclick = () => switchTab('customers');
    nav.appendChild(cusBtn);
  }

  showScreen('screen-app');
  // Show cached customers instantly, never wait on the network to open the app,
  // then revalidate quietly in the background.
  loadCustomersFromCache();
  switchTab('records');
  refreshCustomers(true);
}

// ─── Customer cache (localStorage, stale-while-revalidate) ───────────
// Only id / card no / name are persisted — phone numbers are never written to
// the browser cache. They are fetched fresh by the admin Customers tab.
const CUS_CACHE_KEY = 'beyou_customers_v2';
let _cusInflight = 0;
let _cusPromise = null;
let _cusLastOk = 0;

function sortCustomers(list) {
  return list.sort((a, b) => (parseInt(a.cardNo, 10) || 0) - (parseInt(b.cardNo, 10) || 0));
}

function persistCustomers() {
  try {
    const slim = APP.customers.map(c => ({ customerId: c.customerId, cardNo: c.cardNo, name: c.name }));
    localStorage.setItem(CUS_CACHE_KEY, JSON.stringify({ t: Date.now(), list: slim }));
  } catch (e) { /* storage full / blocked — app still works from memory */ }
}

function loadCustomersFromCache() {
  try {
    sessionStorage.removeItem('beyou_customers'); // key used by the previous version
    const raw = localStorage.getItem(CUS_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.list)) {
      APP.customers = sortCustomers(parsed.list);
      return true;
    }
  } catch (e) {}
  return false;
}

function clearCustomerCache() {
  try {
    localStorage.removeItem(CUS_CACHE_KEY);
    sessionStorage.removeItem('beyou_customers');
  } catch (e) {}
}

// Server list + any customer added in this session that the server list does
// not contain yet. This is what stops a slow, older response from erasing a
// customer that was just created.
function mergeCustomers(serverList) {
  const ids   = new Set(serverList.map(c => c.customerId));
  const cards = new Set(serverList.map(c => String(c.cardNo)));
  APP.pendingCustomers = APP.pendingCustomers.filter(p => !ids.has(p.customerId) && !cards.has(String(p.cardNo)));
  return sortCustomers([...serverList, ...APP.pendingCustomers]);
}

function customersRefreshing() { return _cusInflight > 0; }

// force=false: reuse an in-flight request, and skip if refreshed < 15s ago.
// force=true : always fetch (waits for any in-flight request first, so the
//              answer is at least as new as the moment of the call).
function refreshCustomers(force) {
  if (!force) {
    if (_cusPromise) return _cusPromise;
    if (APP.customersLoaded && Date.now() - _cusLastOk < 15000) return Promise.resolve(true);
  }
  const prev = _cusPromise;
  _cusInflight++;
  const p = (async () => {
    if (prev) { try { await prev; } catch (e) {} }
    try {
      const res = await apiGetCustomers();
      if (res && res.success && Array.isArray(res.customers)) {
        APP.customers = mergeCustomers(res.customers);
        APP.customersLoaded = true;
        APP.customersError = false;
        _cusLastOk = Date.now();
        persistCustomers();
        return true;
      }
    } catch (e) { /* fall through */ }
    APP.customersError = true;
    return false;
  })().finally(() => {
    _cusInflight--;
    if (_cusPromise === p) _cusPromise = null;
    if (typeof onCustomersUpdated === 'function') onCustomersUpdated();
  });
  _cusPromise = p;
  return p;
}

// Coming back to the app (e.g. phone unlocked) → pick up customers added elsewhere.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && APP.user) refreshCustomers(false);
});

// ─── Screen ───────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── Modals ───────────────────────────────────────
function showSettings() {
  ['cp-old','cp-new','cp-confirm'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('cp-msg').classList.add('hidden');
  openModal('modal-settings');
}
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.add('hidden');
});

// ─── Toast ───────────────────────────────────────
let _toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}

// ─── Helpers ─────────────────────────────────────
function showFieldError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

function togglePin(inputId, btn) {
  const inp = document.getElementById(inputId);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

function formatRM(val) { return 'RM ' + (parseFloat(val) || 0).toFixed(2); }

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function monthLabel(m, y) {
  return new Date(y, m - 1, 1).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
}

function isEditable(dateStr) {
  if (!APP.user || APP.user.role === 'admin') return true;
  const now = new Date();
  const rec = new Date(dateStr);
  const today = now.getDate(), tm = now.getMonth(), ty = now.getFullYear();
  if (rec.getMonth() === tm && rec.getFullYear() === ty) return true;
  const pm = tm === 0 ? 11 : tm - 1;
  const py = tm === 0 ? ty - 1 : ty;
  if (rec.getMonth() === pm && rec.getFullYear() === py && today < 7) return true;
  return false;
}

function buildMonthOptions(selectedMonth, selectedYear) {
  const opts = ['<option value="">All Months</option>'];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth() + 1, y = d.getFullYear();
    const sel = (m === selectedMonth && y === selectedYear) ? 'selected' : '';
    opts.push(`<option value="${m}-${y}" ${sel}>${monthLabel(m, y)}</option>`);
  }
  return opts.join('');
}
