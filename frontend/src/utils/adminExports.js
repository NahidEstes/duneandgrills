import { formatAdminCurrency, formatAdminDate } from "../components/admin/adminUi.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export const downloadCsv = (filename, headings, rows) => {
  const csv = [headings.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const openPrintWindow = (title, body) => {
  const popup = window.open("", "_blank", "width=900,height=760");
  if (!popup) return false;
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>body{font:14px system-ui;margin:36px;color:#171717}h1{margin:0;font-size:24px}h2{font-size:16px;margin-top:28px}.muted{color:#666}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:22px 0;padding:16px;background:#f5f5f5}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{padding:10px 8px;border-bottom:1px solid #ddd;text-align:left}th:last-child,td:last-child{text-align:right}.totals{margin:22px 0 0 auto;width:320px}.totals div{display:flex;justify-content:space-between;padding:6px}.total{font-size:18px;font-weight:700;border-top:2px solid #222}.reason{padding:12px;background:#fff5e8;border-left:3px solid #f28c00}@media print{button{display:none}}</style></head><body>${body}<script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
  return true;
};

export const printOrderInvoice = (order) => {
  const items = (order.items || []).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(formatAdminCurrency(item.price))}</td><td>${escapeHtml(formatAdminCurrency(item.price * item.quantity))}</td></tr>`).join("");
  const reason = order.refundReason || order.cancellationReason;
  return openPrintWindow(`Invoice ${order.orderNumber}`, `<h1>DUNE &amp; GRILLS</h1><p class="muted">ORDER INVOICE</p><div class="meta"><span>Order <strong>#${escapeHtml(order.orderNumber)}</strong></span><span>Date ${escapeHtml(formatAdminDate(order.createdAt, { hour: "2-digit", minute: "2-digit" }))}</span><span>Customer ${escapeHtml(order.customer?.name || "Guest")}</span><span>Status ${escapeHtml(order.status)}</span><span>Source ${escapeHtml(order.source || "website")}</span><span>Type ${escapeHtml(order.orderType)}</span></div><table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${items}</tbody></table><div class="totals"><div><span>Subtotal</span><span>${escapeHtml(formatAdminCurrency(order.subtotal ?? order.originalSubtotal))}</span></div>${Number(order.discountAmount) ? `<div><span>Discount</span><span>-${escapeHtml(formatAdminCurrency(order.discountAmount))}</span></div>` : ""}${Number(order.deliveryFee) ? `<div><span>Delivery</span><span>${escapeHtml(formatAdminCurrency(order.deliveryFee))}</span></div>` : ""}<div class="total"><span>Total</span><span>${escapeHtml(formatAdminCurrency(order.totalAmount))}</span></div></div>${reason ? `<p class="reason"><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ""}`);
};

export const exportAnalyticsCsv = (analytics) => downloadCsv(
  `sales-analytics-${analytics.range.from}-to-${analytics.range.to}.csv`,
  ["Date", "Orders", "Revenue SAR"],
  analytics.series.map((row) => [row.date, row.orders, row.revenue])
);

export const printAnalyticsReport = (analytics) => {
  const rows = analytics.series.map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${row.orders}</td><td>${escapeHtml(formatAdminCurrency(row.revenue))}</td></tr>`).join("");
  return openPrintWindow("Sales Analytics", `<h1>DUNE &amp; GRILLS</h1><p class="muted">SALES ANALYTICS · ${escapeHtml(analytics.range.from)} — ${escapeHtml(analytics.range.to)}</p><div class="meta"><span>Revenue <strong>${escapeHtml(formatAdminCurrency(analytics.summary.totalRevenue))}</strong></span><span>Orders <strong>${analytics.summary.totalOrders}</strong></span><span>Average order <strong>${escapeHtml(formatAdminCurrency(analytics.summary.averageOrderValue))}</strong></span><span>Discounts <strong>${escapeHtml(formatAdminCurrency(analytics.summary.discountTotal))}</strong></span><span>Refunds <strong>${escapeHtml(formatAdminCurrency(analytics.summary.refundTotal))}</strong></span></div><h2>Daily performance</h2><table><thead><tr><th>Date</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>${rows}</tbody></table>`);
};
