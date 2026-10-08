// Shared dashboard/list/detail projection; never include private customer fields here.
export const RECENT_ORDER_FIELDS = "orderNumber customer.name items.quantity totalAmount status paymentStatus paymentMethod deliveryPaymentType createdAt updatedAt source orderType manualEntry orderOccurredAt preparationDueAt estimatedPreparationMinutes";
export const ACTIVE_PREPARATION_STATUSES = new Set(["pending", "confirmed", "preparing", "out-for-delivery"]);

export const serializeAdminOrder = (order, now = new Date()) => {
  const value = typeof order.toObject === "function" ? order.toObject() : order;
  const preparationActive = value.manualEntry !== true && ACTIVE_PREPARATION_STATUSES.has(value.status);
  return {
    ...value,
    preparationActive,
    isOverdue: Boolean(preparationActive && value.preparationDueAt && new Date(value.preparationDueAt) < now),
  };
};

const serializeItem = (item) => ({
  name: item.name,
  image: item.image || "",
  quantity: item.quantity,
  price: item.price,
  selectedAddOns: (item.selectedAddOns || []).map(({ name, image, price, quantity }) => ({ name, image, price, quantity: quantity || 1 })),
  spiceLevel: item.spiceLevel || "",
});

export const serializeCustomerOrder = (order) => {
  const value = typeof order.toObject === "function" ? order.toObject() : order;
  return {
    _id: value._id,
    orderNumber: value.orderNumber,
    source: value.source,
    items: (value.items || []).map(serializeItem),
    orderType: value.orderType,
    subtotal: value.subtotal,
    discountAmount: value.discountAmount,
    deliveryFee: value.deliveryFee,
    totalAmount: value.totalAmount,
    paymentStatus: value.paymentStatus,
    status: value.status,
    estimatedPreparationMinutes: value.estimatedPreparationMinutes,
    preparationDueAt: value.preparationDueAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

export const serializeGuestTrackingOrder = (order) => {
  const value = serializeCustomerOrder(order);
  delete value._id;
  delete value.source;
  return value;
};
