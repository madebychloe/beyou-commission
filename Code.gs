// ============================================================
// BE YOU SKIN MANAGEMENT — Commission Tracker Backend
// Google Apps Script (Deploy as Web App)
// ============================================================

const ss = SpreadsheetApp.getActiveSpreadsheet();

const SHEETS = {
  STAFF: 'Staff',
  RECORDS: 'Records',
  AUDIT: 'AuditLog',
  CUSTOMERS: 'Customers'
};

// ============================================================
// WEB APP ENTRY POINT
// GET is used for all requests (avoids CORS preflight)
// Action and payload passed as query params: ?action=login&payload={...}
// ============================================================
function doGet(e) {
  try {
    const action = e.parameter.action;
    const payload = e.parameter.payload ? JSON.parse(e.parameter.payload) : {};

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
      'deleteRecord': handleDeleteRecord,
      'getCustomers': handleGetCustomers,
      'addCustomer': handleAddCustomer,
    };

    if (!action) return respond(true, 'Be You Commission API is running.');
    if (!handlers[action]) return respond(false, 'Unknown action: ' + action);
    return handlers[action](payload);

  } catch (err) {
    return respond(false, 'Server error: ' + err.message);
  }
}

// Keep doPost as fallback
function doPost(e) {
  return doGet(e);
}

// ============================================================
// SETUP
// ============================================================
function setupSheets() {
  setupStaffSheet();
  setupRecordsSheet();
  setupAuditSheet();
  setupCustomerSheet();
}

function setupStaffSheet() {
  let sheet = ss.getSheetByName(SHEETS.STAFF);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.STAFF);
    sheet.appendRow(['StaffID', 'Name', 'PIN', 'Role', 'MustResetPin', 'DeviceInfo', 'CreatedAt']);
    sheet.appendRow(['ADMIN001', 'Manager', hashPin('Manager123'), 'admin', 'TRUE', '', new Date().toISOString()]);
    Logger.log('Staff sheet created with default Manager account (PIN: Manager123)');
  } else {
    Logger.log('Staff sheet already exists — skipped to preserve data');
  }
}

function setupRecordsSheet() {
  let sheet = ss.getSheetByName(SHEETS.RECORDS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.RECORDS);
    sheet.appendRow(['RecordID', 'StaffID', 'StaffName', 'Date', 'CustomerID', 'CardNo', 'CustomerName', 'Project', 'Massage', 'Product', 'TotalSales', 'Remarks', 'CreatedAt', 'UpdatedAt']);
    Logger.log('Records sheet created');
  } else {
    Logger.log('Records sheet already exists — skipped to preserve data');
  }
}

function setupAuditSheet() {
  let sheet = ss.getSheetByName(SHEETS.AUDIT);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.AUDIT);
    sheet.appendRow(['Timestamp', 'StaffID', 'StaffName', 'Action', 'DeviceInfo', 'Details']);
    Logger.log('AuditLog sheet created');
  } else {
    Logger.log('AuditLog sheet already exists — skipped to preserve data');
  }
}

function setupCustomerSheet() {
  let sheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.CUSTOMERS);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['CustomerID', 'CardNo', 'CustomerName', 'Phone', 'CreatedAt']);
  }
}

function clearRecords() {
  // Wipe all records except header row
  const sheet = ss.getSheetByName(SHEETS.RECORDS);
  if (sheet && sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }
  Logger.log('All records cleared');
}

// ============================================================
// AUTH
// ============================================================
function handleLogin(data) {
  const { pin, deviceInfo } = data;
  const sheet = ss.getSheetByName(SHEETS.STAFF);
  const rows = sheet.getDataRange().getValues();
  const hashed = hashPin(pin);

  for (let i = 1; i < rows.length; i++) {
    const [staffId, staffName, storedPin, role, mustReset] = rows[i];
    if (storedPin === hashed) {
      sheet.getRange(i + 1, 6).setValue(deviceInfo || '');
      sheet.getRange(i + 1, 7).setValue(new Date().toISOString());
      logAudit(staffId, staffName, 'LOGIN', deviceInfo, '');
      return respond(true, 'Login successful', {
        staffId, name: staffName, role,
        mustResetPin: mustReset === true || mustReset === 'TRUE'
      });
    }
  }
  return respond(false, 'Invalid PIN. Please try again.');
}

function handleChangePassword(data) {
  const { staffId, oldPin, newPin } = data;
  const sheet = ss.getSheetByName(SHEETS.STAFF);
  const rows = sheet.getDataRange().getValues();

  // Check new PIN is not already used by another staff
  const hashedNew = hashPin(newPin);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== staffId && rows[i][2] === hashedNew) {
      return respond(false, 'This PIN is already used by another staff. Please choose a different PIN.');
    }
  }

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === staffId) {
      if (rows[i][2] !== hashPin(oldPin)) return respond(false, 'Current PIN is incorrect.');
      sheet.getRange(i + 1, 3).setValue(hashedNew);
      sheet.getRange(i + 1, 5).setValue('FALSE');
      logAudit(staffId, rows[i][1], 'CHANGE_PIN', '', '');
      return respond(true, 'PIN changed successfully');
    }
  }
  return respond(false, 'Staff not found');
}

// ============================================================
// RECORDS
// ============================================================
function handleAddRecord(data) {
  const { staffId, staffName, date, customerId, cardNo, customerName, project, massage, product, totalSales, remarks } = data;
  const sheet = ss.getSheetByName(SHEETS.RECORDS);
  const recordId = 'REC' + Date.now();
  const now = new Date().toISOString();
  sheet.appendRow([recordId, staffId, staffName, date, customerId || '', cardNo || '', customerName,
    project || 0, massage || 0, product || 0, totalSales || 0, remarks || '', now, now]);
  logAudit(staffId, staffName, 'ADD_RECORD', '', 'Customer: ' + customerName);
  return respond(true, 'Record added', { recordId });
}

function handleUpdateRecord(data) {
  const { recordId, staffId, role, date, customerName, project, massage, product, totalSales, remarks } = data;
  if (!canEditRecord(date, role)) return respond(false, 'This record is locked and cannot be edited');
  const sheet = ss.getSheetByName(SHEETS.RECORDS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === recordId) {
      if (role !== 'admin' && rows[i][1] !== staffId) return respond(false, 'Unauthorized');
      sheet.getRange(i + 1, 4).setValue(date);
      sheet.getRange(i + 1, 5).setValue(data.customerId || rows[i][4]);
      sheet.getRange(i + 1, 6).setValue(data.cardNo || rows[i][5]);
      sheet.getRange(i + 1, 7).setValue(customerName);
      sheet.getRange(i + 1, 8).setValue(project || 0);
      sheet.getRange(i + 1, 9).setValue(massage || 0);
      sheet.getRange(i + 1, 10).setValue(product || 0);
      sheet.getRange(i + 1, 11).setValue(totalSales || 0);
      sheet.getRange(i + 1, 12).setValue(remarks || '');
      sheet.getRange(i + 1, 14).setValue(new Date().toISOString());
      logAudit(staffId, '', 'UPDATE_RECORD', '', 'RecordID: ' + recordId);
      return respond(true, 'Record updated');
    }
  }
  return respond(false, 'Record not found');
}

function handleGetRecords(data) {
  const { staffId, month, year } = data;
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
// STAFF MANAGEMENT
// ============================================================
function handleGetStaffList(data) {
  const sheet = ss.getSheetByName(SHEETS.STAFF);
  const rows = sheet.getDataRange().getValues();
  const staff = [];
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
  // Default PIN = first word of name (surname) + 123, e.g. "Tan Wei" -> "Tan123"
  const surname = data.name.trim().split(' ')[0];
  const defaultPin = surname + '123';
  sheet.appendRow([staffId, data.name, hashPin(defaultPin), data.staffRole || 'staff', 'TRUE', '', new Date().toISOString()]);
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
      const surname = rows[i][1].trim().split(' ')[0];
      const defaultPin = surname + '123';
      sheet.getRange(i + 1, 3).setValue(hashPin(defaultPin));
      sheet.getRange(i + 1, 5).setValue('TRUE');
      logAudit(data.adminId, 'Admin', 'RESET_PIN', '', 'Reset PIN for: ' + rows[i][1]);
      return respond(true, 'PIN reset to ' + defaultPin);
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
// CUSTOMER HANDLERS
// ============================================================
function handleGetCustomers(data) {
  const sheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  if (!sheet) return respond(true, 'OK', { customers: [] });
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return respond(true, 'OK', { customers: [] });

  // Detect column positions from header row — handles any column order
  const header = rows[0].map(h => String(h).toLowerCase().trim());
  const colId    = header.indexOf('customerid');
  const colCard  = header.indexOf('cardno');
  const colName  = header.indexOf('customername');
  const colPhone = header.indexOf('phone');

  // Fallback to fixed positions if headers not found
  const idIdx    = colId    >= 0 ? colId    : 0;
  const cardIdx  = colCard  >= 0 ? colCard  : 1;
  const nameIdx  = colName  >= 0 ? colName  : 2;
  const phoneIdx = colPhone >= 0 ? colPhone : 3;

  const customers = [];
  for (let i = 1; i < rows.length; i++) {
    const name = String(rows[i][nameIdx] || '').trim();
    if (!name) continue; // skip empty rows
    // Strip leading apostrophe (used to force text format in Sheets) and pad to 4 digits
    const rawCard = String(rows[i][cardIdx] || '').trim().replace(/^'+/, '');
    const paddedCard = rawCard ? String(parseInt(rawCard) || rawCard).padStart(4, '0') : '';
    customers.push({
      customerId: String(rows[i][idIdx]  || '').trim(),
      cardNo:     paddedCard,
      name:       name,
      phone:      String(rows[i][phoneIdx] || '').trim()
    });
  }
  return respond(true, 'OK', { customers });
}

function handleAddCustomer(data) {
  const { name, cardNo, phone } = data;
  if (!name || !cardNo) return respond(false, 'Name and Card No are required.');

  const sheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  const rows = sheet.getDataRange().getValues();

  // Validate card no is pure number
  const cardNoRaw = String(cardNo).trim().replace(/^0+/, '') || '0';
  if (!/^[0-9]+$/.test(cardNoRaw)) {
    return respond(false, 'Card No must be numbers only.');
  }
  if (parseInt(cardNoRaw) > 9999) {
    return respond(false, 'Card No must be 4 digits or less (0001–9999).');
  }
  // Always store as 4-digit padded string with leading apostrophe to force text in Sheets
  const paddedCardNo = String(parseInt(cardNoRaw)).padStart(4, '0');

  // Check CardNo uniqueness (CardNo is always column B = index 1)
  for (let i = 1; i < rows.length; i++) {
    const existing = String(rows[i][1] || '').trim().replace(/^'+/, '');
    if (existing === paddedCardNo) {
      return respond(false, 'Card No ' + paddedCardNo + ' already exists. Please use a different number.');
    }
  }

  // Auto-increment CustomerID — find highest existing number
  let maxId = 0;
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][0]);
    if (id.startsWith('CUS')) {
      const num = parseInt(id.replace('CUS', '')) || 0;
      if (num > maxId) maxId = num;
    }
  }
  const nextId = 'CUS' + String(maxId + 1).padStart(4, '0');

  // Prepend apostrophe to force Google Sheets to treat as text (preserves leading zeros)
  sheet.appendRow([nextId, "'" + paddedCardNo, name.trim(), phone || '', new Date().toISOString()]);
  logAudit(data.staffId || '', data.staffName || '', 'ADD_CUSTOMER', '', 'Customer: ' + name);
  return respond(true, 'Customer added', { customerId: nextId });
}

function handleDeleteRecord(data) {
  const { recordId, staffId, role } = data;

  // Same lock rule as edit
  const sheet = ss.getSheetByName(SHEETS.RECORDS);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === recordId) {
      // Staff can only delete own records
      if (role !== 'admin' && rows[i][1] !== staffId) {
        return respond(false, 'Unauthorized');
      }
      // Check lock rule
      if (!canEditRecord(rows[i][3], role)) {
        return respond(false, 'This record is locked and cannot be deleted');
      }
      sheet.deleteRow(i + 1);
      logAudit(staffId, '', 'DELETE_RECORD', '', 'RecordID: ' + recordId);
      return respond(true, 'Record deleted');
    }
  }
  return respond(false, 'Record not found');
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
  if (recordDate.getMonth() === thisMonth && recordDate.getFullYear() === thisYear) return true;
  const prevMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const prevYear = thisMonth === 0 ? thisYear - 1 : thisYear;
  if (recordDate.getMonth() === prevMonth && recordDate.getFullYear() === prevYear && today < 7) return true;
  return false;
}

function rowToRecord(row) {
  // Format date as YYYY-MM-DD string — Sheets returns Date objects
  let dateStr = '';
  if (row[3]) {
    const d = new Date(row[3]);
    if (!isNaN(d)) {
      dateStr = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    } else {
      dateStr = String(row[3]).split('T')[0];
    }
  }
  return {
    recordId: row[0], staffId: row[1], staffName: row[2],
    date: dateStr, customerId: row[4], cardNo: row[5], customerName: row[6],
    project: row[7], massage: row[8], product: row[9],
    totalSales: row[10], remarks: row[11],
    createdAt: row[12], updatedAt: row[13]
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


// ============================================================
// ONE-TIME REPAIR — Run once to fix CustomerIDs
// ============================================================
function repairCardNos() {
  // Forces CardNo column to text format and pads all values to 4 digits
  const sheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  const rows = sheet.getDataRange().getValues();
  const header = rows[0].map(h => String(h).toLowerCase().trim());
  const cardIdx = header.indexOf('cardno');
  const col = (cardIdx >= 0 ? cardIdx : 1) + 1; // 1-based for getRange

  // Set entire column to text format
  sheet.getRange(2, col, sheet.getLastRow() - 1, 1).setNumberFormat('@');

  let fixed = 0;
  for (let i = 1; i < rows.length; i++) {
    const raw = String(rows[i][col - 1] || '').trim().replace(/^'+/, '');
    if (!raw || isNaN(parseInt(raw))) continue;
    const padded = String(parseInt(raw)).padStart(4, '0');
    if (raw !== padded) {
      sheet.getRange(i + 1, col).setValue(padded);
      fixed++;
    }
  }
  Logger.log('repairCardNos: fixed ' + fixed + ' card numbers to 4-digit format');
}

function repairCustomerIDs() {
  const sheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  const rows = sheet.getDataRange().getValues();
  
  // Skip header row
  let counter = 1;
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][2]) continue; // skip empty rows (no name)
    const newId = 'CUS' + String(counter).padStart(4, '0');
    sheet.getRange(i + 1, 1).setValue(newId);
    counter++;
  }
  Logger.log('Fixed ' + (counter - 1) + ' customer IDs. Last ID: CUS' + String(counter-1).padStart(4, '0'));
}

function respond(success, message, data = {}) {
  return ContentService.createTextOutput(JSON.stringify({ success, message, ...data }))
    .setMimeType(ContentService.MimeType.JSON);
}
