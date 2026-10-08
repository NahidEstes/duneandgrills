export const ATTENTION_LABELS = Object.freeze({
  pending_age: { title: "Pending too long", priority: "Medium", explanation: "Live order waiting beyond the configured pending threshold." },
  preparation_overdue: { title: "Preparation overdue", priority: "High", explanation: "Active order past its recorded preparation deadline." },
  purchase_approval: { title: "PO approval", priority: "Medium", explanation: "Submitted purchase order awaiting approval." },
  invoice_review: { title: "Invoice review", priority: "High", explanation: "Three-way match requires authorized review." },
  invoice_overdue: { title: "Overdue payable", priority: "High", explanation: "Posted invoice with unpaid balance after its Riyadh due day." },
});

export function attentionHref(category, item, orderHref) {
  if (category === "pending_age" || category === "preparation_overdue") return item
    ? orderHref(item._id) : orderHref ? orderHref(null, category) : `/admin?tab=orders&attention=${category}`;
  const route = category === "purchase_approval" ? "purchase-orders" : "supplier-invoices";
  const status = { purchase_approval: "submitted", invoice_review: "review_required", invoice_overdue: "overdue" }[category];
  const query = new URLSearchParams({ status });
  if (item) query.set("search", item.orderNumber || item.internalReference);
  return `/inventory/${route}?${query}`;
}

export const shiftHistoryHref = (state = "all", id) => `/pos?${new URLSearchParams({ shiftHistory: state, ...(id ? { shift: id } : {}) })}`;
