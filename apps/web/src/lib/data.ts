import 'server-only';
import { adminDb } from '@/lib/supabase';
import { isSupabaseReady, previewItems, previewMenus, previewSettings } from '@/lib/config';
import type { Campaign, Catalog, CateringOrder, DeliveryZone, Dish, Menu, MenuItem, OrderLine, PaymentPreference, PublicOrder, Settings } from '@/types/domain';
import { safeExternalUrl, previewDishes } from '@/lib/domain';
import { paymentCapabilities, paymentsConfigured } from '@/lib/payments';

export async function getMenus(): Promise<Menu[]> {
  if (!isSupabaseReady()) return previewMenus;
  const { data, error } = await adminDb().from('menus').select('*').eq('active',true).order('sort_order');
  if (error) throw new Error('Kunde inte läsa meny');
  return (data || []) as Menu[];
}
export async function getSettings(): Promise<Settings> {
  if (!isSupabaseReady()) return previewSettings;
  const db = adminDb();
  const [settings,zones,campaign] = await Promise.all([
    db.from('business_settings').select('*').eq('id',1).single(),
    db.from('delivery_zones').select('name,postal_prefixes,fee_ore,active,legacy_key'),
    db.from('campaigns').select('title,description,media_url,starts_at,ends_at,active').eq('legacy_key','settings').maybeSingle()
  ]);
  if(settings.error || !settings.data || zones.error || campaign.error) throw new Error('Kunde inte läsa inställningar. Kontrollera migrationerna.');
  const legacy = campaign.data;
  const swedishDate = (value:string) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const start = legacy ? swedishDate(legacy.starts_at) : '';
  const end = legacy ? swedishDate(legacy.ends_at) : '';
  return {...settings.data,delivery_fee_ore:zones.data?.find(zone=>zone.legacy_key==='base')?.fee_ore ?? settings.data.delivery_fee_ore,
    delivery_zones:(zones.data||[]).filter(zone=>zone.active && zone.legacy_key?.startsWith('prefix:')).flatMap(zone=>zone.postal_prefixes.map((prefix:string)=>({name:zone.name,postal_prefix:prefix,fee_ore:zone.fee_ore}))),
    campaign_title:legacy?.title||'',campaign_description:legacy?.description||'',campaign_image_url:legacy?.media_url||null,
    campaign_start_date:start && !start.startsWith('1970')?start:null,campaign_end_date:end && !end.startsWith('9999')?end:null,campaign_enabled:legacy?.active||false} as Settings;
}

/** V2-läsare använder kompatibilitetsvyn; samma priser/rätter som Expo. */
export async function getMenuItems(): Promise<MenuItem[]> {
  if(!isSupabaseReady()) return previewItems;
  const {data,error} = await adminDb().from('menu_items').select('*').eq('active',true).order('sort_order');
  if(error) throw new Error('Kunde inte läsa maträtter. Kontrollera migrationerna.');
  return (data||[]) as MenuItem[];
}

// Även demonstrationsrätterna kommer från samma källa som Expo och Sites.
export { previewDishes } from '@yehabibi/shared';

export function onlinePaymentsReady() {
  return paymentsConfigured();
}
export function ordersReady() {
  return isSupabaseReady() && process.env.ORDERS_ENABLED === 'true'
    && Boolean(process.env.RESEND_API_KEY && process.env.OWNER_NOTIFICATION_EMAIL && process.env.EMAIL_FROM)
    && (process.env.ORDER_LINK_SECRET?.length || 0) >= 32 && (process.env.ORDER_RATE_LIMIT_SECRET?.length || 0) >= 32;
}
export async function getDeliveryZones(): Promise<DeliveryZone[]> {
  if (!isSupabaseReady()) return [];
  const {data,error} = await adminDb().from('delivery_zones').select('id,name,postal_prefixes,fee_ore,active').eq('active',true).order('name');
  if(error) throw new Error('Kunde inte läsa leveranszoner. Kör V3-migrationen.');
  return (data || []) as DeliveryZone[];
}
/** Endast uttryckligt valda publika katalogfält når webben och Expo. */
export async function getCatalog(): Promise<Catalog> {
  const [menus,settings,delivery_zones] = await Promise.all([getMenus(),getSettings(),getDeliveryZones()]);
  let dishes = previewDishes;
  let campaigns: Campaign[] = [];
  if(isSupabaseReady()) {
    const db = adminDb();
    const now = new Date().toISOString();
    const [dishResult,campaignResult] = await Promise.all([
      db.from('dishes').select('id,slug,title,description,allergens,price_ore,portion_label,image_url,active,sort_order,category,suggested_per_person').eq('active',true).order('sort_order'),
      db.from('campaigns').select('id,title,description,media_url,starts_at,ends_at,menu_ids,active').eq('active',true).lte('starts_at',now).gte('ends_at',now).order('starts_at')
    ]);
    if(dishResult.error || campaignResult.error) throw new Error('Kunde inte läsa katalogen. Kör V3-migrationen.');
    dishes = (dishResult.data || []) as Dish[];
    campaigns = (campaignResult.data || []) as Campaign[];
  }
  // Kontokonfiguration och leverantörens faktiska metodlista måste båda godkänna metoden.
  const payment_methods: PaymentPreference[] = isSupabaseReady() ? await paymentCapabilities() : [];
  if(settings.cash_enabled && settings.pickup_enabled) payment_methods.push('cash');
  if(settings.allow_unpaid_requests) payment_methods.push('unpaid');
  // Ta bort eventuella framtida privata databasfält genom en explicit kopia.
  const publicSettings: Settings = Object.fromEntries(Object.keys(previewSettings).map(key => [key,settings[key as keyof Settings]])) as Settings;
  return {menus:menus.map(({id,slug,title,description,included,allergens,price_ore,min_people,image_url,active,sort_order}) => ({id,slug,title,description,included,allergens,price_ore,min_people,image_url,active,sort_order})),dishes,campaigns,settings:publicSettings,delivery_zones,payment_methods,orders_enabled:ordersReady() && payment_methods.length > 0,demo:!isSupabaseReady()};
}

/** Privat order läses med token i API:t; bara denna tillåtna vy når kunden. */
export async function publicOrderView(order:CateringOrder):Promise<PublicOrder> {
  const {data:items,error} = await adminDb().from('order_items')
    .select('dish_id,item_id,menu_id,title,quantity,unit_label,unit_price_ore,total_ore').eq('order_id',order.id).order('id');
  if(error) throw new Error('Kunde inte läsa orderrader.');
  const legacyPayment = !order.payment_provider && Boolean(order.stripe_checkout_session_id) && !['paid','refunded'].includes(order.payment_status);
  return {
    code:order.code,menu_title:order.menu_title,guests:order.guests,event_date:order.event_date,event_time:order.event_time,
    fulfillment:order.fulfillment,status:order.status,payment_status:order.payment_status,payment_preference:order.payment_preference,
    subtotal_ore:order.subtotal_ore,delivery_fee_ore:order.delivery_fee_ore,total_ore:order.total_ore,created_at:order.created_at,
    proposal:order.proposal || null,price_adjustment_ore:order.price_adjustment_ore || 0,admin_note:order.admin_note,
    payment_provider:order.payment_provider || null,provider_payment_id:order.provider_payment_id || null,
    payment_transaction_reference:order.payment_transaction_reference || null,payment_method:order.payment_method || null,
    payment_review_required:order.payment_review_required || legacyPayment,payment_review_reason:legacyPayment?'En äldre betalning behöver kontrolleras av köket.':order.payment_review_reason || null,
    payment_refund_status:order.payment_refund_status || null,
    checkout_url:order.payment_provider && order.payment_attempt_id && !order.proposal && (order.quote_revision||1)===(order.accepted_revision||1) && ['approved','preparing','ready'].includes(order.status)
      && !order.payment_review_required && order.payment_status==='pending' ? safeExternalUrl(order.checkout_url) : null,
    items:(items || []) as OrderLine[]
  };
}
