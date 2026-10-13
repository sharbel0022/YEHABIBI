import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { adminDb } from '@/lib/supabase';
import { getSettings } from '@/lib/data';
import { isSupabaseReady } from '@/lib/config';
import { checkOrigin, jsonError } from '@/lib/auth';
import { newOrderSchema } from '@/lib/validators';
import { canUseCash, calcTotal, isValidEventDate } from '@/lib/domain';
import { trackingHash, trackingLink, trackingToken } from '@/lib/tracking';
import { notifyNewOrder } from '@/lib/mailer';
import type { CateringOrder } from '@/types/domain';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!checkOrigin(request)) return jsonError('Felaktigt anrop.',403);
  if (!isSupabaseReady() || process.env.ORDERS_ENABLED !== 'true') return jsonError('Beställningar är inte aktiverade ännu.',503);
  if (!process.env.RESEND_API_KEY || !process.env.OWNER_NOTIFICATION_EMAIL || !process.env.EMAIL_FROM) return jsonError('Ordermejl är inte konfigurerade.',503);
  if (!process.env.ORDER_LINK_SECRET || process.env.ORDER_LINK_SECRET.length < 32) return jsonError('Beställningar är inte konfigurerade.',503);

  let raw:unknown;
  try { raw = await request.json(); } catch { return jsonError('Felaktigt formulär.'); }
  const parsed = newOrderSchema.safeParse(raw);
  if (!parsed.success) return jsonError('Kontrollera dina uppgifter och försök igen.');
  const input = parsed.data;
  if (input.website) return jsonError('Ogiltigt formulär.');

  const secret = process.env.ORDER_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) return jsonError('Beställningsskyddet är inte aktiverat.',503);
  // Use only deployment-trusted forwarding headers; the platform sets x-forwarded-for.
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0,80);
  const key = createHmac('sha256',secret).update(`${ip}:${input.email.toLowerCase()}`).digest('hex');
  const db = adminDb();
  const { data:allowed, error:limitError } = await db.rpc('consume_order_limit',{p_key_hash:key});
  if (limitError || !allowed) return jsonError('För många förfrågningar. Försök igen senare.',429);

  const settings = await getSettings();
  const {data:menu,error:menuError} = await db.from('menus').select('*').eq('id',input.menu_id).eq('active',true).maybeSingle();
  if (menuError || !menu || menu.price_ore <= 0) return jsonError('Menyn är ännu inte bokningsbar.');
  if (input.guests < menu.min_people) return jsonError(`Den här menyn kräver minst ${menu.min_people} personer.`);
  if (!isValidEventDate(input.event_date, settings.min_advance_days)) return jsonError('Välj ett datum inom tillåten framförhållning.');
  if (input.fulfillment === 'delivery' && !settings.delivery_enabled || input.fulfillment === 'pickup' && !settings.pickup_enabled) return jsonError('Valt leveranssätt erbjuds inte.');
  if (input.fulfillment === 'delivery' && (!input.address || !input.postal_code || !input.city)) return jsonError('Fyll i fullständig leveransadress.');
  if (!canUseCash(input.payment_preference,input.fulfillment,settings.cash_enabled)) return jsonError('Kontantbetalning kräver hämtning.');
  if (input.payment_preference === 'swish' && process.env.STRIPE_SWISH_ENABLED !== 'true') return jsonError('Swish är inte aktiverat ännu. Välj ett annat betalningssätt.');
  if (input.payment_preference !== 'cash' && !process.env.STRIPE_SECRET_KEY) return jsonError('Onlinebetalning är inte aktiverad ännu.');

  const prices = calcTotal(menu.price_ore, input.guests, input.fulfillment,settings.delivery_fee_ore);
  const id = randomUUID();
  const code = `CM-${randomBytes(5).toString('hex').toUpperCase()}`;
  const order = {
    id,code,tracking_hash:trackingHash(trackingToken(id)),menu_id:menu.id,menu_title:menu.title,
    price_per_person_ore:menu.price_ore,guests:input.guests,occasion:input.occasion,
    event_date:input.event_date,event_time:input.event_time,fulfillment:input.fulfillment,
    address:input.fulfillment==='delivery'?input.address:'',postal_code:input.fulfillment==='delivery'?input.postal_code:'',city:input.fulfillment==='delivery'?input.city:'',
    full_name:input.full_name,email:input.email,phone:input.phone,notes:input.notes,
    ...prices,payment_preference:input.payment_preference,payment_status:'unpaid',status:'new'
  };
  const {data:saved,error} = await db.from('orders').insert(order).select('*').single();
  if (error || !saved) {console.error('Order insertion failed',error?.code);return jsonError('Kunde inte registrera förfrågan.',500);}
  const safeOrder = saved as CateringOrder;
  const followUp = trackingLink(safeOrder);
  // Email errors are logged; order remains visible in the admin panel.
  await notifyNewOrder(safeOrder,followUp);
  return Response.json({code,tracking_url:followUp},{status:201,headers:{'Cache-Control':'no-store'}});
}
