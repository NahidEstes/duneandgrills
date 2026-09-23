const serializeItem = (item) => ({
  name: item.name,
  image: item.image || "",
  quantity: item.quantity,
  price: item.price,
  selectedAddOns: (item.selectedAddOns || []).map(({ name, image, price }) => ({ name, image, price })),
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

