import { adminDb } from '@/lib/supabase';
import { isSupabaseReady } from '@/lib/config';
import { checkOrigin, jsonError, publicOptions, publicResponse } from '@/lib/auth';
import { verifyTrackingToken } from '@/lib/tracking';
import { customerActionSchema } from '@/lib/validators';
import { publicOrderView } from '@/lib/data';
import { createCheckout } from '@/lib/payments';
import { deliverOrderNotifications } from '@/lib/mailer';
import type { CateringOrder } from '@/types/domain';

export const dynamic = 'force-dynamic';
export const OPTIONS = publicOptions;
type Context = {params:Promise<{code:string}>};
async function trackedOrder(request:Request,{params}:Context) {
  const {code} = await params;
  const token = new URL(request.url).searchParams.get('token') || '';
  if(!isSupabaseReady() || !/^CM-[A-F0-9]{10}$/.test(code) || !/^[a-f0-9]{64}$/.test(token)) return null;
  const db = adminDb();
  const {data,error} = await db.from('orders').select('*').eq('code',code).maybeSingle();
  if(error || !data || !verifyTrackingToken(token,data.tracking_hash)) return null;
  return data as CateringOrder;
}

export async function GET(request:Request,context:Context) {
  try {
    const order = await trackedOrder(request,context);
    return publicResponse(request,order ? await customerResponse(order) : jsonError('Ordern hittades inte.',404));
  } catch { return publicResponse(request,jsonError('Kunde inte läsa ordern.',503)); }
}

export async function PATCH(request:Request,context:Context) {
  try { return publicResponse(request,await updateOrder(request,context)); }
  catch { return publicResponse(request,jsonError('Uppdateringen kunde inte sparas. Försök igen senare.',503)); }
}
async function updateOrder(request:Request,context:Context) {
  if(!checkOrigin(request)) return jsonError('Felaktigt anrop.',403);
  const parsed = customerActionSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return jsonError('Ogiltig åtgärd.');
  let order = await trackedOrder(request,context);
  if(!order) return jsonError('Ordern hittades inte.',404);
  const db = adminDb();
  if(parsed.data.action==='register_push') {
    if(process.env.CUSTOMER_PUSH_ENABLED!=='true') return jsonError('Pushnotiser är inte aktiverade. Du får uppdateringar via e-post.',503);
    const {data:saved,error} = await db.rpc('register_catering_push',{p_order_id:order.id,p_token:parsed.data.push_token});
    if(error) return jsonError('Notiser kunde inte registreras.',503);
    return saved ? Response.json({registered:true}) : jsonError('För många registrerade enheter.',429);
  }
  const {data:saved,error} = await db.rpc('accept_catering_change',{p_order_id:order.id,p_revision:parsed.data.revision});
  if(error || !saved) return jsonError('Förslaget har ändrats. Uppdatera sidan och granska det aktuella priset.',409);
  order = saved as CateringOrder;
  // Godkännandet sparas även om betaltjänsten tillfälligt är nere. Ägaren kan förnya länken.
  if(order.payment_preference!=='cash' && order.status==='approved' && !['paid','refunded'].includes(order.payment_status)) {
    try {
      const checkout = await createCheckout(order);
      const {data:attached,error:attachError} = await db.rpc('attach_catering_checkout',{
        p_order_id:order.id,p_expected_status:order.status,p_expected_payment_status:order.payment_status,
        p_expected_session_id:order.stripe_checkout_session_id,p_session_id:checkout.id,p_checkout_url:checkout.url
      });
      if(!attachError && attached) order = attached as CateringOrder;
    } catch { console.error('Accepted quote saved; payment link requires retry'); }
  }
  await deliverOrderNotifications(order.id).catch(()=>console.error('Quote accepted; notifications pending'));
  return customerResponse(order);
}

async function customerResponse(order:CateringOrder) {
  return Response.json({order:await publicOrderView(order)},
    {headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
}
