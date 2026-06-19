// ============================================================
// api.js — Google Apps Script communication via GET (no CORS issues)
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbw18RPVjlE3f0j-NdF7FRDCUr8uc0LVzV6B31JMeGojIkoCU2kAMuqJzD-kVrxvSuW0oA/exec';

async function apiCall(action, payload = {}) {
  try {
    // Use GET with query params — avoids CORS preflight entirely
    const params = new URLSearchParams({
      action: action,
      payload: JSON.stringify(payload)
    });
    const res = await fetch(`${API_URL}?${params.toString()}`, {
      method: 'GET',
      redirect: 'follow'
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('API error:', err);
    return { success: false, message: 'Network error. Check your connection.' };
  }
}

// ─── Auth ────────────────────────────────────────
function apiLogin(pin) {
  return apiCall('login', { pin, deviceInfo: getDeviceInfo() });
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

function apiDeleteRecord(recordId, staffId, role) {
  return apiCall('deleteRecord', { recordId, staffId, role });
}

function apiGetCustomers() {
  return apiCall('getCustomers', {});
}

function apiAddCustomer(name, cardNo, phone, staffId, staffName) {
  return apiCall('addCustomer', { name, cardNo, phone, staffId, staffName });
}

// ─── Device info (silent logging) ────────────────
function getDeviceInfo() {
  return [navigator.userAgent, screen.width + 'x' + screen.height, navigator.language].join('|');
}
