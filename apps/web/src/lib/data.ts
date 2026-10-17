import 'server-only';
import { adminDb } from '@/lib/supabase';
import { isSupabaseReady, previewMenus, previewSettings } from '@/lib/config';
import type { Campaign, Catalog, DeliveryZone, Dish, Menu, PaymentPreference, Settings } from '@/types/domain';
import { isTestStripeKey } from '@/lib/domain';

export async function getMenus(): Promise<Menu[]> {
  if (!isSupabaseReady()) return previewMenus;
  const { data, error } = await adminDb().from('menus').select('*').eq('active',true).order('sort_order');
  if (error) throw new Error('Kunde inte läsa meny');
  return (data || []) as Menu[];
}
export async function getSettings(): Promise<Settings> {
  if (!isSupabaseReady()) return previewSettings;
  const { data, error } = await adminDb().from('business_settings').select('*').eq('id',1).single();
  if (error || !data) throw new Error('Kunde inte läsa inställningar');
  return data as Settings;
}

const dishNames = ['Hummus','Tabbouleh','Ostrullar','Kebbe','Falafel','Vinblad','Kafta','Kycklingspett','Grillmix','Bröd och såser','Dessert'];
export const previewDishes: Dish[] = dishNames.map((title,index) => ({
  id:`44444444-4444-4444-8444-${String(index+1).padStart(12,'0')}`, slug:`demo-${index+1}`, title,
  description:'Demonstrationsrätt. Pris, portionsstorlek och allergener bekräftas av ägaren före bokning.',
  allergens:[], price_ore:0, portion_label:'Bekräftas av ägaren', image_url:null, active:true, sort_order:index
}));

export function onlinePaymentsReady() {
  const key = process.env.STRIPE_SECRET_KEY;
  const validKey = isTestStripeKey(key) || (process.env.STRIPE_LIVE_ENABLED === 'true' && /^(sk|rk)_live_/.test(key || ''));
  return validKey && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'));
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
      db.from('dishes').select('id,slug,title,description,allergens,price_ore,portion_label,image_url,active,sort_order').eq('active',true).order('sort_order'),
      db.from('campaigns').select('id,title,description,media_url,starts_at,ends_at,menu_ids,active').eq('active',true).lte('starts_at',now).gte('ends_at',now).order('starts_at')
    ]);
    if(dishResult.error || campaignResult.error) throw new Error('Kunde inte läsa katalogen. Kör V3-migrationen.');
    dishes = (dishResult.data || []) as Dish[];
    campaigns = (campaignResult.data || []) as Campaign[];
  }
  const payment_methods: PaymentPreference[] = [];
  if(onlinePaymentsReady()) { payment_methods.push('card','apple_pay'); if(process.env.STRIPE_SWISH_ENABLED === 'true') payment_methods.push('swish'); }
  if(settings.cash_enabled && settings.pickup_enabled) payment_methods.push('cash');
  // Ta bort eventuella framtida privata databasfält genom en explicit kopia.
  const publicSettings: Settings = Object.fromEntries(Object.keys(previewSettings).map(key => [key,settings[key as keyof Settings]])) as Settings;
  return {menus:menus.map(({id,slug,title,description,included,allergens,price_ore,min_people,image_url,active,sort_order}) => ({id,slug,title,description,included,allergens,price_ore,min_people,image_url,active,sort_order})),dishes,campaigns,settings:publicSettings,delivery_zones,payment_methods,orders_enabled:ordersReady() && payment_methods.length > 0,demo:!isSupabaseReady()};
}
