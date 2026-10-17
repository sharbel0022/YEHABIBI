import { adminDb } from '@/lib/supabase';
import { isSupabaseReady } from '@/lib/config';
import { jsonError, publicOptions, publicResponse } from '@/lib/auth';
import { verifyTrackingToken } from '@/lib/tracking';
import { safeExternalUrl } from '@/lib/domain';
import type { CateringOrder, OrderLine, PublicOrder } from '@/types/domain';

export const dynamic = 'force-dynamic';
export const OPTIONS = publicOptions;
export async function GET(request:Request,context:{params:Promise<{code:string}>}) {
  return publicResponse(request,await readOrder(request,context));
}
async function readOrder(request:Request,{params}:{params:Promise<{code:string}>}) {
  const {code} = await params;
  const token = new URL(request.url).searchParams.get('token') || '';
  if(!isSupabaseReady() || !/^CM-[A-F0-9]{10}$/.test(code) || !/^[a-f0-9]{64}$/.test(token)) return jsonError('Ordern hittades inte.',404);
  const db = adminDb();
  const {data,error} = await db.from('orders').select('id,tracking_hash,code,menu_title,guests,event_date,event_time,fulfillment,status,payment_status,payment_preference,subtotal_ore,delivery_fee_ore,total_ore,checkout_url,created_at').eq('code',code).maybeSingle();
  if(error || !data || !verifyTrackingToken(token,data.tracking_hash)) return jsonError('Ordern hittades inte.',404);
  const order = data as CateringOrder;
  const {data:items,error:itemError} = await db.from('order_items').select('dish_id,item_id,menu_id,title,quantity,unit_label,unit_price_ore,total_ore').eq('order_id',order.id).order('id');
  if(itemError) return jsonError('Kunde inte läsa orderrader.',503);
  const result: PublicOrder = {
    code:order.code,menu_title:order.menu_title,guests:order.guests,event_date:order.event_date,event_time:order.event_time,
    fulfillment:order.fulfillment,status:order.status,payment_status:order.payment_status,payment_preference:order.payment_preference,
    subtotal_ore:order.subtotal_ore,delivery_fee_ore:order.delivery_fee_ore,total_ore:order.total_ore,created_at:order.created_at,
    checkout_url:['approved','preparing','ready'].includes(order.status) && ['unpaid','pending','failed'].includes(order.payment_status) ? safeExternalUrl(order.checkout_url) : null,
    items:(items || []) as OrderLine[]
  };
  return Response.json({order:result},{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
}
