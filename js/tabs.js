// ============================================================
// tabs.js — Tab rendering: Records, Add, Dashboard, Admin
// ============================================================

function switchTab(tab) {
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
  }
}

// ═══════════════════════════════════════════════
// RECORDS TAB
// ═══════════════════════════════════════════════
async function renderRecordsTab(main) {
  const { month, year } = getMonthYear();
  let selMonth = month, selYear = year;

  const renderList = async () => {
    const listEl = document.getElementById('records-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="loading"><span class="spinner"></span>Loading…</div>';

    let res;
    if (APP.user.role === 'admin') {
      const staffFilter = document.getElementById('filter-staff')?.value || '';
      res = await apiGetAllRecords(APP.user.role, staffFilter, selMonth, selYear);
    } else {
      res = await apiGetRecords(APP.user.staffId, selMonth, selYear);
    }

    if (!res.success) { listEl.innerHTML = `<p class="error-msg">${res.message}</p>`; return; }

    const records = res.records || [];
    if (!records.length) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p class="empty-text">No records found for this period.</p></div>';
      return;
    }

    listEl.innerHTML = records.map(r => recordCard(r)).join('');
  };

  // Build staff filter for admin
  let staffFilterHtml = '';
  if (APP.user.role === 'admin') {
    const staffRes = await apiGetStaffList(APP.user.role);
    if (staffRes.success) APP.staffList = staffRes.staff;
    const opts = ['<option value="">All Staff</option>',
      ...(APP.staffList.map(s => `<option value="${s.staffId}">${s.name}</option>`))
    ].join('');
    staffFilterHtml = `<select id="filter-staff" onchange="triggerRefresh()">${opts}</select>`;
  }

  main.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Records</h2>
    </div>
    <div class="filter-bar">
      <select id="filter-month" onchange="triggerRefresh()">
        ${buildMonthOptions(selMonth, selYear)}
      </select>
      ${staffFilterHtml}
    </div>
    <div class="export-bar">
      <button class="btn btn-ghost btn-sm" onclick="exportToExcel()">⬇ Export Excel</button>
    </div>
    <div id="records-list" class="records-list"></div>
  `;

  window.triggerRefresh = () => {
    const mv = document.getElementById('filter-month')?.value;
    if (mv) { const [m, y] = mv.split('-'); selMonth = +m; selYear = +y; }
    else { selMonth = null; selYear = null; }
    renderList();
  };

  renderList();
}

function recordCard(r) {
  const editable = isEditable(r.date);
  const lockBadge = !editable ? '<span class="lock-badge">🔒 Locked</span>' : '';
  const editBtn = editable
    ? `<button class="btn btn-ghost btn-sm" onclick="openEditRecord('${r.recordId}')">Edit</button>`
    : '';
  const staffBadge = APP.user.role === 'admin'
    ? `<span class="staff-badge">${r.staffName}</span><br>` : '';

  return `
    <div class="record-card ${!editable ? 'locked' : ''}" id="rc-${r.recordId}">
      ${staffBadge}
      <div class="record-top">
        <span class="record-customer">${r.customerName}</span>
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
      <div class="record-actions">${editBtn}${lockBadge}</div>
    </div>
  `;
}

// ─── Edit Record Modal ────────────────────────────
let _editingRecord = null;
function openEditRecord(recordId) {
  // Find record from DOM data — we'll refetch for accuracy
  const modalBody = document.getElementById('modal-edit-body');
  modalBody.innerHTML = '<div class="loading"><span class="spinner"></span></div>';
  openModal('modal-edit');

  // Get record data — we rely on last fetched records
  apiGetRecords(APP.user.staffId, null, null).then(res => {
    if (APP.user.role === 'admin') return apiGetAllRecords(APP.user.role, '', null, null);
    return res;
  }).then(res => {
    const r = (res.records || []).find(x => x.recordId === recordId);
    if (!r) { modalBody.innerHTML = '<p class="error-msg">Record not found.</p>'; return; }
    _editingRecord = r;

    const dateVal = r.date ? r.date.split('T')[0] : '';
    modalBody.innerHTML = `
      <div class="field-group">
        <label class="field-label">Date</label>
        <input type="date" id="edit-date" class="field-input" value="${dateVal}" />
      </div>
      <div class="field-group">
        <label class="field-label">Customer Name</label>
        <input type="text" id="edit-customer" class="field-input" value="${r.customerName}" />
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
        <label class="field-label">Total Sales (RM) — auto or manual</label>
        <input type="number" id="edit-total" class="field-input" value="${r.totalSales}" inputmode="decimal" oninput="overrideEditTotal()" />
      </div>
      <div class="field-group">
        <label class="field-label">Remarks</label>
        <textarea id="edit-remarks" class="field-input">${r.remarks || ''}</textarea>
      </div>
      <button class="btn btn-primary btn-full" onclick="saveEditRecord()">Save Changes</button>
      <p id="edit-error" class="error-msg hidden"></p>
    `;
  });
}

function calcEditTotal() {
  const p = parseFloat(document.getElementById('edit-project')?.value) || 0;
  const m = parseFloat(document.getElementById('edit-massage')?.value) || 0;
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
  if (!_editingRecord) return;
  const errEl = document.getElementById('edit-error');
  const payload = {
    recordId: _editingRecord.recordId,
    staffId: APP.user.staffId,
    role: APP.user.role,
    date: document.getElementById('edit-date').value,
    customerName: document.getElementById('edit-customer').value.trim(),
    project:  parseFloat(document.getElementById('edit-project').value) || 0,
    massage:  parseFloat(document.getElementById('edit-massage').value) || 0,
    product:  parseFloat(document.getElementById('edit-product').value) || 0,
    totalSales: parseFloat(document.getElementById('edit-total').value) || 0,
    remarks: document.getElementById('edit-remarks').value.trim(),
  };
  if (!payload.customerName) return showFieldError(errEl, 'Customer name is required.');
  errEl.classList.add('hidden');
  const res = await apiUpdateRecord(payload);
  if (!res.success) return showFieldError(errEl, res.message);
  showToast('Record updated!', 'success');
  closeModal('modal-edit');
  switchTab('records');
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
      <p class="section-label">Details</p>
      <div class="field-group">
        <label class="field-label">Date</label>
        <input type="date" id="add-date" class="field-input" value="${today}" />
      </div>
      <div class="field-group">
        <label class="field-label">Customer Name</label>
        <input type="text" id="add-customer" class="field-input" placeholder="Enter customer name" />
      </div>

      <hr class="divider" />
      <p class="section-label">Sales (RM)</p>

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

      <button class="btn btn-primary btn-full" onclick="submitAddRecord()">Save Record</button>
      <p id="add-error" class="error-msg hidden"></p>
    </div>
  `;
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
  const errEl = document.getElementById('add-error');
  const payload = {
    staffId:    APP.user.staffId,
    staffName:  APP.user.name,
    date:       document.getElementById('add-date').value,
    customerName: document.getElementById('add-customer').value.trim(),
    project:    parseFloat(document.getElementById('add-project').value) || 0,
    massage:    parseFloat(document.getElementById('add-massage').value) || 0,
    product:    parseFloat(document.getElementById('add-product').value) || 0,
    totalSales: parseFloat(document.getElementById('add-total').value) || 0,
    remarks:    document.getElementById('add-remarks').value.trim(),
  };
  if (!payload.customerName) return showFieldError(errEl, 'Customer name is required.');
  if (!payload.date)         return showFieldError(errEl, 'Date is required.');
  errEl.classList.add('hidden');
  const res = await apiAddRecord(payload);
  if (!res.success) return showFieldError(errEl, res.message);
  showToast('Record saved!', 'success');
  switchTab('records');
}

// ═══════════════════════════════════════════════
// DASHBOARD TAB
// ═══════════════════════════════════════════════
async function renderDashboardTab(main) {
  const { month, year } = getMonthYear();
  let selMonth = month, selYear = year;

  const renderDash = async () => {
    const dashEl = document.getElementById('dash-content');
    if (!dashEl) return;
    dashEl.innerHTML = '<div class="loading"><span class="spinner"></span>Loading…</div>';

    let res;
    if (APP.user.role === 'admin') {
      res = await apiGetAllRecords(APP.user.role, '', selMonth, selYear);
    } else {
      res = await apiGetRecords(APP.user.staffId, selMonth, selYear);
    }

    if (!res.success) { dashEl.innerHTML = `<p class="error-msg">${res.message}</p>`; return; }

    const records = res.records || [];
    const totalSales    = records.reduce((s, r) => s + (+r.totalSales || 0), 0);
    const totalProject  = records.reduce((s, r) => s + (+r.project   || 0), 0);
    const totalMassage  = records.reduce((s, r) => s + (+r.massage   || 0), 0);
    const totalProduct  = records.reduce((s, r) => s + (+r.product   || 0), 0);
    const totalEntries  = records.length;

    // Per-staff breakdown (admin only)
    let breakdownHtml = '';
    if (APP.user.role === 'admin') {
      const byStaff = {};
      records.forEach(r => {
        if (!byStaff[r.staffName]) byStaff[r.staffName] = { entries: 0, total: 0 };
        byStaff[r.staffName].entries++;
        byStaff[r.staffName].total += (+r.totalSales || 0);
      });
      const rows = Object.entries(byStaff)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, d]) => `
          <tr>
            <td>${name}</td>
            <td>${d.entries}</td>
            <td class="td-total">${formatRM(d.total)}</td>
          </tr>
        `).join('');

      breakdownHtml = rows ? `
        <div class="card section-gap">
          <p class="section-label">Staff Breakdown</p>
          <table class="breakdown-table">
            <thead><tr><th>Staff</th><th>Entries</th><th>Total Sales</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      ` : '';
    }

    dashEl.innerHTML = `
      <div class="summary-grid">
        <div class="summary-card full">
          <div class="summary-num">${formatRM(totalSales)}</div>
          <div class="summary-label">Total Sales</div>
        </div>
        <div class="summary-card">
          <div class="summary-num">${formatRM(totalProject)}</div>
          <div class="summary-label">Project</div>
        </div>
        <div class="summary-card">
          <div class="summary-num">${formatRM(totalMassage)}</div>
          <div class="summary-label">Massage</div>
        </div>
        <div class="summary-card">
          <div class="summary-num">${formatRM(totalProduct)}</div>
          <div class="summary-label">Product</div>
        </div>
        <div class="summary-card">
          <div class="summary-num">${totalEntries}</div>
          <div class="summary-label">Entries</div>
        </div>
      </div>
      ${breakdownHtml}
    `;
  };

  main.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Dashboard</h2>
    </div>
    <div class="filter-bar">
      <select id="dash-filter-month" onchange="dashRefresh()">
        ${buildMonthOptions(selMonth, selYear)}
      </select>
    </div>
    <div id="dash-content"></div>
  `;

  window.dashRefresh = () => {
    const mv = document.getElementById('dash-filter-month')?.value;
    if (mv) { const [m, y] = mv.split('-'); selMonth = +m; selYear = +y; }
    else { selMonth = null; selYear = null; }
    renderDash();
  };

  renderDash();
}

// ═══════════════════════════════════════════════
// ADMIN / STAFF MANAGEMENT TAB
// ═══════════════════════════════════════════════
async function renderAdminTab(main) {
  if (APP.user.role !== 'admin') { main.innerHTML = ''; return; }

  main.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Staff Management</h2>
    </div>
    <button class="btn btn-primary" style="margin-bottom:16px" onclick="showAddStaffForm()">+ Add Staff</button>
    <div id="admin-staff-list" class="admin-staff-list">
      <div class="loading"><span class="spinner"></span>Loading…</div>
    </div>
    <div class="section-gap">
      <button class="btn btn-ghost btn-sm" onclick="renderAuditLog()">View Login Audit Log</button>
    </div>
    <div id="audit-section"></div>
  `;

  loadAdminStaffList();
}

async function loadAdminStaffList() {
  const listEl = document.getElementById('admin-staff-list');
  if (!listEl) return;
  const res = await apiGetStaffList(APP.user.role);
  if (!res.success) { listEl.innerHTML = `<p class="error-msg">${res.message}</p>`; return; }
  APP.staffList = res.staff;

  listEl.innerHTML = res.staff.map(s => `
    <div class="admin-staff-card">
      <div class="admin-staff-info">
        <div class="staff-name">${s.name} ${s.role === 'admin' ? '👑' : ''}</div>
        <div class="staff-role">${s.role} ${s.mustResetPin === 'TRUE' || s.mustResetPin === true ? '· ⚠ Needs PIN reset' : ''}</div>
      </div>
      <div class="admin-staff-actions">
        <button class="btn btn-ghost btn-sm" onclick="confirmResetPin('${s.staffId}', '${s.name}')">Reset PIN</button>
      </div>
    </div>
  `).join('');
}

function showAddStaffForm() {
  const modal = document.getElementById('modal-edit');
  document.querySelector('#modal-edit .modal-header h3').textContent = 'Add Staff';
  document.getElementById('modal-edit-body').innerHTML = `
    <div class="field-group">
      <label class="field-label">Full Name</label>
      <input type="text" id="new-staff-name" class="field-input" placeholder="Staff name" />
    </div>
    <div class="field-group">
      <label class="field-label">Role</label>
      <select id="new-staff-role" class="field-input">
        <option value="staff">Staff</option>
        <option value="admin">Admin / Manager</option>
      </select>
    </div>
    <p style="font-size:13px;color:var(--text-soft);margin-bottom:12px">Default PIN will be <strong>12345</strong>. Staff must reset on first login.</p>
    <button class="btn btn-primary btn-full" onclick="submitAddStaff()">Add Staff</button>
    <p id="add-staff-error" class="error-msg hidden"></p>
  `;
  openModal('modal-edit');
}

async function submitAddStaff() {
  const name = document.getElementById('new-staff-name').value.trim();
  const role = document.getElementById('new-staff-role').value;
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
  if (!confirm(`Reset PIN for ${name} back to 12345?`)) return;
  const res = await apiResetStaffPin(staffId, APP.user.role, APP.user.staffId);
  if (res.success) { showToast(`PIN reset for ${name}`, 'success'); loadAdminStaffList(); }
  else showToast(res.message, 'error');
}

async function renderAuditLog() {
  const sec = document.getElementById('audit-section');
  sec.innerHTML = '<div class="loading"><span class="spinner"></span></div>';
  const res = await apiGetAuditLog(APP.user.role);
  if (!res.success) { sec.innerHTML = `<p class="error-msg">${res.message}</p>`; return; }

  const rows = (res.logs || []).map(l => `
    <tr>
      <td style="font-size:11px">${new Date(l.timestamp).toLocaleString('en-MY')}</td>
      <td>${l.name}</td>
      <td>${l.action}</td>
    </tr>
  `).join('');

  sec.innerHTML = `
    <div class="card section-gap">
      <p class="section-label">Recent Login Activity</p>
      <table class="breakdown-table">
        <thead><tr><th>Time</th><th>Staff</th><th>Action</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3">No logs yet.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}
