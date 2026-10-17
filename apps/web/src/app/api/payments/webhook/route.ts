import { paymentWebhooksConfigured, receivePaymentEvents, InvalidPaymentEventError } from '@/lib/payments';
import { deliverPaymentNotifications } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Only server-verified Standard HMAC events can reach the transactional payment RPC. */
export async function POST(request: Request) {
  if (!paymentWebhooksConfigured()) return new Response('Payments not configured', {status: 503});
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 65536) return new Response('Payload too large', {status: 413});
  let payload: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return new Response('Invalid webhook', {status: 400});
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 65536) { await reader.cancel(); return new Response('Payload too large', {status: 413}); }
      chunks.push(chunk.value);
    }
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return new Response('Invalid webhook', {status: 400}); }
  try {
    // Rejected signatures never get acknowledged. Provider retries also retry the durable notification outbox.
    const orderIds = await receivePaymentEvents(payload);
    for (const orderId of orderIds) await deliverPaymentNotifications(orderId);
    return new Response('[accepted]', {status: 200});
  } catch (error) {
    if (error instanceof InvalidPaymentEventError) return new Response('Invalid payment event', {status: 400});
    // Also covers transient DB failures; no provider payload or secret is logged.
    return new Response('Event not accepted; retry', {status: 500});
  }
}
