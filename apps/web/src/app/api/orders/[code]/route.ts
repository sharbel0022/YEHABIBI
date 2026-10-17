import { adminDb } from '@/lib/supabase';
import { checkOrigin, jsonError, publicOptions, publicResponse } from '@/lib/auth';
import { trackedOrder as readTrackedOrder } from '@/lib/tracked-order';
import { customerActionSchema } from '@/lib/validators';
import { publicOrderView } from '@/lib/data';
import { deliverOrderNotifications } from '@/lib/mailer';
import type { CateringOrder } from '@/types/domain';

export const dynamic = 'force-dynamic';
export const OPTIONS = publicOptions;
type Context = {params:Promise<{code:string}>};
async function trackedOrder(request:Request,{params}:Context) {
  const {code} = await params;
  const token = new URL(request.url).searchParams.get('token') || '';
  return readTrackedOrder(code,token);
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
  // Kunden väljer och initierar betalning separat efter att godkännandet har sparats.
  await deliverOrderNotifications(order.id).catch(()=>console.error('Quote accepted; notifications pending'));
  return customerResponse(order);
}

async function customerResponse(order:CateringOrder) {
  return Response.json({order:await publicOrderView(order)},
    {headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
}
