// ============================================================
// BE YOU SKIN MANAGEMENT — Commission Tracker Backend
// Google Apps Script (Deploy as Web App)
// ============================================================

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const ss = SpreadsheetApp.getActiveSpreadsheet();

// Sheet names
const SHEETS = {
  STAFF: 'Staff',
  RECORDS: 'Records',
  AUDIT: 'AuditLog'
};

// ============================================================
// WEB APP ENTRY POINT
// ============================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    const handlers = {
      'login': handleLogin,
      'changePassword': handleChangePassword,
      'addRecord': handleAddRecord,
      'updateRecord': handleUpdateRecord,
      'getRecords': handleGetRecords,
      'getAllRecords': handleGetAllRecords,
      'getStaffList': handleGetStaffList,
      'addStaff': handleAddStaff,
      'updateStaff': handleUpdateStaff,
      'resetStaffPin': handleResetStaffPin,
      'getAuditLog': handleGetAuditLog,
    };

    if (!handlers[action]) return respond(false, 'Unknown action');
    return handlers[action](data);

  } catch (err) {
    return respond(false, 'Server error: ' + err.message);
  }
}

function doGet(e) {
  return ContentService.createTextOutput('Be You Commission API is running.');
}

// ============================================================
// SETUP — Run once to initialise sheets
// ============================================================
function setupSheets() {
  setupStaffSheet();
  setupRecordsSheet();
  setupAuditSheet();
}

function setupStaffSheet() {
  let sheet = ss.getSheetByName(SHEETS.STAFF);
  if (!sheet) sheet = ss.insertSheet(SHEETS.STAFF);
  sheet.clearContents();
  sheet.appendRow(['StaffID', 'Name', 'PIN', 'Role', 'MustResetPin', 'DeviceInfo', 'CreatedAt']);
  // Default admin
  sheet.appendRow(['ADMIN001', 'Manager', hashPin('12345'), 'admin', 'FALSE', '', new Date().toISOString()]);
}

function setupRecordsSheet() {
  let sheet = ss.getSheetByName(SHEETS.RECORDS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.RECORDS);
  sheet.clearContents();
  sheet.appendRow(['RecordID', 'StaffID', 'StaffName', 'Date', 'CustomerName', 'Project', 'Massage', 'Product', 'TotalSales', 'Remarks', 'CreatedAt', 'UpdatedAt']);
}

function setupAuditSheet() {
  let sheet = ss.getSheetByName(SHEETS.AUDIT);
  if (!sheet) sheet = ss.insertSheet(SHEETS.AUDIT);
  sheet.clearContents();
  sheet.appendRow(['Timestamp', 'StaffID', 'StaffName', 'Action', 'DeviceInfo', 'Details']);
}

// ============================================================
// AUTH HANDLERS
// ============================================================
function handleLogin(data) {
  const { name, pin, deviceInfo } = data;
  const sheet = ss.getSheetByName(SHEETS.STAFF);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const [staffId, staffName, storedPin, role, mustReset, , ] = rows[i];
    if (staffName.toLowerCase() === name.toLowerCase() && storedPin === hashPin(pin)) {
      // Update device info
      sheet.getRange(i + 1, 6).setValue(deviceInfo || '');
      sheet.getRange(i + 1, 7).setValue(new Date().toISOString());

      // Log login
      logAudit(staffId, staffName, 'LOGIN', deviceInfo, '');

      return respond(true, 'Login successful', {
        staffId, name: staffName, role,
        mustResetPin: mustReset === true || mustReset === 'TRUE'
      });
    }
  }
  return respond(false, 'Invalid name or PIN');
}

function handleChangePassword(data) {
  const { staffId, oldPin, newPin } = data;
  const sheet = ss.getSheetByName(SHEETS.STAFF);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === staffId) {
      if (rows[i][2] !== hashPin(oldPin)) return respond(false, 'Current PIN is incorrect');
      sheet.getRange(i + 1, 3).setValue(hashPin(newPin));
      sheet.getRange(i + 1, 5).setValue('FALSE');
      logAudit(staffId, rows[i][1], 'CHANGE_PIN', '', '');
      return respond(true, 'PIN changed successfully');
    }
  }
  return respond(false, 'Staff not found');
}

// ============================================================
// RECORD HANDLERS
// ============================================================
function handleAddRecord(data) {
  const { staffId, staffName, date, customerName, project, massage, product, totalSales, remarks } = data;
  const sheet = ss.getSheetByName(SHEETS.RECORDS);
  const recordId = 'REC' + Date.now();
  const now = new Date().toISOString();

  sheet.appendRow([
    recordId, staffId, staffName, date, customerName,
    project || 0, massage || 0, product || 0, totalSales || 0,
    remarks || '', now, now
  ]);

  logAudit(staffId, staffName, 'ADD_RECORD', '', 'Customer: ' + customerName);
  return respond(true, 'Record added', { recordId });
}

function handleUpdateRecord(data) {
  const { recordId, staffId, role, date, customerName, project, massage, product, totalSales, remarks } = data;

  // Lock check — only current + previous month editable, locks on 7th
  if (!canEditRecord(date, role)) {
    return respond(false, 'This record is locked and cannot be edited');
  }

  const sheet = ss.getSheetByName(SHEETS.RECORDS);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === recordId) {
      // Staff can only edit own records
      if (role !== 'admin' && rows[i][1] !== staffId) {
        return respond(false, 'Unauthorized');
      }
      sheet.getRange(i + 1, 4).setValue(date);
      sheet.getRange(i + 1, 5).setValue(customerName);
      sheet.getRange(i + 1, 6).setValue(project || 0);
      sheet.getRange(i + 1, 7).setValue(massage || 0);
      sheet.getRange(i + 1, 8).setValue(product || 0);
      sheet.getRange(i + 1, 9).setValue(totalSales || 0);
      sheet.getRange(i + 1, 10).setValue(remarks || '');
      sheet.getRange(i + 1, 12).setValue(new Date().toISOString());
      logAudit(staffId, '', 'UPDATE_RECORD', '', 'RecordID: ' + recordId);
      return respond(true, 'Record updated');
    }
  }
  return respond(false, 'Record not found');
}

function handleGetRecords(data) {
  const { staffId, month, year } = data; // month = 1-12
  const sheet = ss.getSheetByName(SHEETS.RECORDS);
  const rows = sheet.getDataRange().getValues();
  const records = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[1] !== staffId) continue;
    if (month && year) {
      const d = new Date(row[3]);
      if (d.getMonth() + 1 !== parseInt(month) || d.getFullYear() !== parseInt(year)) continue;
    }
    records.push(rowToRecord(row));
  }
  return respond(true, 'OK', { records });
}

function handleGetAllRecords(data) {
  const { role, filterStaffId, month, year } = data;
  if (role !== 'admin') return respond(false, 'Unauthorized');

  const sheet = ss.getSheetByName(SHEETS.RECORDS);
  const rows = sheet.getDataRange().getValues();
  const records = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (filterStaffId && row[1] !== filterStaffId) continue;
    if (month && year) {
      const d = new Date(row[3]);
      if (d.getMonth() + 1 !== parseInt(month) || d.getFullYear() !== parseInt(year)) continue;
    }
    records.push(rowToRecord(row));
  }
  return respond(true, 'OK', { records });
}

// ============================================================
// STAFF MANAGEMENT (Admin only)
// ============================================================
function handleGetStaffList(data) {
  const sheet = ss.getSheetByName(SHEETS.STAFF);
  const rows = sheet.getDataRange().getValues();
  const staff = [];
  // Public: names only for login dropdown. Admin: full details.
  for (let i = 1; i < rows.length; i++) {
    if (data.role === 'admin') {
      staff.push({ staffId: rows[i][0], name: rows[i][1], role: rows[i][3], mustResetPin: rows[i][4] });
    } else {
      staff.push({ name: rows[i][1] });
    }
  }
  return respond(true, 'OK', { staff });
}

function handleAddStaff(data) {
  if (data.role !== 'admin') return respond(false, 'Unauthorized');
  const sheet = ss.getSheetByName(SHEETS.STAFF);
  const staffId = 'STF' + Date.now();
  sheet.appendRow([staffId, data.name, hashPin('12345'), data.staffRole || 'staff', 'TRUE', '', new Date().toISOString()]);
  logAudit(data.adminId, 'Admin', 'ADD_STAFF', '', 'Added: ' + data.name);
  return respond(true, 'Staff added', { staffId });
}

function handleUpdateStaff(data) {
  if (data.role !== 'admin') return respond(false, 'Unauthorized');
  const sheet = ss.getSheetByName(SHEETS.STAFF);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.staffId) {
      if (data.name) sheet.getRange(i + 1, 2).setValue(data.name);
      if (data.staffRole) sheet.getRange(i + 1, 4).setValue(data.staffRole);
      return respond(true, 'Staff updated');
    }
  }
  return respond(false, 'Staff not found');
}

function handleResetStaffPin(data) {
  if (data.role !== 'admin') return respond(false, 'Unauthorized');
  const sheet = ss.getSheetByName(SHEETS.STAFF);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.targetStaffId) {
      sheet.getRange(i + 1, 3).setValue(hashPin('12345'));
      sheet.getRange(i + 1, 5).setValue('TRUE');
      logAudit(data.adminId, 'Admin', 'RESET_PIN', '', 'Reset PIN for: ' + rows[i][1]);
      return respond(true, 'PIN reset to 12345');
    }
  }
  return respond(false, 'Staff not found');
}

function handleGetAuditLog(data) {
  if (data.role !== 'admin') return respond(false, 'Unauthorized');
  const sheet = ss.getSheetByName(SHEETS.AUDIT);
  const rows = sheet.getDataRange().getValues();
  const logs = [];
  for (let i = Math.max(1, rows.length - 100); i < rows.length; i++) {
    logs.push({ timestamp: rows[i][0], staffId: rows[i][1], name: rows[i][2], action: rows[i][3], device: rows[i][4], details: rows[i][5] });
  }
  return respond(true, 'OK', { logs: logs.reverse() });
}

// ============================================================
// HELPERS
// ============================================================
function canEditRecord(dateStr, role) {
  if (role === 'admin') return true;
  const now = new Date();
  const recordDate = new Date(dateStr);
  const today = now.getDate();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  // Current month always editable
  if (recordDate.getMonth() === thisMonth && recordDate.getFullYear() === thisYear) return true;

  // Previous month editable only before 7th
  const prevMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const prevYear = thisMonth === 0 ? thisYear - 1 : thisYear;
  if (recordDate.getMonth() === prevMonth && recordDate.getFullYear() === prevYear && today < 7) return true;

  return false;
}

function rowToRecord(row) {
  return {
    recordId: row[0], staffId: row[1], staffName: row[2],
    date: row[3], customerName: row[4],
    project: row[5], massage: row[6], product: row[7],
    totalSales: row[8], remarks: row[9],
    createdAt: row[10], updatedAt: row[11]
  };
}

function hashPin(pin) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin + 'BEYOU_SALT')
    .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

function logAudit(staffId, name, action, deviceInfo, details) {
  const sheet = ss.getSheetByName(SHEETS.AUDIT);
  if (!sheet) return;
  sheet.appendRow([new Date().toISOString(), staffId, name, action, deviceInfo || '', details || '']);
}

function respond(success, message, data = {}) {
  return ContentService.createTextOutput(JSON.stringify({ success, message, ...data }))
    .setMimeType(ContentService.MimeType.JSON);
}
