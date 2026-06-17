// ============================================================
// api.js — All Google Apps Script communication
// ============================================================

// 🔧 REPLACE THIS with your deployed Apps Script Web App URL
const API_URL = 'https://script.google.com/macros/s/AKfycbw75ZhbyZBt6_iGiASA6YAjUU7Q7TutSXrB-vVGeGGC23YMvmMYVaXIe8ppISudeGMezw/exec';

async function apiCall(action, payload = {}) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('API error:', err);
    return { success: false, message: 'Network error. Check your connection.' };
  }
}

// ─── Auth ────────────────────────────────────────
function apiLogin(name, pin) {
  const deviceInfo = getDeviceInfo();
  return apiCall('login', { name, pin, deviceInfo });
}

function apiChangePassword(staffId, oldPin, newPin) {
  return apiCall('changePassword', { staffId, oldPin, newPin });
}

// ─── Records ─────────────────────────────────────
function apiAddRecord(payload) {
  return apiCall('addRecord', payload);
}

function apiUpdateRecord(payload) {
  return apiCall('updateRecord', payload);
}

function apiGetRecords(staffId, month, year) {
  return apiCall('getRecords', { staffId, month, year });
}

function apiGetAllRecords(role, filterStaffId, month, year) {
  return apiCall('getAllRecords', { role, filterStaffId, month, year });
}

// ─── Staff (Admin) ────────────────────────────────
function apiGetStaffList(role) {
  return apiCall('getStaffList', { role });
}

function apiAddStaff(name, staffRole, role, adminId) {
  return apiCall('addStaff', { name, staffRole, role, adminId });
}

function apiUpdateStaff(staffId, name, staffRole, role) {
  return apiCall('updateStaff', { staffId, name, staffRole, role });
}

function apiResetStaffPin(targetStaffId, role, adminId) {
  return apiCall('resetStaffPin', { targetStaffId, role, adminId });
}

function apiGetAuditLog(role) {
  return apiCall('getAuditLog', { role });
}

// ─── Device fingerprint (for silent logging) ─────
function getDeviceInfo() {
  return [
    navigator.userAgent,
    screen.width + 'x' + screen.height,
    navigator.language,
    new Date().getTimezoneOffset()
  ].join('|');
}
