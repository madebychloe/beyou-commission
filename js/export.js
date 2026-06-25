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

  const headers = ['Date', 'Staff', 'Card No', 'Customer Name', 'Project (RM)', 'Massage (RM)', 'Product (RM)', 'Total Sales (RM)', '依克多因面膜 (RM)', '针剂 Injection (RM)', 'Remarks'];
  const rows = records.map(r => [
    r.date ? new Date(r.date).toLocaleDateString('en-MY') : '',
    r.staffName, r.cardNo ? String(r.cardNo).padStart(4,'0') : '', r.customerName,
    parseFloat(r.project)    || 0,
    parseFloat(r.massage)    || 0,
    parseFloat(r.product)    || 0,
    parseFloat(r.amountCollected) || 0,
    parseFloat(r.ekoin) || 0,
    parseFloat(r.injection) || 0,
    r.remarks || ''
  ]);

  const totalsRow = ['', '', '', 'TOTAL',
    rows.reduce((s, r) => s + r[4], 0),
    rows.reduce((s, r) => s + r[5], 0),
    rows.reduce((s, r) => s + r[6], 0),
    rows.reduce((s, r) => s + r[7], 0),
    rows.reduce((s, r) => s + r[8], 0),
    rows.reduce((s, r) => s + r[9], 0),
    ''
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows, [], totalsRow]);
  ws['!cols'] = [{ wch:12 },{ wch:16 },{ wch:8 },{ wch:22 },{ wch:14 },{ wch:14 },{ wch:14 },{ wch:20 },{ wch:16 },{ wch:16 },{ wch:24 }];

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
// ─── Load html2canvas lazily ──────────────────
function loadHtml2Canvas() {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function exportToPDF() {
  showToast('Preparing PDF…');

  try {
    await loadJsPDF();
    await loadHtml2Canvas();
  } catch(e) {
    showToast('Could not load PDF library.', 'error');
    return;
  }

  const records = await fetchExportRecords();
  if (!records.length) { showToast('No records to export.', 'error'); return; }

  const { monthStr, staffName } = getExportTitle();

  // Totals
  const totalCollected = records.reduce((s,r) => s + (+r.amountCollected||0), 0);
  const totalProject   = records.reduce((s,r) => s + (+r.project||0), 0);
  const totalMassage   = records.reduce((s,r) => s + (+r.massage||0), 0);
  const totalProduct   = records.reduce((s,r) => s + (+r.product||0), 0);
  const totalEkoin      = records.reduce((s,r) => s + (+r.ekoin||0), 0);
  const totalInjection  = records.reduce((s,r) => s + (+r.injection||0), 0);

  const genDate = new Date().toLocaleDateString('en-MY', {day:'2-digit', month:'short', year:'numeric'});
  const periodLabel = staffName ? `${staffName} — ${monthStr}` : monthStr;

  // Build off-screen HTML with full Chinese support
  const container = document.createElement('div');
  container.style.cssText = `
    position:fixed; left:-9999px; top:0;
    width:1050px; background:#fff;
    font-family:'Inter',Arial,sans-serif;
    font-size:11px; color:#1a1a1a;
    padding:0;
  `;

  container.innerHTML = `
    <!-- Header -->
    <div style="background:#1a1a1a;padding:20px 28px;display:flex;align-items:center;gap:20px">
      <div style="width:52px;height:52px;border:2px solid #fff;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <div style="position:absolute;width:46px;height:46px;border:1px solid #aaa"></div>
        <span style="font-family:Georgia,serif;font-size:16px;color:#fff;letter-spacing:0.1em;position:relative">BE</span>
      </div>
      <div style="flex:1">
        <div style="font-size:16px;font-weight:600;color:#fff;letter-spacing:0.1em">BE YOU SKIN MANAGEMENT</div>
        <div style="font-size:10px;color:#ccc;letter-spacing:0.1em;margin-top:3px">COMMISSION TRACKER</div>
        <div style="font-size:10px;color:#aaa;margin-top:4px">Period: ${periodLabel}</div>
      </div>
      <div style="font-size:10px;color:#aaa;text-align:right">Generated: ${genDate}</div>
    </div>

    <!-- Summary cards -->
    <div style="display:flex;gap:0;border-bottom:1px solid #eee">
      ${[
        ['TOTAL SALES',     totalCollected, true],
        ['PROJECT', totalProject, false],
        ['MASSAGE', totalMassage, false],
        ['PRODUCT', totalProduct, false],
        ['依克多因面膜', totalEkoin, false],
      ].map(([label, val, accent]) => `
        <div style="flex:1;padding:14px 16px;border-right:1px solid #eee;${accent?'border-left:3px solid #1a1a1a':''}">
          <div style="font-size:18px;font-weight:300;font-family:Georgia,serif">RM ${val.toFixed(2)}</div>
          <div style="font-size:9px;letter-spacing:0.12em;color:#888;margin-top:3px">${label}</div>
        </div>`).join('')}
    </div>

    <!-- Table -->
    <table style="width:100%;border-collapse:collapse;font-size:10px">
      <thead>
        <tr style="background:#1a1a1a;color:#fff">
          <th style="padding:8px 10px;text-align:left;font-weight:500;letter-spacing:0.06em;width:52px;white-space:nowrap">Date</th>
          <th style="padding:8px 10px;text-align:left;font-weight:500;letter-spacing:0.06em;width:70px;white-space:nowrap">Staff</th>
          <th style="padding:8px 10px;text-align:center;font-weight:500;letter-spacing:0.06em;width:48px;white-space:nowrap">Card No</th>
          <th style="padding:8px 10px;text-align:left;font-weight:500;letter-spacing:0.06em;width:90px;white-space:nowrap">Customer</th>
          <th style="padding:8px 10px;text-align:right;font-weight:500;letter-spacing:0.06em;width:70px">Project</th>
          <th style="padding:8px 10px;text-align:right;font-weight:500;letter-spacing:0.06em;width:70px">Massage</th>
          <th style="padding:8px 10px;text-align:right;font-weight:500;letter-spacing:0.06em;width:70px">Product</th>
          <th style="padding:8px 10px;text-align:right;font-weight:500;letter-spacing:0.06em;width:85px;white-space:nowrap">Total Sales</th>
          <th style="padding:8px 10px;text-align:right;font-weight:500;letter-spacing:0.06em;width:90px;white-space:nowrap">依克多因面膜</th>
          <th style="padding:8px 10px;text-align:right;font-weight:500;letter-spacing:0.06em;width:90px;white-space:nowrap">针剂 Injection</th>
          <th style="padding:8px 10px;text-align:left;font-weight:500;letter-spacing:0.06em;white-space:nowrap">Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${records.map((r, i) => `
          <tr style="background:${i%2===0?'#fff':'#f8f8f8'};border-bottom:1px solid #eee">
            <td style="padding:7px 10px">${r.date ? new Date(r.date).toLocaleDateString('en-MY',{day:'2-digit',month:'short'}) : ''}</td>
            <td style="padding:7px 10px">${r.staffName||''}</td>
            <td style="padding:7px 10px;text-align:center">${r.cardNo ? String(r.cardNo).padStart(4,'0') : ''}</td>
            <td style="padding:7px 10px">${r.customerName||''}</td>
            <td style="padding:7px 10px;text-align:right">RM ${(+r.project||0).toFixed(2)}</td>
            <td style="padding:7px 10px;text-align:right">RM ${(+r.massage||0).toFixed(2)}</td>
            <td style="padding:7px 10px;text-align:right">RM ${(+r.product||0).toFixed(2)}</td>
            <td style="padding:7px 10px;text-align:right;font-weight:600">RM ${(+r.amountCollected||0).toFixed(2)}</td>
            <td style="padding:7px 10px;text-align:right">RM ${(+r.ekoin||0).toFixed(2)}</td>
            <td style="padding:7px 10px;text-align:right">RM ${(+r.injection||0).toFixed(2)}</td>
            <td style="padding:7px 10px;color:#666">${r.remarks||''}</td>
          </tr>`).join('')}
        <!-- Totals row -->
        <tr style="background:#f0f0f0;border-top:2px solid #1a1a1a;font-weight:700">
          <td style="padding:8px 10px;font-weight:700" colspan="4">TOTAL</td>
          <td style="padding:8px 10px;text-align:right">RM ${totalProject.toFixed(2)}</td>
          <td style="padding:8px 10px;text-align:right">RM ${totalMassage.toFixed(2)}</td>
          <td style="padding:8px 10px;text-align:right">RM ${totalProduct.toFixed(2)}</td>
          <td style="padding:8px 10px;text-align:right">RM ${totalCollected.toFixed(2)}</td>
          <td style="padding:8px 10px;text-align:right">RM ${totalEkoin.toFixed(2)}</td>
          <td style="padding:8px 10px;text-align:right">RM ${totalInjection.toFixed(2)}</td>
          <td style="padding:8px 10px"></td>
        </tr>
      </tbody>
    </table>

    <!-- Footer -->
    <div style="padding:10px 28px;border-top:1px solid #eee;display:flex;justify-content:space-between;color:#aaa;font-size:9px;letter-spacing:0.06em">
      <span>BE YOU SKIN MANAGEMENT — CONFIDENTIAL</span>
      <span>${periodLabel}</span>
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const { jsPDF } = window.jspdf;

    // A4 landscape
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();

    const imgW = canvas.width;
    const imgH = canvas.height;
    const ratio = pdfW / imgW;
    const scaledH = imgH * ratio;

    // If content fits one page
    if (scaledH <= pdfH) {
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, scaledH);
    } else {
      // Multi-page — slice canvas
      let yOffset = 0;
      const pageHeightPx = pdfH / ratio;
      while (yOffset < imgH) {
        const sliceH = Math.min(pageHeightPx, imgH - yOffset);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = imgW;
        pageCanvas.height = sliceH;
        const ctx = pageCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, -yOffset);
        const pageImg = pageCanvas.toDataURL('image/jpeg', 0.95);
        if (yOffset > 0) pdf.addPage();
        pdf.addImage(pageImg, 'JPEG', 0, 0, pdfW, sliceH * ratio);
        yOffset += pageHeightPx;
      }
    }

    const suffix = monthStr !== 'All Records' ? `_${monthStr.replace(' ', '_')}` : '';
    const staffSuffix = staffName ? `_${staffName.replace(/\s/g, '_')}` : '';
    pdf.save(`BeYou_Commission${staffSuffix}${suffix}.pdf`);
    showToast('PDF downloaded!', 'success');

  } finally {
    document.body.removeChild(container);
  }
}

