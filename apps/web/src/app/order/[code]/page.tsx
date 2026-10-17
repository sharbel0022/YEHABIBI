import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { adminDb } from '@/lib/supabase';
import { isSupabaseReady } from '@/lib/config';
import { publicOrderView } from '@/lib/data';
import { verifyTrackingToken } from '@/lib/tracking';
import { OrderTracking } from '@/components/OrderTracking';
import type { CateringOrder } from '@/types/domain';

export const metadata: Metadata = { title: 'Följ din cateringförfrågan', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

export default async function TrackOrder({ params, searchParams }: {
  params: Promise<{ code: string }>; searchParams: Promise<{ token?: string }>
}) {
  if (!isSupabaseReady()) notFound();
  const [{ code }, { token }] = await Promise.all([params, searchParams]);
  if (!/^[A-Z0-9-]{8,24}$/.test(code) || !token || !/^[a-f0-9]{64}$/.test(token)) notFound();
  const { data, error } = await adminDb().from('orders').select('*').eq('code', code).maybeSingle();
  if (error || !data) notFound();
  const order = data as CateringOrder;
  if (!verifyTrackingToken(token, order.tracking_hash)) notFound();
  const view = await publicOrderView(order);
  return <section className="shell section inner-page form-shell">
    <span className="eyebrow">DIN FÖRFRÅGAN · {order.code}</span><h1>Från köket till ditt bord.</h1>
    <p className="intro">Här ser du besked, eventuella ändringsförslag och betalningen för din catering.</p>
    <OrderTracking initialOrder={view} token={token}/>
  </section>;
}
