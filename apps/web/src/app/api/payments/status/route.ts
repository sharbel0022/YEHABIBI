import { jsonError, publicOptions, publicResponse } from '@/lib/auth';
import { publicOrderView } from '@/lib/data';
import { reconcilePaymentStatus } from '@/lib/payments';
import { trackedOrder } from '@/lib/tracked-order';
import { deliverOrderNotifications } from '@/lib/mailer';

export const dynamic = 'force-dynamic';
export const OPTIONS = publicOptions;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    let order = await trackedOrder(url.searchParams.get('code') || '', url.searchParams.get('token') || '');
    if (!order) return publicResponse(request, jsonError('Ordern hittades inte.', 404));
    // En återkomst från betalningssidan ger aldrig Betald. Bara verifierade serverhändelser gör det.
    order = await reconcilePaymentStatus(order);
    await deliverOrderNotifications(order.id).catch(() => console.error('Payment status; notifications pending'));
    return publicResponse(request, Response.json({ order: await publicOrderView(order) },
      { headers: { 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } }));
  } catch {
    return publicResponse(request, jsonError('Kunde inte kontrollera betalningen. Försök igen senare.', 503));
  }
}
