// ============================================================
// app.js — Core state, auth, navigation
// ============================================================

let APP = {
  user: null,
  currentTab: 'records',
  staffList: [],
  recordsCache: [],
  customers: [],      // cached customer list, loaded on login
};

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
  sessionStorage.removeItem('beyou_customers');
  APP.user = null;
  APP.staffList = [];
  APP.recordsCache = [];
  APP.customers = [];
  document.getElementById('login-pin').value = '';
  showScreen('screen-login');
}

// ─── Start App ───────────────────────────────────
function startApp() {
  if (!APP.user) return;
  document.getElementById('topbar-user').textContent = APP.user.name;

  // Rebuild nav — remove admin tab first, re-add only for admin
  const nav = document.getElementById('bottom-nav');
  const existing = document.querySelector('[data-tab="admin"]');
  if (existing) existing.remove();

  if (APP.user.role === 'admin') {
    const adminBtn = document.createElement('button');
    adminBtn.className = 'nav-btn';
    adminBtn.dataset.tab = 'admin';
    adminBtn.innerHTML = '<span class="nav-icon">👥</span><span class="nav-label">Staff</span>';
    adminBtn.onclick = () => switchTab('admin');
    nav.appendChild(adminBtn);
  }

  showScreen('screen-app');
  loadCustomers().then(() => switchTab('records'));
}

async function loadCustomers() {
  // Try sessionStorage first
  const cached = sessionStorage.getItem('beyou_customers');
  if (cached) {
    try {
      APP.customers = JSON.parse(cached);
      return;
    } catch(e) {}
  }
  // Fetch from API
  const res = await apiGetCustomers();
  if (res.success && res.customers) {
    APP.customers = res.customers;
    sessionStorage.setItem('beyou_customers', JSON.stringify(APP.customers));
  }
}

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
