import 'server-only';
import { receivePaymentEvents } from '@/lib/payments';

export async function dispatchTestPaymentEvent(payload: unknown) {
  await receivePaymentEvents(payload);
}
