// ============================================================
// tabs.js — Tab rendering
// ============================================================

function switchTab(tab) {
  if (!APP.user) return; // guard against null user
  APP.currentTab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  const main = document.getElementById('app-main');
  main.innerHTML = '<div class="loading"><span class="spinner"></span>Loading…</div>';
  switch(tab) {
    case 'records':   renderRecordsTab(main); break;
    case 'add':       renderAddTab(main); break;
    case 'dashboard': renderDashboardTab(main); break;
    case 'admin':     renderAdminTab(main); break;
    case 'customers': renderCustomersTab(main); break;
  }
}

// ═══════════════════════════════════════════════
// RECORDS TAB
// ═══════════════════════════════════════════════
async function renderRecordsTab(main) {
  if (!APP.user) return;
  const { month, year } = getMonthYear();
  let selMonth = month, selYear = year;
  let staffFilterId = '';

  // For admin: load staff list first (needed for filter dropdown)
  if (APP.user.role === 'admin' && APP.staffList.length === 0) {
    const staffRes = await apiGetStaffList(APP.user.role);
    if (staffRes.success) APP.staffList = staffRes.staff;
  }

  const staffFilterHtml = APP.user.role === 'admin'
    ? `<select id="filter-staff" onchange="onFilterChange()">
        <option value="">All Staff</option>
        ${APP.staffList.map(s => `<option value="${s.staffId}">${s.name}</option>`).join('')}
      </select>` : '';

  main.innerHTML = `
    <div class="page-header"><h2 class="page-title">Records</h2></div>
    <div class="filter-bar">
      <select id="filter-month" onchange="onFilterChange()">${buildMonthOptions(selMonth, selYear)}</select>
      ${staffFilterHtml}
    </div>
    <div class="export-bar">
      <button class="btn btn-ghost btn-sm" onclick="exportToExcel()">⬇ Excel</button>
      <button class="btn btn-ghost btn-sm" onclick="exportToPDF()">⬇ PDF</button>
    </div>
    <div id="records-list" class="records-list"></div>
  `;

  window.onFilterChange = () => {
    const mv = document.getElementById('filter-month')?.value;
    if (mv) { const [m,y] = mv.split('-'); selMonth=+m; selYear=+y; }
    else { selMonth=null; selYear=null; }
    staffFilterId = document.getElementById('filter-staff')?.value || '';
    loadRecordsList(selMonth, selYear, staffFilterId);
  };

  loadRecordsList(selMonth, selYear, staffFilterId);
}

async function loadRecordsList(month, year, staffFilterId) {
  if (!APP.user) return;
  const listEl = document.getElementById('records-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading"><span class="spinner"></span>Loading…</div>';

  let res;
  if (APP.user.role === 'admin') {
    res = await apiGetAllRecords(APP.user.role, staffFilterId, month, year);
  } else {
    res = await apiGetRecords(APP.user.staffId, month, year);
  }

  if (!res.success) { listEl.innerHTML = `<p class="error-msg">${res.message}</p>`; return; }

  const records = res.records || [];
  // Cache for edit modal use
  APP.recordsCache = records;

  if (!records.length) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p class="empty-text">No records found for this period.</p></div>';
    return;
  }
  listEl.innerHTML = records.map(r => recordCard(r)).join('');
}

function recordCard(r) {
  if (!APP.user) return '';
  const editable = isEditable(r.date);
  const lockBadge = !editable ? '<span class="lock-badge">🔒 Locked</span>' : '';
  const editBtn = editable ? `<button class="btn btn-ghost btn-sm" onclick="openEditRecord('${r.recordId}')">Edit</button>` : '';
  const deleteBtn = editable ? `<button class="btn btn-danger btn-sm" onclick="confirmDeleteRecord('${r.recordId}')">Delete</button>` : '';
  const staffBadge = APP.user.role === 'admin' ? `<span class="staff-badge">${r.staffName}</span><br>` : '';

  return `
    <div class="record-card ${!editable ? 'locked' : ''}" id="rc-${r.recordId}">
      ${staffBadge}
      <div class="record-top">
        <span class="record-customer">${r.cardNo ? r.cardNo + ' — ' + r.customerName : r.customerName}</span>
        <span class="record-date">${formatDate(r.date)}</span>
      </div>
      <div class="record-amounts">
        <div class="amount-item"><span class="amount-label">Project</span><span class="amount-val">${formatRM(r.project)}</span></div>
        <div class="amount-item"><span class="amount-label">Massage</span><span class="amount-val">${formatRM(r.massage)}</span></div>
        <div class="amount-item"><span class="amount-label">Product</span><span class="amount-val">${formatRM(r.product)}</span></div>
      </div>
      <div class="record-total">
        <span class="total-label">Total Sales</span>
        <span class="total-val">${formatRM(r.totalSales)}</span>
      </div>
      ${r.remarks ? `<div class="record-remarks">${r.remarks}</div>` : ''}
      <div class="record-actions">${editBtn}${deleteBtn}${lockBadge}</div>
    </div>`;
}

// ─── Edit Record ──────────────────────────────────
let _editingRecord = null;

function openEditRecord(recordId) {
  // Use cache — no extra API call needed
  const r = APP.recordsCache.find(x => x.recordId === recordId);
  if (!r) { showToast('Record not found', 'error'); return; }
  _editingRecord = r;

  const dateVal = r.date ? String(r.date).split('T')[0] : '';
  document.getElementById('modal-edit-title').textContent = 'Edit Record';
  document.getElementById('modal-edit-body').innerHTML = `
    <div class="field-group">
      <label class="field-label">Date</label>
      <input type="date" id="edit-date" class="field-input" value="${dateVal}" />
    </div>
    <div class="field-group">
      <label class="field-label">Customer (Card No — Name)</label>
      <div class="customer-search-wrap" id="edit-cus-wrap">
        <input type="text" id="edit-customer-search" class="field-input"
          value="${r.cardNo ? r.cardNo + ' — ' + r.customerName : r.customerName}"
          oninput="filterCustomers('edit')" onfocus="showCustomerDropdown('edit')" autocomplete="off" />
        <div id="edit-customer-dropdown" class="cus-dropdown hidden"></div>
        <input type="hidden" id="edit-customer-id" value="${r.customerId || ''}" />
        <input type="hidden" id="edit-customer-cardno" value="${r.cardNo || ''}" />
        <input type="hidden" id="edit-customer-name" value="${r.customerName}" />
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:6px;width:100%" onclick="showAddCustomerForm('edit')">+ New Customer</button>
    </div>
    <div class="amount-row">
      <div class="field-group">
        <label class="field-label">Project (RM)</label>
        <input type="number" id="edit-project" class="field-input" value="${r.project}" inputmode="decimal" oninput="calcEditTotal()" />
      </div>
      <div class="field-group">
        <label class="field-label">Massage (RM)</label>
        <input type="number" id="edit-massage" class="field-input" value="${r.massage}" inputmode="decimal" oninput="calcEditTotal()" />
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">Product (RM)</label>
      <input type="number" id="edit-product" class="field-input" value="${r.product}" inputmode="decimal" oninput="calcEditTotal()" />
    </div>
    <div class="total-preview">
      <span class="total-preview-label">Total Sales</span>
      <span class="total-preview-val" id="edit-total-preview">${formatRM(r.totalSales)}</span>
    </div>
    <div class="field-group">
      <label class="field-label">Total Sales (RM) — auto or override</label>
      <input type="number" id="edit-total" class="field-input" value="${r.totalSales}" inputmode="decimal" oninput="overrideEditTotal()" />
    </div>
    <div class="field-group">
      <label class="field-label">Remarks</label>
      <textarea id="edit-remarks" class="field-input">${r.remarks || ''}</textarea>
    </div>
    <button class="btn btn-primary btn-full" onclick="saveEditRecord()">SAVE CHANGES</button>
    <p id="edit-error" class="error-msg hidden"></p>
  `;
  openModal('modal-edit');
}

function calcEditTotal() {
  const p  = parseFloat(document.getElementById('edit-project')?.value) || 0;
  const m  = parseFloat(document.getElementById('edit-massage')?.value) || 0;
  const pr = parseFloat(document.getElementById('edit-product')?.value) || 0;
  const total = p + m + pr;
  document.getElementById('edit-total').value = total.toFixed(2);
  document.getElementById('edit-total-preview').textContent = formatRM(total);
}

function overrideEditTotal() {
  const val = parseFloat(document.getElementById('edit-total')?.value) || 0;
  document.getElementById('edit-total-preview').textContent = formatRM(val);
}

async function saveEditRecord() {
  if (!_editingRecord || !APP.user) return;
  const errEl = document.getElementById('edit-error');
  const payload = {
    recordId:    _editingRecord.recordId,
    staffId:     APP.user.staffId,
    role:        APP.user.role,
    date:        document.getElementById('edit-date').value,
    customerId:  document.getElementById('edit-customer-id').value,
    cardNo:      document.getElementById('edit-customer-cardno').value,
    customerName:document.getElementById('edit-customer-name').value.trim(),
    project:     parseFloat(document.getElementById('edit-project').value) || 0,
    massage:     parseFloat(document.getElementById('edit-massage').value) || 0,
    product:     parseFloat(document.getElementById('edit-product').value) || 0,
    totalSales:  parseFloat(document.getElementById('edit-total').value) || 0,
    remarks:     document.getElementById('edit-remarks').value.trim(),
  };
  if (!payload.customerName) return showFieldError(errEl, 'Please select a customer.');
  errEl.classList.add('hidden');
  const res = await apiUpdateRecord(payload);
  if (!res.success) return showFieldError(errEl, res.message);
  showToast('Record updated!', 'success');
  closeModal('modal-edit');
  switchTab('records');
}

// ─── Delete Record ───────────────────────────────
async function confirmDeleteRecord(recordId) {
  if (!APP.user) return;
  const r = APP.recordsCache.find(x => x.recordId === recordId);
  if (!r) { showToast('Record not found', 'error'); return; }

  if (!confirm(`Delete record for "${r.customerName}"?\nThis cannot be undone.`)) return;

  const res = await apiDeleteRecord(recordId, APP.user.staffId, APP.user.role);
  if (!res.success) { showToast(res.message, 'error'); return; }

  showToast('Record deleted', 'success');
  // Remove from cache and DOM instantly — no full reload needed
  APP.recordsCache = APP.recordsCache.filter(x => x.recordId !== recordId);
  const el = document.getElementById('rc-' + recordId);
  if (el) el.remove();

  // Show empty state if no records left
  const list = document.getElementById('records-list');
  if (list && list.children.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p class="empty-text">No records found for this period.</p></div>';
  }
}

// ═══════════════════════════════════════════════
// CUSTOMER SEARCH HELPERS
// ═══════════════════════════════════════════════
function filterCustomers(prefix) {
  const q = document.getElementById(`${prefix}-customer-search`).value.toLowerCase().trim();
  const dropdown = document.getElementById(`${prefix}-customer-dropdown`);

  // Clear selection if user is editing
  document.getElementById(`${prefix}-customer-id`).value = '';
  document.getElementById(`${prefix}-customer-cardno`).value = '';
  document.getElementById(`${prefix}-customer-name`).value = '';

  if (!q) { dropdown.classList.add('hidden'); return; }

  const matches = APP.customers.filter(c =>
    c.name.toLowerCase().includes(q) ||
    String(c.cardNo).includes(q)
  ).slice(0, 10); // max 10 results

  if (!matches.length) {
    dropdown.innerHTML = `<div class="cus-option cus-no-result">No customer found — tap "+ New Customer"</div>`;
    dropdown.classList.remove('hidden');
    return;
  }

  dropdown.innerHTML = matches.map(c => `
    <div class="cus-option"
      data-id="${c.customerId}"
      data-cardno="${c.cardNo}"
      data-name="${c.name.replace(/"/g, '&quot;')}"
      data-prefix="${prefix}"
      onclick="selectCustomerFromEl(this)">
      <span class="cus-cardno">${c.cardNo}</span>
      <span class="cus-name">${c.name}</span>
      ${c.phone ? `<span class="cus-phone">${c.phone}</span>` : ''}
    </div>`).join('');
  dropdown.classList.remove('hidden');
}

function showCustomerDropdown(prefix) {
  const q = document.getElementById(`${prefix}-customer-search`).value;
  if (q.length > 0) filterCustomers(prefix);
}

function selectCustomerFromEl(el) {
  const prefix    = el.dataset.prefix;
  const customerId = el.dataset.id;
  const cardNo    = el.dataset.cardno;
  const name      = el.dataset.name;
  selectCustomer(prefix, customerId, cardNo, name);
}

function selectCustomer(prefix, customerId, cardNo, name) {
  document.getElementById(`${prefix}-customer-search`).value = `${cardNo} — ${name}`;
  document.getElementById(`${prefix}-customer-id`).value = customerId;
  document.getElementById(`${prefix}-customer-cardno`).value = cardNo;
  document.getElementById(`${prefix}-customer-name`).value = name;
  document.getElementById(`${prefix}-customer-dropdown`).classList.add('hidden');
}

// Close dropdown when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.customer-search-wrap')) {
    document.querySelectorAll('.cus-dropdown').forEach(d => d.classList.add('hidden'));
  }
});

async function showAddCustomerForm(prefix) {
  const modalBody = document.getElementById('modal-edit-body');
  document.getElementById('modal-edit-title').textContent = 'Add New Customer';
  modalBody.innerHTML = `
    <div class="field-group">
      <label class="field-label">Card No (numbers only)</label>
      <input type="text" id="nc-cardno" class="field-input" placeholder="e.g. 1001" inputmode="numeric" autocomplete="off" />
    </div>
    <div class="field-group">
      <label class="field-label">Customer Name</label>
      <input type="text" id="nc-name" class="field-input" placeholder="Full name" autocomplete="off" />
    </div>
    <div class="field-group">
      <label class="field-label">Phone (optional)</label>
      <input type="tel" id="nc-phone" class="field-input" placeholder="e.g. 0123456789" autocomplete="off" />
    </div>
    <button class="btn btn-primary btn-full" onclick="submitNewCustomer('${prefix}')">ADD CUSTOMER</button>
    <p id="nc-error" class="error-msg hidden"></p>
  `;
  openModal('modal-edit');
}

async function submitNewCustomer(prefix) {
  if (!APP.user) return;
  const cardNo = document.getElementById('nc-cardno').value.trim();
  const name   = document.getElementById('nc-name').value.trim();
  const phone  = document.getElementById('nc-phone').value.trim();
  const errEl  = document.getElementById('nc-error');

  if (!cardNo) return showFieldError(errEl, 'Card No is required.');
  if (!/^\d+$/.test(cardNo)) return showFieldError(errEl, 'Card No must be numbers only.');
  if (!name)   return showFieldError(errEl, 'Customer name is required.');

  errEl.classList.add('hidden');

  const res = await apiAddCustomer(name, cardNo, phone, APP.user.staffId, APP.user.name);
  if (!res.success) return showFieldError(errEl, res.message);

  // Add to local cache immediately
  const newCus = { customerId: res.customerId, cardNo, name, phone };
  APP.customers.push(newCus);
  APP.customers.sort((a, b) => +a.cardNo - +b.cardNo);
  sessionStorage.setItem('beyou_customers', JSON.stringify(APP.customers));

  // Auto-select in form
  selectCustomer(prefix, res.customerId, cardNo, name);

  showToast(`${name} added!`, 'success');
  closeModal('modal-edit');
}

// ═══════════════════════════════════════════════
// ADD TAB
// ═══════════════════════════════════════════════
function renderAddTab(main) {
  const today = new Date().toISOString().split('T')[0];
  main.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Add Record</h2>
      <p class="page-sub">New customer entry</p>
    </div>
    <div class="add-form-card">
      <span class="section-label">Details</span>
      <div class="field-group">
        <label class="field-label">Date</label>
        <input type="date" id="add-date" class="field-input" value="${today}" />
      </div>
      <div class="field-group">
        <label class="field-label">Customer (Card No — Name)</label>
        <div class="customer-search-wrap" id="add-cus-wrap">
          <input type="text" id="add-customer-search" class="field-input" placeholder="Type card no or name…"
            oninput="filterCustomers('add')" onfocus="showCustomerDropdown('add')" autocomplete="off" />
          <div id="add-customer-dropdown" class="cus-dropdown hidden"></div>
          <input type="hidden" id="add-customer-id" />
          <input type="hidden" id="add-customer-cardno" />
          <input type="hidden" id="add-customer-name" />
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:6px;width:100%" onclick="showAddCustomerForm('add')">+ New Customer</button>
      </div>
      <hr class="divider" />
      <span class="section-label">Sales (RM)</span>
      <div class="amount-row">
        <div class="field-group">
          <label class="field-label">Project</label>
          <input type="number" id="add-project" class="field-input" placeholder="0.00" inputmode="decimal" oninput="calcAddTotal()" />
        </div>
        <div class="field-group">
          <label class="field-label">Massage</label>
          <input type="number" id="add-massage" class="field-input" placeholder="0.00" inputmode="decimal" oninput="calcAddTotal()" />
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Product</label>
        <input type="number" id="add-product" class="field-input" placeholder="0.00" inputmode="decimal" oninput="calcAddTotal()" />
      </div>
      <div class="total-preview">
        <span class="total-preview-label">Total Sales</span>
        <span class="total-preview-val" id="add-total-preview">RM 0.00</span>
      </div>
      <div class="field-group">
        <label class="field-label">Total Sales (RM) — auto or override</label>
        <input type="number" id="add-total" class="field-input" placeholder="0.00" inputmode="decimal" oninput="overrideAddTotal()" />
      </div>
      <hr class="divider" />
      <div class="field-group">
        <label class="field-label">Remarks</label>
        <textarea id="add-remarks" class="field-input" placeholder="Optional notes…"></textarea>
      </div>
      <button class="btn btn-primary btn-full" id="add-btn" onclick="submitAddRecord()">SAVE RECORD</button>
      <p id="add-error" class="error-msg hidden"></p>
    </div>`;
}

function calcAddTotal() {
  const p  = parseFloat(document.getElementById('add-project')?.value) || 0;
  const m  = parseFloat(document.getElementById('add-massage')?.value) || 0;
  const pr = parseFloat(document.getElementById('add-product')?.value) || 0;
  const total = p + m + pr;
  document.getElementById('add-total').value = total.toFixed(2);
  document.getElementById('add-total-preview').textContent = formatRM(total);
}

function overrideAddTotal() {
  const val = parseFloat(document.getElementById('add-total')?.value) || 0;
  document.getElementById('add-total-preview').textContent = formatRM(val);
}

async function submitAddRecord() {
  if (!APP.user) return;
  const errEl = document.getElementById('add-error');
  const btn   = document.getElementById('add-btn');
  const payload = {
    staffId:      APP.user.staffId,
    staffName:    APP.user.name,
    date:         document.getElementById('add-date').value,
    customerId:   document.getElementById('add-customer-id').value,
    cardNo:       document.getElementById('add-customer-cardno').value,
    customerName: document.getElementById('add-customer-name').value.trim(),
    project:      parseFloat(document.getElementById('add-project').value) || 0,
    massage:      parseFloat(document.getElementById('add-massage').value) || 0,
    product:      parseFloat(document.getElementById('add-product').value) || 0,
    totalSales:   parseFloat(document.getElementById('add-total').value) || 0,
    remarks:      document.getElementById('add-remarks').value.trim(),
  };
  if (!payload.customerName) return showFieldError(errEl, 'Please select a customer.');
  if (!payload.date)         return showFieldError(errEl, 'Date is required.');
  errEl.classList.add('hidden');
  btn.disabled = true; btn.textContent = 'SAVING…';
  const res = await apiAddRecord(payload);
  btn.disabled = false; btn.textContent = 'SAVE RECORD';
  if (!res.success) return showFieldError(errEl, res.message);
  showToast('Record saved!', 'success');
  switchTab('records');
}

// ═══════════════════════════════════════════════
// DASHBOARD TAB
// ═══════════════════════════════════════════════
async function renderDashboardTab(main) {
  if (!APP.user) return;
  const { month, year } = getMonthYear();
  let selMonth = month, selYear = year;

  main.innerHTML = `
    <div class="page-header"><h2 class="page-title">Dashboard</h2></div>
    <div class="filter-bar">
      <select id="dash-month" onchange="onDashFilterChange()">${buildMonthOptions(selMonth, selYear)}</select>
    </div>
    <div id="dash-content"></div>`;

  window.onDashFilterChange = () => {
    const mv = document.getElementById('dash-month')?.value;
    if (mv) { const [m,y] = mv.split('-'); selMonth=+m; selYear=+y; }
    else { selMonth=null; selYear=null; }
    loadDashContent(selMonth, selYear);
  };

  loadDashContent(selMonth, selYear);
}

async function loadDashContent(month, year) {
  if (!APP.user) return;
  const dashEl = document.getElementById('dash-content');
  if (!dashEl) return;
  dashEl.innerHTML = '<div class="loading"><span class="spinner"></span>Loading…</div>';

  let res;
  if (APP.user.role === 'admin') {
    res = await apiGetAllRecords(APP.user.role, '', month, year);
  } else {
    res = await apiGetRecords(APP.user.staffId, month, year);
  }
  if (!res.success) { dashEl.innerHTML = `<p class="error-msg">${res.message}</p>`; return; }

  const records = res.records || [];
  const totalSales   = records.reduce((s,r) => s + (+r.totalSales||0), 0);
  const totalProject = records.reduce((s,r) => s + (+r.project||0), 0);
  const totalMassage = records.reduce((s,r) => s + (+r.massage||0), 0);
  const totalProduct = records.reduce((s,r) => s + (+r.product||0), 0);

  let breakdownHtml = '';
  if (APP.user.role === 'admin') {
    const byStaff = {};
    records.forEach(r => {
      if (!byStaff[r.staffName]) byStaff[r.staffName] = { entries:0, total:0 };
      byStaff[r.staffName].entries++;
      byStaff[r.staffName].total += (+r.totalSales||0);
    });
    const rows = Object.entries(byStaff)
      .sort((a,b) => b[1].total - a[1].total)
      .map(([name,d]) => `<tr><td>${name}</td><td style="color:var(--silver-deep)">${d.entries}</td><td class="td-total">${formatRM(d.total)}</td></tr>`)
      .join('');
    if (rows) breakdownHtml = `
      <div class="card section-gap">
        <span class="section-label">Staff Breakdown</span>
        <table class="breakdown-table">
          <thead><tr><th>Staff</th><th>Entries</th><th>Total Sales</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  dashEl.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card full">
        <div class="summary-num">${formatRM(totalSales)}</div>
        <div class="summary-label">Total Sales</div>
      </div>
      <div class="summary-card"><div class="summary-num">${formatRM(totalProject)}</div><div class="summary-label">Project</div></div>
      <div class="summary-card"><div class="summary-num">${formatRM(totalMassage)}</div><div class="summary-label">Massage</div></div>
      <div class="summary-card"><div class="summary-num">${formatRM(totalProduct)}</div><div class="summary-label">Product</div></div>
      <div class="summary-card"><div class="summary-num">${records.length}</div><div class="summary-label">Entries</div></div>
    </div>
    ${breakdownHtml}`;
}

// ═══════════════════════════════════════════════
// ADMIN TAB
// ═══════════════════════════════════════════════
async function renderAdminTab(main) {
  if (!APP.user || APP.user.role !== 'admin') { main.innerHTML = ''; return; }
  main.innerHTML = `
    <div class="page-header"><h2 class="page-title">Staff</h2></div>
    <button class="btn btn-primary btn-sm" style="margin-bottom:14px" onclick="showAddStaffForm()">+ Add Staff</button>
    <div id="admin-staff-list" class="admin-staff-list"><div class="loading"><span class="spinner"></span></div></div>
    <div class="section-gap">
      <button class="btn btn-ghost btn-sm" onclick="renderAuditLog()">View Login Audit</button>
    </div>
    <div id="audit-section"></div>
`;
  loadAdminStaffList();
}

async function loadAdminStaffList() {
  const listEl = document.getElementById('admin-staff-list');
  if (!listEl || !APP.user) return;
  const res = await apiGetStaffList(APP.user.role);
  if (!res.success) { listEl.innerHTML = `<p class="error-msg">${res.message}</p>`; return; }
  APP.staffList = res.staff;
  listEl.innerHTML = res.staff.map(s => `
    <div class="admin-staff-card">
      <div class="admin-staff-info">
        <div class="staff-name">${s.name} ${s.role==='admin'?'👑':''}</div>
        <div class="staff-role">${s.role}${(s.mustResetPin==='TRUE'||s.mustResetPin===true)?' · ⚠ Needs reset':''}</div>
      </div>
      <div class="admin-staff-actions">
        <button class="btn btn-ghost btn-sm" onclick="confirmResetPin('${s.staffId}','${s.name}')">Reset PIN</button>
      </div>
    </div>`).join('');
}

function showAddStaffForm() {
  document.getElementById('modal-edit-title').textContent = 'Add Staff';
  document.getElementById('modal-edit-body').innerHTML = `
    <div class="field-group">
      <label class="field-label">Full Name</label>
      <input type="text" id="new-staff-name" class="field-input" placeholder="e.g. Tan Wei" />
    </div>
    <div class="field-group">
      <label class="field-label">Role</label>
      <select id="new-staff-role" class="field-input" style="height:44px">
        <option value="staff">Staff</option>
        <option value="admin">Admin / Manager</option>
      </select>
    </div>
    <p style="font-size:12px;color:var(--silver-deep);margin-bottom:14px;line-height:1.6">
      Default PIN = <strong>Surname + 123</strong><br>
      e.g. Name "Tan Wei" → PIN is <strong>Tan123</strong><br>
      Staff must reset on first login.
    </p>
    <button class="btn btn-primary btn-full" onclick="submitAddStaff()">ADD STAFF</button>
    <p id="add-staff-error" class="error-msg hidden"></p>`;
  openModal('modal-edit');
}

async function submitAddStaff() {
  if (!APP.user) return;
  const name  = document.getElementById('new-staff-name').value.trim();
  const role  = document.getElementById('new-staff-role').value;
  const errEl = document.getElementById('add-staff-error');
  if (!name) return showFieldError(errEl, 'Name is required.');
  errEl.classList.add('hidden');
  const res = await apiAddStaff(name, role, APP.user.role, APP.user.staffId);
  if (!res.success) return showFieldError(errEl, res.message);
  showToast(`${name} added!`, 'success');
  closeModal('modal-edit');
  loadAdminStaffList();
}

async function confirmResetPin(staffId, name) {
  if (!confirm(`Reset PIN for ${name}?\nNew PIN will be their Surname + 123`)) return;
  const res = await apiResetStaffPin(staffId, APP.user.role, APP.user.staffId);
  if (res.success) { showToast(`PIN reset for ${name}`, 'success'); loadAdminStaffList(); }
  else showToast(res.message, 'error');
}

async function loadAdminCustomerList(listElId) {
  const listEl = document.getElementById(listElId || 'cus-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading"><span class="spinner"></span>Loading…</div>';

  // Always fetch fresh for customers tab
  const res = await apiGetCustomers();
  if (res.success && res.customers) {
    APP.customers = res.customers;
    sessionStorage.setItem('beyou_customers', JSON.stringify(APP.customers));
  }

  if (!APP.customers.length) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🪪</div><p class="empty-text">No customers yet.</p></div>';
    return;
  }
  const sorted = [...APP.customers].sort((a, b) => +a.cardNo - +b.cardNo);
  listEl.innerHTML = sorted.map(c => `
    <div class="admin-staff-card">
      <div class="admin-staff-info">
        <div class="staff-name">${c.cardNo} — ${c.name}</div>
        <div class="staff-role">${c.phone || 'No phone'} &nbsp;·&nbsp; <span style="color:var(--silver-deep);font-size:10px">${c.customerId}</span></div>
      </div>
    </div>`).join('');
}

async function renderCustomersTab(main) {
  if (!APP.user || APP.user.role !== 'admin') { main.innerHTML = ''; return; }
  main.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Customers</h2>
      <p class="page-sub">${APP.customers.length || '…'} customers</p>
    </div>
    <div class="filter-bar">
      <input type="text" id="cus-search" class="field-input" placeholder="Search card no or name…"
        oninput="filterCustomerList()" style="height:38px;font-size:13px" autocomplete="off" />
    </div>
    <button class="btn btn-primary btn-sm" style="margin-bottom:14px;width:100%" onclick="showAddCustomerForm('admin')">+ Add Customer</button>
    <div id="cus-list" class="admin-staff-list"></div>`;
  await loadAdminCustomerList('cus-list');

  // Update subtitle with count
  const sub = main.querySelector('.page-sub');
  if (sub) sub.textContent = APP.customers.length + ' customers';
}

window.filterCustomerList = function() {
  const q = document.getElementById('cus-search')?.value.toLowerCase().trim() || '';
  const listEl = document.getElementById('cus-list');
  if (!listEl) return;
  const filtered = q
    ? APP.customers.filter(c => c.name.toLowerCase().includes(q) || String(c.cardNo).includes(q))
    : APP.customers;
  const sorted = [...filtered].sort((a, b) => +a.cardNo - +b.cardNo);
  if (!sorted.length) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🪪</div><p class="empty-text">No match found.</p></div>';
    return;
  }
  listEl.innerHTML = sorted.map(c => `
    <div class="admin-staff-card">
      <div class="admin-staff-info">
        <div class="staff-name">${c.cardNo} — ${c.name}</div>
        <div class="staff-role">${c.phone || 'No phone'} &nbsp;·&nbsp; <span style="color:var(--silver-deep);font-size:10px">${c.customerId}</span></div>
      </div>
    </div>`).join('');
};

async function renderAuditLog() {
  const sec = document.getElementById('audit-section');
  if (!sec || !APP.user) return;
  sec.innerHTML = '<div class="loading"><span class="spinner"></span></div>';
  const res = await apiGetAuditLog(APP.user.role);
  if (!res.success) { sec.innerHTML = `<p class="error-msg">${res.message}</p>`; return; }
  const rows = (res.logs||[]).map(l => `
    <tr>
      <td style="font-size:10px">${new Date(l.timestamp).toLocaleString('en-MY')}</td>
      <td>${l.name}</td>
      <td style="font-size:10px;color:var(--silver-deep)">${l.action}</td>
    </tr>`).join('');
  sec.innerHTML = `
    <div class="card section-gap">
      <span class="section-label">Recent Activity</span>
      <table class="breakdown-table">
        <thead><tr><th>Time</th><th>Staff</th><th>Action</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="3" style="color:var(--silver-deep)">No logs yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}
