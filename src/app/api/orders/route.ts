import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { adminDb } from '@/lib/supabase';
import { getSettings } from '@/lib/data';
import { isSupabaseReady } from '@/lib/config';
import { checkOrigin, jsonError } from '@/lib/auth';
import { newOrderSchema } from '@/lib/validators';
import { canUseCash, calcTotal, calcItemsTotal, deliveryFeeFor, isValidEventDate } from '@/lib/domain';
import { trackingHash, trackingLink, trackingToken } from '@/lib/tracking';
import { notifyNewOrder } from '@/lib/mailer';
import type { CateringOrder, OrderLine } from '@/types/domain';

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
  // Separate limits per network and customer email make spam harder.
  const ipKey = createHmac('sha256',secret).update(`ip:${ip}`).digest('hex');
  const emailKey = createHmac('sha256',secret).update(`email:${input.email.toLowerCase()}`).digest('hex');
  const db = adminDb();
  const ipLimit = await db.rpc('consume_order_limit',{p_key_hash:ipKey});
  const emailLimit = await db.rpc('consume_order_limit',{p_key_hash:emailKey});
  if (ipLimit.error || !ipLimit.data || emailLimit.error || !emailLimit.data) {
    return jsonError('För många förfrågningar. Försök igen senare.',429);
  }

  const settings = await getSettings();
  // SERVERN räknar alltid från godkända databaspriser – aldrig från klientens summa.
  const feeOre = input.fulfillment === 'delivery'
    ? deliveryFeeFor(input.postal_code, settings.delivery_fee_ore, settings.delivery_zones || [])
    : 0;
  let menuId: string | null = null;
  let menuTitle = 'Bygg din egen meny';
  let pricePerPersonOre = 0;
  let itemsSnapshot: OrderLine[] = [];
  let prices: {subtotal_ore:number;delivery_fee_ore:number;total_ore:number};

  if (input.items?.length) {
    if (input.guests < settings.custom_min_people) {
      return jsonError(`Minst ${settings.custom_min_people} personer krävs för en egen meny.`);
    }
    const selectedIds = input.items.map(item => item.item_id);
    const {data:dishes,error:dishError} = await db.from('menu_items')
      .select('id,title,unit_label,unit_price_ore,active').in('id',selectedIds).eq('active',true);
    if (dishError || !dishes || dishes.length !== selectedIds.length) {
      return jsonError('En eller flera maträtter är inte tillgängliga. Uppdatera sidan.');
    }
    const lookup = new Map(dishes.map(dish => [dish.id, dish]));
    itemsSnapshot = input.items.map(item => {
      const dish = lookup.get(item.item_id)!;
      return {item_id:dish.id,title:dish.title,unit_label:dish.unit_label,
        unit_price_ore:dish.unit_price_ore,quantity:item.quantity,
        line_total_ore:dish.unit_price_ore * item.quantity};
    });
    if (itemsSnapshot.some(line => line.unit_price_ore <= 0)) {
      return jsonError('Ägaren behöver godkänna priset för en av rätterna.');
    }
    try {
      const totals = calcItemsTotal(itemsSnapshot,input.guests,input.fulfillment,feeOre);
      prices = {subtotal_ore:totals.subtotal_ore,delivery_fee_ore:totals.delivery_fee_ore,total_ore:totals.total_ore};
      pricePerPersonOre = Math.round(totals.subtotal_ore/input.guests);
    } catch {
      return jsonError('Beställningens antal eller totalsumma är ogiltig.');
    }
  } else {
    const {data:menu,error:menuError} = await db.from('menus')
      .select('*').eq('id',input.menu_id).eq('active',true).maybeSingle();
    if (menuError || !menu || menu.price_ore <= 0) return jsonError('Menyn är ännu inte bokningsbar.');
    if (input.guests < menu.min_people) return jsonError(`Den här menyn kräver minst ${menu.min_people} personer.`);
    menuId = menu.id;
    menuTitle = menu.title;
    pricePerPersonOre = menu.price_ore;
    try {
      prices = calcTotal(menu.price_ore,input.guests,input.fulfillment,feeOre);
    } catch { return jsonError('Beställningens totalsumma är ogiltig.'); }
  }
  if (prices.total_ore <= 0) return jsonError('Ägaren måste fastställa ett pris innan beställningen kan skickas.');
  const id = randomUUID();
  const code = `CM-${randomBytes(5).toString('hex').toUpperCase()}`;
  const order = {
    id,code,tracking_hash:trackingHash(trackingToken(id)),menu_id:menuId,menu_title:menuTitle,
    price_per_person_ore:pricePerPersonOre,items_snapshot:itemsSnapshot,guests:input.guests,occasion:input.occasion,
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
