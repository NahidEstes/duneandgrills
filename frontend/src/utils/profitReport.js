import { formatAdminCurrency, formatAdminDate } from "../components/admin/adminUi.js";
export const profitMoney = value => value === null || value === undefined ? "Unavailable" : formatAdminCurrency(value);
export const profitPercent = value => value === null || value === undefined ? "Unavailable" : `${value}%`;
// Display and both exports consume these server-calculated values, never a
// second profit formula. Missing amounts remain explicit, including in CSV.
export function profitMetricRows(report) {
  return [
    ["Ordered amount (not collections)", report.sales.orderedAmount],
    ["Captured sales after discounts, before reversals", report.sales.grossSales],
    ["Discounts already included (do not subtract again)", report.sales.discountTotal],
    ["Completed refunds (order cohort)", report.sales.completedRefunds],
    ["Captured void adjustment", report.sales.voidAmount],
    ["Recognized net sales", report.sales.netSales],
    ["Recorded captures (not bank settlement)", report.sales.collectedAmount],
    ["Dated activity: recorded collections", report.cashActivity?.collectedAmount ?? null],
    ["Dated activity: completed refunds", report.cashActivity?.completedRefunds ?? null],
    ["Dated activity: net recorded collections", report.cashActivity?.netCollected ?? null],
    ["Undated historical collections (not assigned to this period)", report.cashActivity?.unknownPaymentDateAmount ?? null],
    ["Undated historical refunds (not assigned to this period)", report.cashActivity?.unknownRefundDateAmount ?? null],
    ["Recorded historical food cost", report.food.recordedCost],
    ["Estimated historical food cost (separate)", report.food.estimatedCost],
    ["Partial known food cost on incomplete orders", report.food.partialKnownCost],
    ["Waste / damage: recorded cost", report.waste.recordedCost],
    ["Waste / damage: estimated cost", report.waste.estimatedCost],
    ["Operating expenses (restaurant-wide, VAT included)", report.expenses.amount],
    ["Expense VAT already included (not another deduction)", report.expenses.vatIncluded],
    ["Confirmed platform commission separately evidenced", report.commissions.amount],
    ["Recorded platform order value", report.platform.orderedValue ?? null],
    ["Other platform settlement adjustments", report.platform.adjustments],
    ["Platform pricing variance (not commission)", report.platform.pricingVariance],
    ["Gross profit: complete recorded cost only", report.metrics.grossProfit],
    ["Estimated gross profit (not verified)", report.metrics.estimatedGrossProfit],
    ["Recorded-basis operating profit (indicative)", report.metrics.operatingProfit],
    ["Estimated operating profit (not verified)", report.metrics.estimatedOperatingProfit],
    ["Net profit (not asserted)", report.metrics.netProfit],
  ];
}
export function buildProfitCsvRows(report) {
  return [
    ["Dune & Grills — Profit & Cost Report", "SAR", "Asia/Riyadh"],
    ["Period", report.range.from, report.range.to], ["Source", report.filters.source], ["Generated at", report.generatedAt], ["Report status", report.status],
    ["Metric", "Server value SAR"], ...profitMetricRows(report).map(([label, value]) => [label, value ?? "Unavailable"]),
    ["Food cost percentage", report.metrics.foodCostPercentage ?? "Unavailable"], ["Gross margin %", report.metrics.grossMargin ?? "Unavailable"], ["Operating margin %", report.metrics.operatingMargin ?? "Unavailable"],
    ["Captured orders with missing cost", report.food.missingOrders], ["Orders with estimated cost", report.food.estimatedOrders], ["Missing waste cost movements", report.waste.missingMovements], ["Undated waste movements", report.waste.undatedMovements],
    ["Channel", "Net sales SAR", "Recorded food cost SAR", "Missing/estimated orders", "Gross profit SAR", "Operating profit SAR"],
    ...report.channels.map(row => [row.source, row.netSales, row.recordedFoodCost, row.missingOrEstimatedOrders, row.grossProfit ?? "Unavailable", "Not allocated"]),
    ...Object.entries(report.definitions).map(([key, definition]) => [`Definition: ${key}`, definition]),
    ...report.warnings.map(warning => ["Limitation", warning]),
    ...report.gaps.map(row => ["Cost evidence", row.orderNumber, row.quality, row.reasons.join("; ")]),
  ];
}
export function downloadProfitCsv(report) {
  const cell = value => { const text = String(value ?? ""); return `"${(typeof value === "string" && /^[=+@\-\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`; };
  const blob = new Blob(["\uFEFF" + buildProfitCsvRows(report).map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = `profit-cost-${report.range.from}-${report.range.to}.csv`; anchor.click(); URL.revokeObjectURL(url);
}
const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
export function buildProfitPrintHtml(report) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Profit &amp; Cost Report</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:12px/1.5 Arial,sans-serif;color:#161616}h1{border-bottom:3px solid #d97706}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{text-align:left;border-bottom:1px solid #ccc;padding:7px;vertical-align:top}th{background:#eee}tr{break-inside:avoid}.warning{padding:10px;border:1px solid #d97706}dt{font-weight:bold;margin-top:8px}dd{margin:0 0 5px}footer{margin-top:20px;color:#555}</style></head><body><h1>DUNE &amp; GRILLS — Profit &amp; Cost Report</h1><p>${escape(report.range.from)} to ${escape(report.range.to)} · Source: ${escape(report.filters.source)} · SAR · Asia/Riyadh<br>Generated: ${escape(formatAdminDate(report.generatedAt, { hour: "2-digit", minute: "2-digit", second: "2-digit" }))} · ${escape(report.status)}</p><aside class="warning">Indicative recorded-amount report. Net profit is not asserted. Missing/estimated cost orders: ${escape(report.food.missingOrders)} / ${escape(report.food.estimatedOrders)}. Waste movements with missing cost: ${escape(report.waste.missingMovements)}; undated waste: ${escape(report.waste.undatedMovements)}.<ul>${report.warnings.map(text => `<li>${escape(text)}</li>`).join("")}</ul></aside><table><thead><tr><th>Metric</th><th>SAR</th></tr></thead><tbody>${profitMetricRows(report).map(([label,value]) => `<tr><td>${escape(label)}</td><td>${escape(profitMoney(value))}</td></tr>`).join("")}</tbody></table><p>Food cost: ${escape(profitPercent(report.metrics.foodCostPercentage))} · Gross margin: ${escape(profitPercent(report.metrics.grossMargin))} · Operating margin: ${escape(profitPercent(report.metrics.operatingMargin))}</p><h2>Channel comparison — shared waste/expenses not allocated</h2><table><thead><tr><th>Channel</th><th>Net sales SAR</th><th>Recorded food cost SAR</th><th>Missing/estimated orders</th><th>Gross profit SAR</th></tr></thead><tbody>${report.channels.map(row => `<tr><td>${escape(row.source)}</td><td>${escape(profitMoney(row.netSales))}</td><td>${escape(profitMoney(row.recordedFoodCost))}</td><td>${escape(row.missingOrEstimatedOrders)}</td><td>${escape(profitMoney(row.grossProfit))}</td></tr>`).join("")}</tbody></table><h2>Definitions</h2><dl>${Object.entries(report.definitions).map(([key,text]) => `<dt>${escape(key)}</dt><dd>${escape(text)}</dd>`).join("")}</dl><footer>Dune &amp; Grills · Same server snapshot as the screen/CSV · Not a tax return or confirmed net-profit statement.</footer></body></html>`;
}
export function printProfitReport(report) {
  const popup = window.open("", "_blank", "width=1200,height=820"); if (!popup) return false;
  popup.onload = async () => { await popup.document.fonts.ready; if (!popup.closed) { popup.focus(); popup.print(); } };
  popup.document.write(buildProfitPrintHtml(report)); popup.document.close(); return true;
}
