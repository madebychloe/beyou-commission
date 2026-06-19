// ============================================================
// export.js — Excel + PDF export
// ============================================================

// ─── Load SheetJS lazily ─────────────────────────
function loadSheetJS() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ─── Load jsPDF lazily ───────────────────────────
function loadJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => {
      // Also load jsPDF AutoTable
      const s2 = document.createElement('script');
      s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
      s2.onload = resolve; s2.onerror = reject;
      document.head.appendChild(s2);
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ─── Get current filter state ────────────────────
function getCurrentFilters() {
  const mv = document.getElementById('filter-month')?.value || '';
  const staffId = document.getElementById('filter-staff')?.value || '';
  let month = null, year = null;
  if (mv) { const [m, y] = mv.split('-'); month = +m; year = +y; }
  return { month, year, staffId };
}

async function fetchExportRecords() {
  const { month, year, staffId } = getCurrentFilters();
  let res;
  if (APP.user.role === 'admin') {
    res = await apiGetAllRecords(APP.user.role, staffId, month, year);
  } else {
    res = await apiGetRecords(APP.user.staffId, month, year);
  }
  return res.success ? (res.records || []) : [];
}

function getExportTitle() {
  const { month, year, staffId } = getCurrentFilters();
  const monthStr = month && year ? monthLabel(month, year) : 'All Records';
  const staffName = staffId ? (APP.staffList.find(s => s.staffId === staffId)?.name || '') : '';
  return { monthStr, staffName };
}

// ═══════════════════════════════════════════════
// EXCEL EXPORT
// ═══════════════════════════════════════════════
async function exportToExcel() {
  showToast('Preparing Excel…');
  try { await loadSheetJS(); }
  catch (e) { showToast('Could not load export library.', 'error'); return; }

  const records = await fetchExportRecords();
  if (!records.length) { showToast('No records to export.', 'error'); return; }

  const { monthStr, staffName } = getExportTitle();

  const headers = ['Date', 'Staff', 'Card No', 'Customer Name', 'Project (RM)', 'Massage (RM)', 'Product (RM)', 'Total Sales (RM)', 'Remarks'];
  const rows = records.map(r => [
    r.date ? new Date(r.date).toLocaleDateString('en-MY') : '',
    r.staffName, r.cardNo || '', r.customerName,
    parseFloat(r.project)    || 0,
    parseFloat(r.massage)    || 0,
    parseFloat(r.product)    || 0,
    parseFloat(r.totalSales) || 0,
    r.remarks || ''
  ]);

  const totalsRow = ['', '', '', 'TOTAL',
    rows.reduce((s, r) => s + r[3], 0),
    rows.reduce((s, r) => s + r[4], 0),
    rows.reduce((s, r) => s + r[5], 0),
    rows.reduce((s, r) => s + r[6], 0),
    ''
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows, [], totalsRow]);
  ws['!cols'] = [{ wch:14 },{ wch:16 },{ wch:10 },{ wch:22 },{ wch:14 },{ wch:14 },{ wch:14 },{ wch:16 },{ wch:24 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, monthStr.substring(0, 31));

  const suffix = monthStr !== 'All Records' ? `_${monthStr.replace(' ', '_')}` : '';
  const staffSuffix = staffName ? `_${staffName.replace(/\s/g, '_')}` : '';
  XLSX.writeFile(wb, `BeYou_Commission${staffSuffix}${suffix}.xlsx`);
  showToast('Excel downloaded!', 'success');
}

// ═══════════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════════
async function exportToPDF() {
  showToast('Preparing PDF…');
  try { await loadJsPDF(); }
  catch (e) { showToast('Could not load PDF library.', 'error'); return; }

  const records = await fetchExportRecords();
  if (!records.length) { showToast('No records to export.', 'error'); return; }

  const { monthStr, staffName } = getExportTitle();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // ── Header background ──
  doc.setFillColor(26, 26, 26);
  doc.rect(0, 0, pageW, 38, 'F');

  // ── BE logo box ──
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.4);
  doc.rect(margin, 8, 18, 18);
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.rect(margin + 1.5, 9.5, 15, 15);
  doc.setTextColor(255, 255, 255);
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text('BE', margin + 9, 19.5, { align: 'center' });

  // ── Title ──
  doc.setFont('times', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('BE YOU SKIN MANAGEMENT', margin + 24, 16);
  doc.setFontSize(8);
  doc.setTextColor(200, 200, 200);
  doc.setFont('helvetica', 'normal');
  doc.text('COMMISSION TRACKER', margin + 24, 22);

  // ── Period & generated date ──
  doc.setFontSize(7.5);
  doc.setTextColor(160, 160, 160);
  doc.text(`Period: ${staffName ? staffName + ' — ' : ''}${monthStr}`, margin + 24, 29);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-MY', { day:'2-digit', month:'short', year:'numeric' })}`, pageW - margin, 29, { align: 'right' });

  // ── Summary cards ──
  const totalSales   = records.reduce((s, r) => s + (+r.totalSales || 0), 0);
  const totalProject = records.reduce((s, r) => s + (+r.project || 0), 0);
  const totalMassage = records.reduce((s, r) => s + (+r.massage || 0), 0);
  const totalProduct = records.reduce((s, r) => s + (+r.product || 0), 0);

  const cardY = 44;
  const cardW = (pageW - margin * 2 - 9) / 4;
  const cards = [
    { label: 'TOTAL SALES',   val: `RM ${totalSales.toFixed(2)}` },
    { label: 'PROJECT',       val: `RM ${totalProject.toFixed(2)}` },
    { label: 'MASSAGE',       val: `RM ${totalMassage.toFixed(2)}` },
    { label: 'PRODUCT',       val: `RM ${totalProduct.toFixed(2)}` },
  ];

  cards.forEach((card, i) => {
    const x = margin + i * (cardW + 3);
    doc.setFillColor(248, 248, 248);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.rect(x, cardY, cardW, 18, 'FD');
    // left accent on first card
    if (i === 0) {
      doc.setFillColor(26, 26, 26);
      doc.rect(x, cardY, 1.5, 18, 'F');
    }
    doc.setFont('times', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(26, 26, 26);
    doc.text(card.val, x + cardW / 2, cardY + 10, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(140, 140, 140);
    doc.text(card.label, x + cardW / 2, cardY + 15, { align: 'center' });
  });

  // ── Table ──
  const tableY = cardY + 24;

  const tableRows = records.map(r => [
    r.date ? new Date(r.date).toLocaleDateString('en-MY', { day:'2-digit', month:'short' }) : '',
    r.staffName || '',
    r.cardNo ? `${r.cardNo} — ${r.customerName}` : (r.customerName || ''),
    `RM ${(+r.project || 0).toFixed(2)}`,
    `RM ${(+r.massage || 0).toFixed(2)}`,
    `RM ${(+r.product || 0).toFixed(2)}`,
    `RM ${(+r.totalSales || 0).toFixed(2)}`,
    r.remarks || ''
  ]);

  doc.autoTable({
    startY: tableY,
    head: [['Date', 'Staff', 'Customer', 'Project', 'Massage', 'Product', 'Total', 'Remarks']],
    body: tableRows,
    foot: [['', '', 'TOTAL',
      `RM ${totalProject.toFixed(2)}`,
      `RM ${totalMassage.toFixed(2)}`,
      `RM ${totalProduct.toFixed(2)}`,
      `RM ${totalSales.toFixed(2)}`,
      ''
    ]],
    margin: { left: margin, right: margin },
    styles: {
      font: 'helvetica', fontSize: 7.5,
      cellPadding: 3, textColor: [42, 42, 42],
      lineColor: [230, 230, 230], lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [26, 26, 26], textColor: [255, 255, 255],
      fontStyle: 'normal', fontSize: 7, letterSpacing: 0.5,
    },
    footStyles: {
      fillColor: [248, 248, 248], textColor: [26, 26, 26],
      fontStyle: 'bold', fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [252, 252, 252] },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 22 },
      2: { cellWidth: 30 },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 'auto' },
    },
    didDrawPage: (data) => {
      // Footer on each page
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(180, 180, 180);
      doc.text(
        `Be You Skin Management — Confidential`,
        margin, pageH - 8
      );
      doc.text(
        `Page ${data.pageNumber}`,
        pageW - margin, pageH - 8, { align: 'right' }
      );
    }
  });

  // ── Save ──
  const suffix = monthStr !== 'All Records' ? `_${monthStr.replace(' ', '_')}` : '';
  const staffSuffix = staffName ? `_${staffName.replace(/\s/g, '_')}` : '';
  doc.save(`BeYou_Commission${staffSuffix}${suffix}.pdf`);
  showToast('PDF downloaded!', 'success');
}
