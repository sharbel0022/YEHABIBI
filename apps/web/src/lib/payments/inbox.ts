import { InvalidPaymentEventError } from './provider.ts';
import type { PaymentEvent, PaymentProvider } from './provider.ts';

/** The sole synchronous webhook side effect is durable storage of a verified batch. */
export async function persistVerifiedPaymentEvents(
  provider: Pick<PaymentProvider, 'verifyEvents'>,
  payload: unknown,
  persist: (events: PaymentEvent[]) => Promise<number>
): Promise<number> {
  let events: PaymentEvent[];
  try { events = provider.verifyEvents(payload); }
  catch { throw new InvalidPaymentEventError('Ogiltig betalningswebhook.'); }
  // Persistence must validate the whole batch against stored identity and amount atomically.
  // Errors deliberately propagate: the HTTP endpoint must never acknowledge an uncommitted batch.
  return persist(events);
}

/** Bounded HTTP ingestion; deliberately has no notifier or order-processing dependency. */
export async function paymentWebhookResponse(request: Request, configured: boolean, receive: (payload: unknown) => Promise<number>): Promise<Response> {
  if (!configured) return new Response('Payments not configured', {status: 503});
  if (Number(request.headers.get('content-length') || 0) > 65536) return new Response('Payload too large', {status: 413});
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
    await receive(payload);
    return new Response('[accepted]', {status: 200});
  } catch (error) {
    if (error instanceof InvalidPaymentEventError) return new Response('Invalid payment event', {status: 400});
    return new Response('Event not accepted; retry', {status: 500});
  }
}
