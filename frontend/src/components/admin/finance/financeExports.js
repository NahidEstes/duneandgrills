const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatSar = (value) => new Intl.NumberFormat("en-SA", {
  style: "currency",
  currency: "SAR",
  currencyDisplay: "code",
  minimumFractionDigits: 2,
}).format(Number(value) || 0);

const formatAmount = (value) => new Intl.NumberFormat("en-SA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value) || 0);

const formatDate = (value) => value ? new Intl.DateTimeFormat("en-SA", {
  timeZone: "Asia/Riyadh",
  day: "2-digit",
  month: "short",
  year: "numeric",
}).format(new Date(value)) : "-";

const humanize = (value = "") => String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const periodLabel = (filters) => filters.from || filters.to
  ? `${filters.from ? formatDate(filters.from) : "Start"} to ${filters.to ? formatDate(filters.to) : "Latest"}`
  : "All dates";

const filterSummary = (filters = {}) => [
  filters.recurring === "true" ? "Recurring only" : filters.recurring === "false" ? "One-time only" : "All expense types",
  filters.vendor ? `Vendor: ${filters.vendor}` : null,
  filters.search ? `Search: ${filters.search}` : null,
  `Record state: ${humanize(filters.recordStatus || "all")}`,
].filter(Boolean);

const duneLines = `<svg class="dunes" viewBox="0 0 360 80" fill="none" aria-hidden="true"><path d="M0 76C85 76 115 12 180 39S265 14 310 12L360 35V80H0Z" fill="#f4ede2"/><path d="M0 78C90 78 105 29 165 50S250 26 360 55M40 80C115 77 135 49 190 61S282 42 360 68M110 80C180 56 225 67 270 61S320 62 360 76" stroke="#e7d9c4" stroke-width="2"/></svg>`;

export const buildExpensePdfHtml = ({ rows = [], filters = {}, categories = [], truncated = false } = {}) => {
  const totals = rows.reduce((summary, row) => ({
    total: summary.total + Number(row.recognizedAmount ?? row.totalAmount ?? 0),
    vat: summary.vat + Number(row.recognizedVat ?? row.vatAmount ?? 0),
    paid: summary.paid + Number(row.amountPaid || 0),
  }), { total: 0, vat: 0, paid: 0 });
  const tableRows = rows.map((row) => `<tr>
    <td class="id">${escapeHtml(row.expenseNumber || "Pending backfill")}</td>
    <td class="date">${escapeHtml(formatDate(row.expenseDate))}</td>
    <td><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.category?.name || "Archived category")} / ${row.recurringTemplate ? "Recurring" : "One-time"}</small></td>
    <td>${escapeHtml(row.vendor || "-")}${row.referenceNumber ? `<small>Invoice / Ref.: ${escapeHtml(row.referenceNumber)}</small>` : ""}</td>
    <td class="money">${escapeHtml(formatAmount(row.recognizedAmount ?? row.totalAmount))}<small>VAT ${escapeHtml(formatAmount(row.recognizedVat ?? row.vatAmount))}</small></td>
    <td class="money">${escapeHtml(formatAmount(row.amountPaid))}</td>
    <td><span class="status ${row.paymentStatus === "paid" ? "paid" : row.paymentStatus === "partially_paid" ? "partial" : "unpaid"}"><i></i>${escapeHtml(humanize(row.paymentStatus || "unpaid"))}</span>${row.recordStatus && row.recordStatus !== "active" ? `<small class="record-state">${escapeHtml(humanize(row.recordStatus))}</small>` : ""}</td>
  </tr>`).join("");
  const generatedAt = new Intl.DateTimeFormat("en-SA", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  const category = filters.category ? categories.find((row) => row._id === filters.category)?.name
    || rows.find((row) => row.category?._id === filters.category)?.category?.name || "Selected category" : "All categories";
  return `<header class="brand-header"><div class="brand"><img src="/logo.jpeg" alt="Dune &amp; Grills logo" width="83" height="44"><div><p class="wordmark">DUNE &amp; GRILLS</p><p class="brand-caption">FINANCE &amp; EXPENSES</p></div></div><div class="document-label"><strong>FINANCE REPORT</strong><span>${escapeHtml(periodLabel(filters))}</span></div>${duneLines}</header>
    <section class="report-heading"><div><h1>Operating Expense Report</h1><p>${escapeHtml(periodLabel(filters))} <span class="separator">/</span> Currency: SAR</p></div><div class="generated">Generated ${escapeHtml(generatedAt)}<br>Asia/Riyadh</div></section>
    <section class="filters"><div><span>Period</span><strong>${escapeHtml(periodLabel(filters))}</strong></div><div><span>Category</span><strong>${escapeHtml(category)}</strong></div><div><span>Payment status</span><strong>${escapeHtml(filters.paymentStatus ? humanize(filters.paymentStatus) : "All payment states")}</strong></div></section>
    <p class="filter-details">${filterSummary(filters).map(escapeHtml).join(" <span>/</span> ")}</p>
    <section class="summary"><article class="summary-total"><span>Total expenses</span><strong>${escapeHtml(formatSar(totals.total))}</strong></article><article><span>Amount paid</span><strong>${escapeHtml(formatSar(totals.paid))}</strong></article><article><span>Outstanding</span><strong>${escapeHtml(formatSar(totals.total - totals.paid))}</strong></article><article><span>Expense records</span><strong>${String(rows.length).padStart(2, "0")}</strong></article></section>
    <p class="vat-note">VAT included: ${escapeHtml(formatSar(totals.vat))}</p>
    ${truncated ? '<p class="notice">The export is limited to the first 5,000 matching records.</p>' : ""}
    <section class="details-heading"><h2>Expense details</h2><span>${rows.length} record${rows.length === 1 ? "" : "s"} / All amounts in SAR</span></section>
    <table><colgroup><col style="width:16%"><col style="width:10%"><col style="width:24%"><col style="width:17%"><col style="width:12%"><col style="width:10%"><col style="width:11%"></colgroup><thead><tr><th>Expense ID</th><th>Date</th><th>Expense / Category</th><th>Vendor</th><th class="money">Total<small>Recognized expense</small></th><th class="money">Paid</th><th>Status</th></tr></thead><tbody>${tableRows || '<tr><td colspan="7" class="empty">No expenses match the selected filters.</td></tr>'}</tbody><tfoot><tr><th colspan="4">Total${truncated ? " (exported records)" : ""}</th><td class="money">${escapeHtml(formatAmount(totals.total))}</td><td class="money">${escapeHtml(formatAmount(totals.paid))}</td><td></td></tr></tfoot></table>
    <aside class="report-note">Expense-date basis / Asia/Riyadh. Inventory purchases and COGS excluded.<br>Archived history included unless filtered; cancelled unpaid amounts excluded; legacy cancelled paid amounts retained.</aside>
    <footer><span>DUNE &amp; GRILLS / FINANCE &amp; EXPENSES</span><span>All amounts in SAR / Asia/Riyadh</span>${duneLines}</footer>`;
};

export const buildExpensePdfDocument = (payload) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Operating Expense Report - Dune &amp; Grills</title><style>
  @page {
    size: A4 landscape;
    margin: 10mm 10mm 16mm;
    @bottom-left { content: "DUNE & GRILLS  /  FINANCE & EXPENSES"; font: 7px Arial, sans-serif; letter-spacing: 1px; color: #57534e; border-top: 1px solid #d97706; padding-top: 3mm; vertical-align: top; }
    @bottom-center { content: "SAR / Asia/Riyadh"; font: 7px Arial, sans-serif; color: #78716c; border-top: 1px solid #d97706; padding-top: 3mm; vertical-align: top; }
    @bottom-right { content: "Page " counter(page) " / " counter(pages); font: 7px Arial, sans-serif; color: #57534e; border-top: 1px solid #d97706; padding-top: 3mm; vertical-align: top; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; color: #0a0908; background: #fff; font: 10px/1.45 Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .brand-header { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 2px solid #d97706; padding: 0 0 10px; overflow: hidden; }
  .brand { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }
  .brand img { width: 83px; height: 44px; object-fit: contain; filter: contrast(1.1); }
  .wordmark { margin: 0; font: 30px/1.1 Impact, "Arial Narrow", sans-serif; letter-spacing: 1px; }
  .brand-caption { margin: 5px 0 0; font-size: 8px; letter-spacing: 3.5px; }
  .document-label { position: relative; z-index: 1; text-align: right; padding-right: 12px; }
  .document-label strong { display: block; font: 17px/1.2 Impact, "Arial Narrow", sans-serif; letter-spacing: 1px; }
  .document-label span { display: block; margin-top: 5px; font-size: 9px; }
  .dunes { position: absolute; right: 0; bottom: 0; width: 255px; height: 57px; pointer-events: none; }
  .brand-header .dunes { opacity: .55; }
  .report-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 14px 0 12px; break-inside: avoid; }
  h1 { margin: 0 0 3px; font-size: 29px; line-height: 1.15; letter-spacing: -.8px; }
  .report-heading p { margin: 0; font-size: 12px; }
  .separator { margin: 0 8px; color: #a8a29e; }
  .generated { flex-shrink: 0; text-align: right; color: #62605f; font-size: 9px; }
  .filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid #e7d9c4; border-radius: 4px; background: #faf8f5; padding: 10px 15px; break-inside: avoid; }
  .filters div + div { border-left: 1px solid #e7d9c4; padding-left: 20px; }
  .filters div { padding-right: 15px; overflow-wrap: anywhere; }
  .filters span, .summary span { display: block; font-size: 8px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; color: #62605f; }
  .filters strong { display: block; margin-top: 3px; font-size: 11px; font-weight: 400; }
  .filter-details { margin: 5px 0 10px; color: #78716c; font-size: 8px; overflow-wrap: anywhere; }
  .filter-details span { margin: 0 6px; color: #d6c4aa; }
  .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; break-inside: avoid; }
  .summary article { border: 1px solid #e7d9c4; border-radius: 4px; padding: 10px 15px; }
  .summary strong { display: block; margin-top: 4px; font-size: 21px; line-height: 1.2; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .summary-total { border-color: #d97706 !important; background: #fff7e6; }
  .summary-total span, .summary-total strong { color: #a95308; }
  .vat-note { margin: 5px 0 10px; color: #62605f; font-size: 9px; }
  .notice { border-left: 3px solid #d97706; background: #fff7ed; padding: 7px 9px; break-inside: avoid; }
  .details-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 7px; break-after: avoid; }
  h2 { margin: 0; font-size: 18px; letter-spacing: -.3px; }
  .details-heading span { color: #62605f; font-size: 9px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
  thead { display: table-header-group; border-top: 2px solid #d97706; }
  tr { break-inside: avoid; }
  thead th { background: #1c1917; color: #fff; font-size: 8px; text-transform: uppercase; letter-spacing: .45px; }
  th, td { border-bottom: 1px solid #ece5da; padding: 6px 9px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) { background: #f8f5ef; }
  td strong { font-size: 10px; }
  td small, th small { display: block; margin-top: 2px; color: #78716c; font-size: 8px; line-height: 1.4; font-weight: 400; }
  thead small { color: #ded7cd; font-size: 6px; letter-spacing: 0; text-transform: none; }
  .id { font: 8px/1.7 Consolas, monospace; }
  .date { font-size: 8px; }
  .money { text-align: right; font-variant-numeric: tabular-nums; }
  .money small { white-space: normal; }
  .status { display: inline-flex; align-items: center; gap: 4px; border-radius: 20px; padding: 3px 6px; font-size: 8px; line-height: 1.3; }
  .status i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
  .paid { background: #e9f4e4; color: #2c681c; }
  .partial { background: #fff0d6; color: #a95700; }
  .unpaid { background: #fde7e5; color: #b42318; }
  .record-state { padding-left: 6px; }
  tfoot { display: table-row-group; border-top: 1px solid #d6c4aa; font-weight: 700; }
  tfoot th { text-transform: uppercase; }
  .empty { text-align: center; padding: 28px; color: #78716c; }
  .report-note { margin-top: 10px; color: #78716c; font-size: 8px; line-height: 1.6; break-inside: avoid; }
  footer { position: relative; display: flex; justify-content: space-between; gap: 15px; margin-top: 22px; border-top: 1px solid #d97706; padding: 9px 0 0; font-size: 8px; color: #62605f; }
  footer span { position: relative; z-index: 1; }
  footer span:first-child { letter-spacing: 1px; }
  footer .dunes { bottom: 100%; opacity: .4; }
  @media screen { body { max-width: 1123px; margin: 0 auto; padding: 36px; } }
  @media print { footer { display: none; } }
</style></head><body>${buildExpensePdfHtml(payload)}</body></html>`;

const renderExpensePdf = (popup, payload) => {
  popup.document.open();
  popup.onload = async () => {
    await popup.document.fonts.ready;
    if (!popup.closed) { popup.focus(); popup.print(); }
  };
  popup.document.write(buildExpensePdfDocument(payload));
  popup.document.close();
};

export const exportExpensePdf = async ({ loadExport, filters = {}, categories = [] }) => {
  const popup = window.open("", "_blank", "width=1200,height=820");
  if (!popup) return false;
  popup.document.write("<!doctype html><title>Preparing expense report...</title><p style='font:14px system-ui;padding:24px'>Preparing expense report...</p>");
  try {
    const result = await loadExport();
    renderExpensePdf(popup, { rows: result.data || [], filters, categories, truncated: Boolean(result.truncated) });
    return true;
  } catch (error) {
    popup.close();
    throw error;
  }
};
