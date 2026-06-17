// ============================================================
// app.js — Core state, auth, navigation
// ============================================================

// ─── App State ───────────────────────────────────
let APP = {
  user: null,        // { staffId, name, role, mustResetPin }
  currentTab: 'records',
  staffList: [],     // cached for admin dropdowns
};

// ─── Init ────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Try restore session from sessionStorage
  const saved = sessionStorage.getItem('beyou_session');
  if (saved) {
    try {
      APP.user = JSON.parse(saved);
      startApp();
      return;
    } catch (e) { sessionStorage.removeItem('beyou_session'); }
  }
  loadStaffDropdown();
  showScreen('screen-login');
});

// ─── Load staff names for login dropdown ─────────
async function loadStaffDropdown() {
  // We load staff names from a public-readable endpoint
  // For simplicity, pre-populate from API (staff list names only, no PINs)
  const res = await apiCall('getStaffList', { role: 'public' });
  const sel = document.getElementById('login-name');
  if (res.success && res.staff) {
    res.staff.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
  }
}

// ─── Login ───────────────────────────────────────
async function handleLogin() {
  const name = document.getElementById('login-name').value.trim();
  const pin  = document.getElementById('login-pin').value.trim();
  const errEl = document.getElementById('login-error');

  if (!name) return showFieldError(errEl, 'Please select your name.');
  if (!pin)  return showFieldError(errEl, 'Please enter your PIN.');

  errEl.classList.add('hidden');
  setLoadingBtn('Sign In');

  const res = await apiLogin(name, pin);

  if (!res.success) {
    return showFieldError(errEl, res.message || 'Login failed. Check your name and PIN.');
  }

  APP.user = res;
  sessionStorage.setItem('beyou_session', JSON.stringify(APP.user));

  if (res.mustResetPin) {
    showScreen('screen-reset-pin');
  } else {
    startApp();
  }
}

// ─── Force PIN Reset ─────────────────────────────
async function handleForceReset() {
  const oldPin     = document.getElementById('reset-old').value.trim();
  const newPin     = document.getElementById('reset-new').value.trim();
  const confirmPin = document.getElementById('reset-confirm').value.trim();
  const errEl      = document.getElementById('reset-error');

  if (!oldPin || !newPin || !confirmPin) return showFieldError(errEl, 'Fill in all fields.');
  if (newPin.length < 5) return showFieldError(errEl, 'New PIN must be at least 5 digits.');
  if (newPin !== confirmPin) return showFieldError(errEl, 'New PINs do not match.');
  if (newPin === '12345') return showFieldError(errEl, 'Choose a different PIN from the default.');

  errEl.classList.add('hidden');

  const res = await apiChangePassword(APP.user.staffId, oldPin, newPin);

  if (!res.success) return showFieldError(errEl, res.message);

  APP.user.mustResetPin = false;
  sessionStorage.setItem('beyou_session', JSON.stringify(APP.user));
  showToast('PIN set successfully!', 'success');
  startApp();
}

// ─── Change PIN (from Settings) ──────────────────
async function handleChangePin() {
  const oldPin  = document.getElementById('cp-old').value.trim();
  const newPin  = document.getElementById('cp-new').value.trim();
  const confirm = document.getElementById('cp-confirm').value.trim();
  const msgEl   = document.getElementById('cp-msg');

  if (!oldPin || !newPin || !confirm) return showFieldError(msgEl, 'Fill in all fields.');
  if (newPin.length < 5) return showFieldError(msgEl, 'New PIN must be at least 5 digits.');
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
  APP.user = null;
  APP.staffList = [];
  // Clear fields
  document.getElementById('login-pin').value = '';
  document.getElementById('login-name').value = '';
  showScreen('screen-login');
  loadStaffDropdown();
}

// ─── Start App ───────────────────────────────────
function startApp() {
  document.getElementById('topbar-user').textContent = APP.user.name;

  // Show/hide admin tab — always remove first, then re-add only for admin
  const nav = document.getElementById('bottom-nav');
  const existingAdminBtn = document.querySelector('[data-tab="admin"]');
  if (existingAdminBtn) existingAdminBtn.remove();

  if (APP.user.role === 'admin') {
    const adminBtn = document.createElement('button');
    adminBtn.className = 'nav-btn';
    adminBtn.dataset.tab = 'admin';
    adminBtn.innerHTML = '<span class="nav-icon">👥</span><span class="nav-label">Staff</span>';
    adminBtn.onclick = () => switchTab('admin');
    nav.appendChild(adminBtn);
  }

  showScreen('screen-app');
  switchTab('records');
}

// ─── Screen management ───────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── Modal ───────────────────────────────────────
function showSettings() {
  // Clear fields
  ['cp-old','cp-new','cp-confirm'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('cp-msg').classList.add('hidden');
  openModal('modal-settings');
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// Tap outside modal to close
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
  }
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
function showFieldError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function setLoadingBtn(label) {
  // Minimal — could expand if needed
}

function togglePin(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}

function formatRM(val) {
  const n = parseFloat(val) || 0;
  return 'RM ' + n.toFixed(2);
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function monthLabel(m, y) {
  return new Date(y, m - 1, 1).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
}

// Is record editable?
function isEditable(dateStr) {
  if (APP.user.role === 'admin') return true;
  const now = new Date();
  const rec = new Date(dateStr);
  const today = now.getDate();
  const tm = now.getMonth(), ty = now.getFullYear();
  if (rec.getMonth() === tm && rec.getFullYear() === ty) return true;
  const pm = tm === 0 ? 11 : tm - 1;
  const py = tm === 0 ? ty - 1 : ty;
  if (rec.getMonth() === pm && rec.getFullYear() === py && today < 7) return true;
  return false;
}

// Generate month options (last 12 months)
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
