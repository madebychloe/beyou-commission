// ============================================================
// export.js — Excel export via SheetJS (CDN)
// ============================================================

// Dynamically load SheetJS only when needed
function loadSheetJS() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function exportToExcel() {
  showToast('Preparing export…');

  try {
    await loadSheetJS();
  } catch (e) {
    showToast('Could not load export library. Check internet.', 'error');
    return;
  }

  // Fetch current filtered data
  const filterMonthEl = document.getElementById('filter-month');
  const filterStaffEl = document.getElementById('filter-staff');
  let selMonth = null, selYear = null, staffFilter = '';

  if (filterMonthEl?.value) {
    const [m, y] = filterMonthEl.value.split('-');
    selMonth = +m; selYear = +y;
  }
  if (filterStaffEl?.value) staffFilter = filterStaffEl.value;

  let res;
  if (APP.user.role === 'admin') {
    res = await apiGetAllRecords(APP.user.role, staffFilter, selMonth, selYear);
  } else {
    res = await apiGetRecords(APP.user.staffId, selMonth, selYear);
  }

  if (!res.success || !res.records?.length) {
    showToast('No records to export.', 'error');
    return;
  }

  const records = res.records;

  // Build worksheet data
  const headers = ['Date', 'Staff', 'Customer Name', 'Project (RM)', 'Massage (RM)', 'Product (RM)', 'Total Sales (RM)', 'Remarks'];

  const rows = records.map(r => [
    r.date ? new Date(r.date).toLocaleDateString('en-MY') : '',
    r.staffName,
    r.customerName,
    parseFloat(r.project)    || 0,
    parseFloat(r.massage)    || 0,
    parseFloat(r.product)    || 0,
    parseFloat(r.totalSales) || 0,
    r.remarks || ''
  ]);

  // Totals row
  const totals = ['', '', 'TOTAL',
    rows.reduce((s, r) => s + r[3], 0),
    rows.reduce((s, r) => s + r[4], 0),
    rows.reduce((s, r) => s + r[5], 0),
    rows.reduce((s, r) => s + r[6], 0),
    ''
  ];

  const wsData = [headers, ...rows, [], totals];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [
    { wch: 14 }, { wch: 16 }, { wch: 22 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 24 }
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = selMonth && selYear
    ? new Date(selYear, selMonth - 1, 1).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
    : 'All Records';
  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));

  // File name
  const suffix = selMonth && selYear ? `_${selYear}-${String(selMonth).padStart(2,'0')}` : '';
  const staffSuffix = staffFilter ? `_${(APP.staffList.find(s => s.staffId === staffFilter)?.name || '').replace(/\s/g,'_')}` : '';
  const filename = `BeYou_Commission${staffSuffix}${suffix}.xlsx`;

  XLSX.writeFile(wb, filename);
  showToast('Excel file downloaded!', 'success');
}
