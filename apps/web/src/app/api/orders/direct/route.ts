import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { adminDb } from '@/lib/supabase';
import { ordersReady } from '@/lib/data';
import { directPaymentCapabilities } from '@/lib/payments';
import { getAvailability } from '@/lib/scheduling';
import { checkOrigin, jsonError, publicOptions, publicResponse } from '@/lib/auth';
import { directOrderSchema } from '@/lib/validators';
import { trackingHash, trackingLink, trackingToken } from '@/lib/tracking';
import { deliverOrderNotifications } from '@/lib/mailer';
import type { CateringOrder } from '@yehabibi/shared';

export const dynamic='force-dynamic';
export const OPTIONS=publicOptions;
export async function POST(request:Request) {
  try { return publicResponse(request,await createOrder(request)); }
  catch { return publicResponse(request,jsonError('Beställningen kunde inte sparas. Försök igen senare.',503)); }
}
async function createOrder(request:Request) {
  if(!checkOrigin(request)) return jsonError('Felaktigt anrop.',403);
  if(!ordersReady()) return jsonError('Beställningar är inte aktiverade ännu.',503);
  const parsed=directOrderSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return jsonError('Kontrollera paket, tid och kontaktuppgifter.');
  const input=parsed.data; const db=adminDb(); const requestId=input.request_id||randomUUID();
  if(input.payment_preference==='unpaid') return jsonError('Välj en godkänd direktbetalning eller kontant vid hämtning.',503);
  const {request_id:ignoredId,website:ignoredWebsite,...details}=input; void ignoredId;void ignoredWebsite;
  const fingerprint=(value:string)=>createHmac('sha256',process.env.ORDER_RATE_LIMIT_SECRET!).update(value).digest('hex');
  const requestHash=fingerprint(JSON.stringify(details));
  const receipt=(order:CateringOrder,status:number)=>Response.json({code:order.code,token:trackingToken(order.id),tracking_url:trackingLink(order)},
    {status,headers:{'Referrer-Policy':'no-referrer'}});
  const {data:previous,error:previousError}=await db.from('orders').select('*').eq('request_id',requestId).maybeSingle();
  if(previousError) return jsonError('Kunde inte kontrollera beställningen.',503);
  if(previous) {
    if(previous.request_hash!==requestHash || previous.order_type!=='direct') return jsonError('Förfrågan har ändrats. Starta en ny beställning.',409);
    await deliverOrderNotifications(previous.id).catch(()=>console.error('Direct order retry; notifications pending'));
    return receipt(previous as CateringOrder,200);
  }
  const ip=(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,80);
  const [ipLimit,emailLimit]=await Promise.all([
    db.rpc('consume_order_limit',{p_key_hash:fingerprint(`ip:${ip}`)}),
    db.rpc('consume_order_limit',{p_key_hash:fingerprint(`email:${input.email.toLowerCase()}`)})
  ]);
  if(ipLimit.error || !ipLimit.data || emailLimit.error || !emailLimit.data) return jsonError('För många förfrågningar. Försök igen senare.',429);
  if(input.payment_preference!=='cash') {
    const quote=await getAvailability(input);
    if(!(await directPaymentCapabilities(quote.total_ore)).includes(input.payment_preference)) return jsonError('Betalningssättet är inte aktiverat för direktköp. Uppdatera beställningen.',503);
  }
  const id=randomUUID(); const code=`CM-${randomBytes(5).toString('hex').toUpperCase()}`;
  const {data:saved,error}=await db.rpc('create_direct_order',{p_order:{...input,id,code,request_id:requestId,request_hash:requestHash,tracking_hash:trackingHash(trackingToken(id))}});
  if(error || !saved) { console.error('Direct order transaction failed',error?.code); return jsonError('Tiden, priset eller tillgängligheten har ändrats. Hämta lediga tider igen.',409); }
  const order=saved as CateringOrder;
  await deliverOrderNotifications(order.id).catch(()=>console.error('Direct order saved; notifications pending'));
  return receipt(order,saved._created===false?200:201);
}
