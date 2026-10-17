import 'server-only';
import { receivePaymentEvents } from '@/lib/payments';
import { deliverPaymentNotifications } from '@/lib/mailer';

export async function dispatchTestPaymentEvent(payload: unknown) {
  const orders = await receivePaymentEvents(payload);
  for (const orderId of orders) await deliverPaymentNotifications(orderId);
}
