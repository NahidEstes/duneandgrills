export const formatOrderType = (value = "delivery") =>
  value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace("Dine In", "Dine-in");

export const getOrderSubtotal = (order) => {
  const subtotal = Number(order?.subtotal);
  const total = Number(order?.totalAmount) || 0;
  const deliveryFee = Number(order?.deliveryFee) || 0;

  if (subtotal > 0 || total === deliveryFee) return subtotal;
  return Math.max(0, total - deliveryFee);
};
