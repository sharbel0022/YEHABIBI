import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { adminDb } from '@/lib/supabase';
import { getDeliveryZones, getSettings, onlinePaymentsReady, ordersReady } from '@/lib/data';
import { checkOrigin, jsonError, publicOptions, publicResponse } from '@/lib/auth';
import { newOrderSchema } from '@/lib/validators';
import { canUseCash, calcDishTotal, calcTotal, findDeliveryZone, isValidEventDate } from '@/lib/domain';
import { trackingHash, trackingLink, trackingToken } from '@/lib/tracking';
import { notifyNewOrder } from '@/lib/mailer';
import { notifyOwnerPush } from '@/lib/push';
import type { CateringOrder, Dish } from '@/types/domain';

export const dynamic = 'force-dynamic';
export const OPTIONS = publicOptions;
export async function POST(request: Request) {
  try { return publicResponse(request,await createOrder(request)); }
  catch { return publicResponse(request,jsonError('Förfrågan kunde inte sparas. Försök igen senare.',503)); }
}
async function createOrder(request: Request) {
  if (!checkOrigin(request)) return jsonError('Felaktigt anrop.',403);
  if (!ordersReady()) return jsonError('Beställningar är inte aktiverade ännu.',503);
  const parsed = newOrderSchema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return jsonError('Kontrollera dina uppgifter och försök igen.');
  const input = parsed.data;
  const db = adminDb();
  // Separata beständiga gränser per nätverk och kundmejl; inga IP-adresser lagras.
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0,80);
  const limitKey = (value:string) => createHmac('sha256',process.env.ORDER_RATE_LIMIT_SECRET!).update(value).digest('hex');
  const [ipLimit,emailLimit] = await Promise.all([
    db.rpc('consume_order_limit',{p_key_hash:limitKey(`ip:${ip}`)}),
    db.rpc('consume_order_limit',{p_key_hash:limitKey(`email:${input.email.toLowerCase()}`)})
  ]);
  if (ipLimit.error || !ipLimit.data || emailLimit.error || !emailLimit.data) return jsonError('För många förfrågningar. Försök igen senare.',429);

  const [settings,zones] = await Promise.all([getSettings(),getDeliveryZones()]);
  if (!isValidEventDate(input.event_date,settings.min_advance_days)) return jsonError('Välj ett datum inom tillåten framförhållning.');
  if ((input.fulfillment==='delivery' && !settings.delivery_enabled) || (input.fulfillment==='pickup' && !settings.pickup_enabled)) return jsonError('Valt leveranssätt erbjuds inte.');
  if (!canUseCash(input.payment_preference,input.fulfillment,settings.cash_enabled)) return jsonError('Kontantbetalning kräver hämtning.');
  if (input.payment_preference==='swish' && process.env.STRIPE_SWISH_ENABLED!=='true') return jsonError('Swish är inte aktiverat ännu.');
  if (input.payment_preference!=='cash' && !onlinePaymentsReady()) return jsonError('Onlinebetalning är inte aktiverad i testläge ännu.',503);
  const zone = input.fulfillment==='delivery' ? findDeliveryZone(zones,input.postal_code,input.delivery_zone_id) : null;
  if (input.fulfillment==='delivery' && (!input.address || !input.city || !zone)) return jsonError('Ange fullständig adress inom en tillgänglig leveranszon.');

  const fee = zone?.fee_ore || 0;
  let prices;
  if(input.menu_id) {
    const {data:menu,error} = await db.from('menus').select('id,price_ore,min_people').eq('id',input.menu_id).eq('active',true).maybeSingle();
    if(error || !menu || menu.price_ore <= 0) return jsonError('Menyn är ännu inte bokningsbar.');
    if(input.guests < menu.min_people) return jsonError(`Den här menyn kräver minst ${menu.min_people} personer.`);
    prices = calcTotal(menu.price_ore,input.guests,input.fulfillment,fee);
  } else {
    if(input.guests < settings.custom_min_people) return jsonError(`Minst ${settings.custom_min_people} personer krävs för en egen meny.`);
    const {data:dishes,error} = await db.from('dishes').select('id,title,price_ore,active').in('id',input.items!.map(item=>item.dish_id)).eq('active',true);
    if(error) return jsonError('Kunde inte läsa maträtter.',503);
    try { prices = calcDishTotal(input.items!,dishes as Dish[],input.guests,input.fulfillment,fee); }
    catch { return jsonError('En maträtt eller mängd är inte tillgänglig. Uppdatera menyn.'); }
  }
  const id = randomUUID();
  const code = `CM-${randomBytes(5).toString('hex').toUpperCase()}`;
  const token = trackingToken(id);
  // SQL-funktionen läser priserna igen och sparar order/rader i samma transaktion.
  const {data:saved,error} = await db.rpc('create_catering_order',{
    p_order:{...input,id,code,tracking_hash:trackingHash(token),menu_id:input.menu_id || null,delivery_zone_id:zone?.id || null,subtotal_ore:prices.subtotal_ore,delivery_fee_ore:prices.delivery_fee_ore},
    p_items:input.items || []
  });
  if(error || !saved) { console.error('Order transaction failed',error?.code); return jsonError('Priset eller tillgängligheten kan ha ändrats. Uppdatera menyn och försök igen.',409); }
  const order = saved as CateringOrder;
  const followUp = trackingLink(order);
  // Ordern finns kvar i admin även om externa notifieringstjänster tillfälligt fallerar.
  await Promise.allSettled([notifyNewOrder(order,followUp),notifyOwnerPush(order)]);
  return Response.json({code,token,tracking_url:followUp},{status:201,headers:{'Referrer-Policy':'no-referrer'}});
}
