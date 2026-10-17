import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { adminDb } from '@/lib/supabase';
import { isSupabaseReady } from '@/lib/config';
import { verifyTrackingToken } from '@/lib/tracking';
import { formatSek, paymentStatusLabels, safeExternalUrl, statusLabels } from '@/lib/domain';
import type { CateringOrder } from '@/types/domain';
export const metadata: Metadata={title:'Följ din cateringförfrågan', robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function TrackOrder({params,searchParams}:{params:Promise<{code:string}>,searchParams:Promise<{token?:string}>}){
 if(!isSupabaseReady())notFound();
 const [{code},{token}]=await Promise.all([params,searchParams]);
 if(!/^[A-Z0-9-]{8,24}$/.test(code)||!token||!/^[a-f0-9]{64}$/.test(token))notFound();
 const {data,error}=await adminDb().from('orders').select('*').eq('code',code).maybeSingle();
 if(error||!data)notFound();
 const order=data as CateringOrder;
 if(!verifyTrackingToken(token,order.tracking_hash))notFound();
 return <section className="shell section inner-page"><span className="eyebrow">DIN FÖRFRÅGAN · {order.code}</span><h1>Så går det med din catering</h1><div className="form-layout"><div className="order-panel"><h2>{statusLabels[order.status]}</h2><p>Betalning: <strong>{paymentStatusLabels[order.payment_status]}</strong>.</p><p>{order.menu_title} för {order.guests} personer.<br/>Datum: {order.event_date}, kl {order.event_time}.</p><p>Totalt: {formatSek(order.total_ore)}.</p>
  {order.admin_note&&<div className="preview-note"><strong>Meddelande från oss:</strong> {order.admin_note}</div>}
  {order.status==='approved'&&order.payment_preference==='cash'&&<p>Kontant betalning sker vid överenskommen hämtning. Markeras som betald först när vi tagit emot pengarna.</p>}
  {order.status==='approved'&&order.payment_status!=='paid'&&safeExternalUrl(order.checkout_url)&&<a href={safeExternalUrl(order.checkout_url)!} className="btn btn-primary" rel="noopener noreferrer">Betala säkert →</a>}
  <p className="admin-note">Har du frågor? Svara på bekräftelsemejlet.</p></div><div className="form-sidebar"><h3>Så fungerar det</h3><p>Vi granskar alla cateringförfrågningar manuellt. Du får ett besked innan betalning.</p></div></div></section>
}
