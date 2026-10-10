import type { Order } from './types';
export const terminal = (order: Order) => ['delivered', 'cancelled', 'failed', 'refunded'].includes(order.status);
export function statusLabel(order: Order) {
  return ({ pending: 'Received', confirmed: 'Accepted', preparing: 'On the grill', ready: order.fulfillmentType === 'delivery' ? 'Ready for dispatch' : order.fulfillmentType === 'pickup' ? 'Ready for pickup' : 'Ready to serve', 'out-for-delivery': 'On the way', delivered: order.fulfillmentType === 'delivery' ? 'Delivered' : order.fulfillmentType === 'pickup' ? 'Collected' : 'Completed', cancelled: 'Cancelled', failed: 'Unable to fulfill', refunded: 'Refunded' } as Record<string, string>)[order.status] || order.status;
}
export const paymentLabel = (order: Order) => order.paymentStatus === 'pending' ? order.fulfillmentType === 'dine_in' ? 'Payment pending' : `Cash due on ${order.fulfillmentType === 'delivery' ? 'delivery' : 'pickup'}` : order.paymentStatus.replace(/_/g, ' ');
