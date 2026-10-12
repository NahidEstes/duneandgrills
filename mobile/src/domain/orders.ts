import type { Order } from './types';
export const terminal = (order: Order) => ['delivered', 'cancelled', 'failed', 'refunded'].includes(order.status);
export const activeOrder = (order: Order) => ['pending', 'confirmed', 'preparing', 'ready', 'out-for-delivery'].includes(order.status);
export const newestActiveOrders = (orders: Order[]) => [...new Map(orders.filter(activeOrder).map(order => [order._id || order.orderNumber, order])).values()]
  .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || a.orderNumber.localeCompare(b.orderNumber));
export function activeStatus(order: Order) {
  const pickup = order.fulfillmentType === 'pickup'; const delivery = order.fulfillmentType === 'delivery';
  return ({
    pending: { title: 'Order received', description: 'Waiting for restaurant confirmation.' },
    confirmed: { title: 'Order confirmed', description: 'The restaurant has accepted your order.' },
    preparing: { title: 'Preparing your food', description: 'Your meal is being freshly prepared.' },
    ready: { title: pickup ? 'Ready for pickup' : delivery ? 'Ready for dispatch' : 'Order ready', description: pickup ? 'Your meal is ready to collect.' : delivery ? 'Your meal is ready for delivery dispatch.' : 'Your meal is ready to serve.' },
    'out-for-delivery': { title: 'On the way', description: 'Your order has left for delivery.' },
    delivered: { title: pickup ? 'Collected' : delivery ? 'Delivered' : 'Completed', description: 'Your order is complete.' },
  } as Record<string, { title: string; description: string }>)[order.status];
}
export function orderProgress(order: Order) {
  const delivery = order.fulfillmentType === 'delivery';
  const labels = ['Confirmed', 'Preparing', 'Ready', ...(delivery ? ['On the way'] : []), delivery ? 'Delivered' : order.fulfillmentType === 'pickup' ? 'Collected' : 'Completed'];
  const statuses = ['confirmed', 'preparing', 'ready', ...(delivery ? ['out-for-delivery'] : []), 'delivered'];
  const index = statuses.indexOf(order.status);
  return labels.map((label, i) => ({ label, state: index === -1 || i > index ? 'upcoming' as const : i === index ? 'current' as const : 'complete' as const }));
}
export function statusLabel(order: Order) {
  return ({ pending: 'Received', confirmed: 'Accepted', preparing: 'On the grill', ready: order.fulfillmentType === 'delivery' ? 'Ready for dispatch' : order.fulfillmentType === 'pickup' ? 'Ready for pickup' : 'Ready to serve', 'out-for-delivery': 'On the way', delivered: order.fulfillmentType === 'delivery' ? 'Delivered' : order.fulfillmentType === 'pickup' ? 'Collected' : 'Completed', cancelled: 'Cancelled', failed: 'Unable to fulfill', refunded: 'Refunded' } as Record<string, string>)[order.status] || order.status;
}
export const paymentLabel = (order: Order) => order.paymentStatus === 'pending' ? order.fulfillmentType === 'dine_in' ? 'Payment pending' : `Cash due on ${order.fulfillmentType === 'delivery' ? 'delivery' : 'pickup'}` : order.paymentStatus.replace(/_/g, ' ');
