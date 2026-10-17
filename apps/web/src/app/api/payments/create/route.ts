import { checkOrigin, jsonError, publicOptions, publicResponse } from '@/lib/auth';
import { trackedOrder } from '@/lib/tracked-order';
import { createCheckout } from '@/lib/payments';
import { deliverOrderNotifications } from '@/lib/mailer';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const OPTIONS = publicOptions;
const inputSchema = z.object({
  code: z.string().regex(/^CM-[A-F0-9]{10}$/),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  payment_method: z.enum(['swish', 'card', 'apple_pay', 'google_pay']),
}).strict();

export async function POST(request: Request) {
  try {
    if (!checkOrigin(request)) return publicResponse(request, jsonError('Felaktigt anrop.', 403));
    const input = inputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return publicResponse(request, jsonError('Ogiltig betalningsförfrågan.'));
    const order = await trackedOrder(input.data.code, input.data.token);
    if (!order) return publicResponse(request, jsonError('Ordern hittades inte.', 404));
    if (order.payment_review_required || !['approved', 'preparing', 'ready'].includes(order.status) || order.proposal ||
        (order.quote_revision || 1) !== (order.accepted_revision || 1) ||
        ['paid', 'refunded'].includes(order.payment_status) || order.payment_preference === 'cash') {
      return publicResponse(request, jsonError('Ordern och det aktuella priset måste vara godkända före betalning.', 409));
    }
    // Klienten skickar aldrig belopp eller leverantörsreferens. SQL låser den godkända ordern.
    const checkout = await createCheckout(order, input.data.payment_method);
    const current = await trackedOrder(input.data.code, input.data.token);
    if (!current || current.payment_review_required || ['paid', 'refunded'].includes(current.payment_status)) {
      return publicResponse(request, jsonError('Betalningsstatusen har uppdaterats. Uppdatera ordern innan du fortsätter.', 409));
    }
    await deliverOrderNotifications(order.id).catch(() => console.error('Payment created; notifications pending'));
    return publicResponse(request, Response.json({ checkout_url: checkout.url, payment_status: current.payment_status },
      { headers: { 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } }));
  } catch {
    return publicResponse(request, jsonError('Betalningen kunde inte öppnas. Uppdatera ordern och kontrollera tillgängliga betalningsmetoder.', 503));
  }
}
