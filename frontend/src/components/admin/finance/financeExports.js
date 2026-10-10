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

const formatDate = (value) => value ? new Intl.DateTimeFormat("en-SA", {
  timeZone: "Asia/Riyadh",
  day: "2-digit",
  month: "short",
  year: "numeric",
}).format(new Date(value)) : "-";

const humanize = (value = "") => String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const filterSummary = (filters = {}) => [
  filters.from || filters.to ? `Dates: ${filters.from || "Start"} to ${filters.to || "Today"}` : "All dates",
  filters.paymentStatus ? `Payment: ${humanize(filters.paymentStatus)}` : "All payment states",
  filters.recurring === "true" ? "Recurring only" : filters.recurring === "false" ? "One-time only" : "All expense types",
  filters.vendor ? `Vendor: ${filters.vendor}` : null,
  filters.search ? `Search: ${filters.search}` : null,
  `Record state: ${humanize(filters.recordStatus || "all")}`,
].filter(Boolean);

export const buildExpensePdfHtml = ({ rows = [], filters = {}, truncated = false } = {}) => {
  const totals = rows.reduce((summary, row) => ({
    total: summary.total + Number(row.recognizedAmount ?? row.totalAmount ?? 0),
    vat: summary.vat + Number(row.recognizedVat ?? row.vatAmount ?? 0),
    paid: summary.paid + Number(row.amountPaid || 0),
  }), { total: 0, vat: 0, paid: 0 });
  const tableRows = rows.map((row) => `<tr>
    <td class="id">${escapeHtml(row.expenseNumber || "Pending backfill")}</td>
    <td>${escapeHtml(formatDate(row.expenseDate))}</td>
    <td><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.category?.name || "Archived category")}</small></td>
    <td>${escapeHtml(row.vendor || "-")}</td>
    <td>${escapeHtml(row.referenceNumber || "-")}</td>
    <td class="money">${escapeHtml(formatSar(row.recognizedAmount ?? row.totalAmount))}</td>
    <td class="money">${escapeHtml(formatSar(row.recognizedVat ?? row.vatAmount))}</td>
    <td class="money">${escapeHtml(formatSar(row.amountPaid))}</td>
    <td>${escapeHtml(humanize(row.recordStatus || "active"))} · ${escapeHtml(humanize(row.paymentStatus))}</td>
    <td>${row.recurringTemplate ? "Recurring" : "One-time"}</td>
  </tr>`).join("");
  const generatedAt = new Intl.DateTimeFormat("en-SA", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  return `<header><div><p class="eyebrow">DUNE &amp; GRILLS</p><h1>Operating Expense Report</h1><p class="muted">Expense-date basis · Asia/Riyadh. Archived history included unless filtered; inventory purchases and COGS excluded. Cancelled unpaid amounts excluded; legacy cancelled paid amounts retained.</p></div><div class="generated">Generated<br><strong>${escapeHtml(generatedAt)}</strong><br>Asia/Riyadh</div></header>
    <section class="filters">${filterSummary(filters).map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</section>
    <section class="summary"><article><span>Expenses</span><strong>${escapeHtml(formatSar(totals.total))}</strong></article><article><span>VAT included</span><strong>${escapeHtml(formatSar(totals.vat))}</strong></article><article><span>Paid</span><strong>${escapeHtml(formatSar(totals.paid))}</strong></article><article><span>Outstanding</span><strong>${escapeHtml(formatSar(totals.total - totals.paid))}</strong></article><article><span>Records</span><strong>${rows.length}</strong></article></section>
    ${truncated ? '<p class="notice">The export is limited to the first 5,000 matching records.</p>' : ""}
    <table><thead><tr><th>Expense ID</th><th>Date</th><th>Expense / Category</th><th>Vendor</th><th>Invoice / Ref.</th><th>Recognized expense</th><th>Recognized VAT</th><th>Paid</th><th>Status</th><th>Type</th></tr></thead><tbody>${tableRows || '<tr><td colspan="10" class="empty">No expenses match the selected filters.</td></tr>'}</tbody></table>
    <footer>Generated from Dune &amp; Grills Finance &amp; Expenses. Amounts are shown in SAR.</footer>`;
};

const renderExpensePdf = (popup, payload) => {
  const body = buildExpensePdfHtml(payload);
  popup.document.open();
  popup.onload = () => { popup.focus(); popup.print(); };
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Operating Expense Report</title><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#1c1917;font:10px/1.4 Arial,sans-serif}header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #e77900;padding-bottom:14px}.eyebrow{margin:0;color:#c65f00;font-size:11px;font-weight:800;letter-spacing:2px}h1{margin:3px 0 2px;font-size:24px}.muted{margin:0;color:#6b6560}.generated{text-align:right;color:#777;font-size:9px}.generated strong{color:#292524}.filters{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.filters span{border:1px solid #ddd6ce;border-radius:999px;padding:4px 8px;color:#57534e}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:12px 0 16px}.summary article{border:1px solid #e7e2dc;border-radius:8px;background:#faf9f7;padding:9px}.summary span{display:block;color:#78716c;font-size:8px;text-transform:uppercase;letter-spacing:.6px}.summary strong{display:block;margin-top:3px;font-size:13px}.notice{border-left:3px solid #e77900;background:#fff7ed;padding:7px 9px}table{width:100%;border-collapse:collapse;table-layout:auto}thead{display:table-header-group}tr{break-inside:avoid}th{background:#1c1917;color:#fff;font-size:8px;text-transform:uppercase;letter-spacing:.4px}th,td{border-bottom:1px solid #e7e2dc;padding:7px 6px;text-align:left;vertical-align:top}td small{display:block;margin-top:2px;color:#78716c}.id{white-space:nowrap;color:#b45309;font-family:Consolas,monospace;font-weight:700}.money{white-space:nowrap;text-align:right}.empty{text-align:center;padding:30px;color:#78716c}footer{margin-top:14px;border-top:1px solid #e7e2dc;padding-top:8px;color:#78716c;font-size:8px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>${body}</body></html>`);
  popup.document.close();
};

export const exportExpensePdf = async ({ loadExport, filters = {} }) => {
  const popup = window.open("", "_blank", "width=1200,height=820");
  if (!popup) return false;
  popup.document.write("<!doctype html><title>Preparing expense report...</title><p style='font:14px system-ui;padding:24px'>Preparing expense report...</p>");
  try {
    const result = await loadExport();
    renderExpensePdf(popup, { rows: result.data || [], filters, truncated: Boolean(result.truncated) });
    return true;
  } catch (error) {
    popup.close();
    throw error;
  }
};
