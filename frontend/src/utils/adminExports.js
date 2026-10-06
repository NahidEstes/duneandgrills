import { formatAdminCurrency, formatAdminDate } from "../components/admin/adminUi.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

const itemCustomizationHtml = (item = {}) => {
  const parts = [];
  if (item.selectedAddOns?.length) parts.push(`Add-ons: ${item.selectedAddOns.map((addOn) => addOn.name ? `${addOn.name}${(addOn.quantity || 1) > 1 ? ` x${addOn.quantity}` : ""}` : "").filter(Boolean).join(", ")}`);
  if (item.spiceLevel) parts.push(`Spice: ${item.spiceLevel.replaceAll("-", " ")}`);
  if (item.itemNote) parts.push(`Note: ${item.itemNote}`);
  return parts.length ? `<div class="muted" style="font-size:11px;margin-top:3px">${parts.map(escapeHtml).join(" · ")}</div>` : "";
};

export const downloadCsv = (filename, headings, rows) => {
  const csv = [headings.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const openPrintWindow = (title, body, width = 900) => {
  const popup = window.open("", "_blank", `width=${width},height=760`);
  if (!popup) return false;
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>body{font:14px system-ui;margin:36px;color:#171717}h1{margin:0;font-size:24px}h2{font-size:16px;margin-top:28px}.muted{color:#666}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:22px 0;padding:16px;background:#f5f5f5}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{padding:10px 8px;border-bottom:1px solid #ddd;text-align:left}th:last-child,td:last-child{text-align:right}.totals{margin:22px 0 0 auto;width:320px}.totals div{display:flex;justify-content:space-between;padding:6px}.total{font-size:18px;font-weight:700;border-top:2px solid #222}.reason{padding:12px;background:#fff5e8;border-left:3px solid #f28c00}@media print{button{display:none}}</style></head><body>${body}<script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
  return true;
};

const receiptIdentity = (settings = {}, fallbackHeader = "ORDER INVOICE") => {
  const receipt = settings.receipt || {};
  const location = settings.location || {};
  const displayName = receipt.displayName || "Dune & Grills";
  const header = receipt.header || fallbackHeader;
  const address = receipt.address || [location.address, location.city, location.country].filter(Boolean).join(", ");
  const contacts = [receipt.phone || location.phone, receipt.email || location.email, receipt.websiteUrl].filter(Boolean);
  return `${receipt.logoUrl ? `<img src="${escapeHtml(receipt.logoUrl)}" alt="" style="display:block;max-height:64px;max-width:180px;margin:0 auto 12px">` : ""}<h1>${escapeHtml(displayName)}</h1><p class="muted">${escapeHtml(header)}</p>${address ? `<p class="muted">${escapeHtml(address)}</p>` : ""}${contacts.length ? `<p class="muted">${contacts.map(escapeHtml).join(" · ")}</p>` : ""}`;
};

export const printOrderInvoice = (order, settings = {}) => {
  const items = (order.items || []).map((item) => `<tr><td>${escapeHtml(item.name)}${itemCustomizationHtml(item)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(formatAdminCurrency(item.price))}</td><td>${escapeHtml(formatAdminCurrency(item.price * item.quantity))}</td></tr>`).join("");
  const reason = order.refundReason || order.cancellationReason;
  return openPrintWindow(`Invoice ${order.orderNumber}`, `${receiptIdentity(settings)}<div class="meta"><span>Order <strong>#${escapeHtml(order.orderNumber)}</strong></span><span>Date ${escapeHtml(formatAdminDate(order.createdAt, { hour: "2-digit", minute: "2-digit" }))}</span><span>Customer ${escapeHtml(order.customer?.name || "Guest")}</span><span>Status ${escapeHtml(order.status)}</span><span>Source ${escapeHtml(order.source || "website")}</span><span>Type ${escapeHtml(order.orderType)}</span></div><table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${items}</tbody></table><div class="totals"><div><span>Subtotal</span><span>${escapeHtml(formatAdminCurrency(order.subtotal ?? order.originalSubtotal))}</span></div>${Number(order.discountAmount) ? `<div><span>Discount</span><span>-${escapeHtml(formatAdminCurrency(order.discountAmount))}</span></div>` : ""}${Number(order.deliveryFee) ? `<div><span>Delivery</span><span>${escapeHtml(formatAdminCurrency(order.deliveryFee))}</span></div>` : ""}<div class="total"><span>Total</span><span>${escapeHtml(formatAdminCurrency(order.totalAmount))}</span></div></div>${reason ? `<p class="reason"><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ""}${settings.receipt?.footer ? `<p class="muted">${escapeHtml(settings.receipt.footer)}</p>` : ""}`);
};

export const printPosReceipt = (sale, settings = {}) => {
  const itemRows = (sale.items || []).map((item) => `<tr><td>${escapeHtml(item.name)} ×${escapeHtml(item.quantity)}${itemCustomizationHtml(item)}</td><td>${escapeHtml(formatAdminCurrency(item.price * item.quantity))}</td></tr>`).join("");
  const body = `${receiptIdentity(settings, "POS SALES RECEIPT")}${sale.isReprint ? '<p><strong>REPRINT / DUPLICATE</strong></p>' : ""}<p class="muted">Status: ${escapeHtml(sale.status)} · ${escapeHtml(sale.paymentStatus)} · Terminal: ${escapeHtml(sale.terminalSnapshot?.name || sale.terminal || "MAIN")}</p>${Number(sale.refundedAmount) > 0 ? `<p>Refunded: ${escapeHtml(formatAdminCurrency(sale.refundedAmount))}</p>` : ""}<div class="meta"><span>Order</span><strong>#${escapeHtml(sale.orderNumber)}</strong><span>Date</span><span>${escapeHtml(formatAdminDate(sale.createdAt, { hour: "2-digit", minute: "2-digit" }))}</span><span>Cashier</span><span>${escapeHtml(sale.createdBy?.name || "—")}</span><span>Order type</span><span>${escapeHtml(sale.orderType)}</span>${sale.pickupToken ? `<span>Pickup token</span><strong>${escapeHtml(sale.pickupToken)}</strong>` : ""}${sale.orderType === "takeaway" && sale.customer?.name ? `<span>Pickup name</span><span>${escapeHtml(sale.customer.name)}</span>` : ""}</div>${sale.pickupNote ? `<p class="reason"><strong>Pickup note:</strong> ${escapeHtml(sale.pickupNote)}</p>` : ""}<table>${itemRows}<tr><td>Subtotal</td><td>${escapeHtml(formatAdminCurrency(sale.subtotal))}</td></tr>${Number(sale.discountAmount) ? `<tr><td>Discount</td><td>-${escapeHtml(formatAdminCurrency(sale.discountAmount))}</td></tr>` : ""}<tr class="total"><td>Total</td><td>${escapeHtml(formatAdminCurrency(sale.totalAmount))}</td></tr></table><div class="meta"><span>Payment</span><span>${escapeHtml(sale.paymentMethod)}</span>${sale.paymentMethod === "cash" ? `<span>Cash received</span><span>${escapeHtml(formatAdminCurrency(sale.cashReceived))}</span><span>Change</span><span>${escapeHtml(formatAdminCurrency(sale.changeDue))}</span>` : ""}</div><p class="muted">${escapeHtml(settings.receipt?.footer || "Thank you for visiting Dune & Grills.")}</p>`;
  return openPrintWindow(`Receipt ${sale.orderNumber}`, body, 440);
};

export const printPosRefundRecord = (sale, refund, settings = {}) => openPrintWindow(
  `Refund record ${sale.orderNumber}`,
  `${receiptIdentity(settings, "MANUAL POS REFUND RECORD")}<p class="muted">Internal refund record only — not a tax/fiscal credit note.</p><div class="meta"><span>Order</span><strong>#${escapeHtml(sale.orderNumber)}</strong><span>Refund record</span><span>${escapeHtml(refund.refundNumber || refund._id)}</span><span>Status</span><span>${escapeHtml(refund.status)}</span><span>Method</span><span>${escapeHtml(refund.method)}</span><span>Amount</span><strong>${escapeHtml(formatAdminCurrency(refund.amount))}</strong><span>Recorded</span><span>${escapeHtml(formatAdminDate(refund.completedAt || refund.createdAt, { hour: "2-digit", minute: "2-digit" }))}</span><span>Terminal</span><span>${escapeHtml(refund.terminalSnapshot?.code || sale.terminal || "MAIN")}</span><span>External reference</span><span>${escapeHtml(refund.externalReference || "—")}</span></div><p><strong>Reason:</strong> ${escapeHtml(refund.reason)}</p><p class="muted">${refund.restock ? "Returned stock restoration requested; applied only on completion." : "No inventory restoration."} Card/Other payments are manually recorded, not provider-verified.</p>`,
  440,
);

export const buildAnalyticsCsvRows = (analytics) => {
  const metricKeys = ["orderedAmount", "grossSales", "collectedAmount", "completedRefunds", "voidAmount", "netSales"];
  const money = row => metricKeys.map(key => row[key] ?? 0);
  const rows = [
    ["Order-date summary · Asia/Riyadh", `${analytics.range.from} to ${analytics.range.to}`, analytics.summary.totalOrders, ...money(analytics.summary)],
    ...analytics.series.map(row => ["Order date · Asia/Riyadh", row.date, row.orders, ...money(row)]),
    ...(analytics.sourceBreakdown || []).map(row => ["Order-date source", row.source, row.orders, ...money(row)]),
    ...(analytics.orderTypeBreakdown || []).map(row => ["Order-date type", row.orderType, row.orders, ...money(row)]),
    ["Event-date activity · Asia/Riyadh", `${analytics.range.from} to ${analytics.range.to}`, "", "", "", analytics.cashActivity?.collectedAmount ?? 0, analytics.cashActivity?.completedRefunds ?? 0, analytics.cashActivity?.voidAmount ?? 0, analytics.cashActivity?.netCollected ?? 0],
    ...Object.entries(analytics.definitions || {}).map(([key, value]) => [`Definition: ${key}`, value]),
    ["Unknown payment dates · full source/type history", analytics.cashActivity?.unknownPaymentDateAmount ?? 0],
    ["Unknown refund dates · full source/type history", analytics.cashActivity?.unknownRefundDateAmount ?? 0],
    ["Source filter", analytics.filters?.source || "all"], ["Order type filter", analytics.filters?.orderType || "all"],
  ];
  return rows;
};

export const exportAnalyticsCsv = (analytics) => downloadCsv(
  `sales-analytics-${analytics.range.from}-${analytics.range.to}.csv`,
  ["Basis", "Date / label", "Orders", "Ordered SAR", "Gross sales SAR", "Recorded captures SAR", "Completed refunds SAR", "Voids SAR", "Net sales / event net collections SAR"],
  buildAnalyticsCsvRows(analytics),
);

export const buildAnalyticsReportHtml = (analytics) => {
  const keys = [["Ordered amount", "orderedAmount"], ["Gross sales", "grossSales"], ["Recorded collections before reversals", "collectedAmount"], ["Completed refunds", "completedRefunds"], ["Voids", "voidAmount"], ["Net sales (not profit)", "netSales"]];
  const rows = analytics.series.map(row => `<tr><td>${escapeHtml(row.date)}</td><td>${row.orders}</td>${keys.map(([, key]) => `<td>${escapeHtml(formatAdminCurrency(row[key]))}</td>`).join("")}</tr>`).join("");
  return `<h1>DUNE &amp; GRILLS</h1><p class="muted">SALES ANALYTICS · ${escapeHtml(analytics.range.from)} — ${escapeHtml(analytics.range.to)} · Asia/Riyadh · Source: ${escapeHtml(analytics.filters?.source || "all")} · Type: ${escapeHtml(analytics.filters?.orderType || "all")}</p><h2>Order-date sales</h2><div class="meta">${keys.map(([label, key]) => `<span>${label} <strong>${escapeHtml(formatAdminCurrency(analytics.summary[key]))}</strong></span>`).join("")}<span>Aggregator prepaid (not restaurant collection) ${escapeHtml(formatAdminCurrency(analytics.summary.aggregatorPrepaidAmount))}</span></div><h2>Daily order-date performance</h2><table><thead><tr><th>Date</th><th>Orders</th>${keys.map(([label]) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table><h2>Payment / refund event-date activity (separate basis)</h2><div class="meta">${Object.entries(analytics.cashActivity || {}).map(([key, value]) => `<span>${escapeHtml(key.replace(/([A-Z])/g, " $1"))} <strong>${escapeHtml(formatAdminCurrency(value))}</strong></span>`).join("")}</div><p class="muted">Unknown-date amounts cover the full selected source/type history and are excluded from dated activity.</p><h2>Definitions</h2>${Object.values(analytics.definitions || {}).map(value => `<p class="muted">${escapeHtml(value)}</p>`).join("")}`;
};
export const printAnalyticsReport = (analytics) => openPrintWindow("Sales Analytics", buildAnalyticsReportHtml(analytics), 1200);
