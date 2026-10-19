import { paymentWebhooksConfigured, receivePaymentEvents } from '@/lib/payments';
import { paymentWebhookResponse } from '@/lib/payments/inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** HMAC and stored identity are checked before the inbox commits; no business processing here. */
export function POST(request: Request) {
  return paymentWebhookResponse(request, paymentWebhooksConfigured(), receivePaymentEvents);
}
