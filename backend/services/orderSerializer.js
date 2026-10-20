import { orderContract } from "../config/orderContract.js";

// Shared dashboard/list/detail projection; never include private customer fields here.
export const RECENT_ORDER_FIELDS = "diningTable orderNumber customer.name items.quantity totalAmount status paymentStatus paymentMethod deliveryPaymentType createdAt updatedAt source orderType manualEntry orderOccurredAt preparationDueAt estimatedPreparationMinutes scheduledAt";
export const ACTIVE_PREPARATION_STATUSES = new Set(["pending", "confirmed", "preparing", "out-for-delivery"]);

export const serializeAdminOrder = (order, now = new Date()) => {
  const value = typeof order.toObject === "function" ? order.toObject() : order;
  const preparationActive = value.manualEntry !== true && ACTIVE_PREPARATION_STATUSES.has(value.status);
  return {
    ...value,
    ...orderContract(value),
    preparationActive,
    isOverdue: Boolean(preparationActive && value.preparationDueAt && new Date(value.preparationDueAt) < now),
  };
};

const serializeItem = (item) => ({
  name: item.name,
  ...(item.translations ? { translations: { ar: { name: item.translations.ar?.name, description: item.translations.ar?.description }, en: { name: item.translations.en?.name, description: item.translations.en?.description } } } : {}),
  image: item.image || "",
  quantity: item.quantity,
  price: item.price,
  selectedAddOns: (item.selectedAddOns || []).map(({ name, image, price, quantity }) => ({ name, image, price, quantity: quantity || 1 })),
  spiceLevel: item.spiceLevel || "",
  itemNote: item.itemNote || "",
});

export const serializeCustomerOrder = (order) => {
  const value = typeof order.toObject === "function" ? order.toObject() : order;
  return {
    _id: value._id,
    orderNumber: value.orderNumber,
    source: value.source,
    ...orderContract(value),
    kitchenNotes: value.kitchenNotes || "",
    items: (value.items || []).map(serializeItem),
    orderType: value.orderType,
    ...(value.diningTable?.code ? { diningTable: { code: value.diningTable.code, name: value.diningTable.name } } : {}),
    scheduledAt: value.scheduledAt || null,
    pointsDiscount: value.pointsRedemption?.discount || 0,
    pointsRedeemed: value.pointsRedemption?.points || 0,
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
