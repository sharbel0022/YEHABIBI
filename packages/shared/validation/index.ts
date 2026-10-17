import { z } from 'zod';

export const newOrderSchema = z.object({
  request_id:z.string().uuid().optional(),
  menu_id: z.string().uuid().nullish().transform(value=>value??undefined),
  items: z.array(z.union([
    z.object({dish_id:z.string().uuid(),quantity:z.number().int().min(1).max(1000)}),
    z.object({item_id:z.string().uuid(),quantity:z.number().int().min(1).max(100)}).transform(({item_id,quantity})=>({dish_id:item_id,quantity}))
  ])).max(50).optional().transform(value=>value?.length?value:undefined),
  delivery_zone_id: z.string().uuid().optional(),
  guests: z.number().int().min(1).max(1000),
  occasion: z.enum(['hemma','fest','foretag']),
  event_date: z.iso.date(),
  event_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  fulfillment: z.enum(['delivery','pickup']),
  address: z.string().trim().max(220).default(''),
  postal_code: z.string().trim().max(15).default(''),
  city: z.string().trim().max(100).default(''),
  full_name: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  phone: z.string().trim().min(7).max(30).regex(/^[+\d()\s-]+$/),
  notes: z.string().trim().max(1000).default(''),
  payment_preference: z.enum(['swish','card','apple_pay','cash']),
  terms_accepted: z.literal(true),
  website: z.string().max(0).optional() // hidden bot honeypot
}).refine(value => Boolean(value.menu_id) !== Boolean(value.items), 'Välj ett paket eller egna maträtter.')
  .refine(value => !value.items || new Set(value.items.map(item => item.dish_id)).size === value.items.length, 'Samma maträtt får inte förekomma två gånger.');

export const itemSchema = z.object({
  title:z.string().trim().min(2).max(90),description:z.string().trim().max(350),
  category:z.enum(['kalla_meze','varma_meze','grill','vegetariskt','brod_saser','dessert']),
  unit_label:z.string().trim().min(1).max(35),unit_price_ore:z.number().int().min(0).max(1000000),
  suggested_per_person:z.number().min(0).max(20),allergens:z.array(z.string().trim().max(80)).max(30),
  image_url:z.union([z.url(),z.string().regex(/^\/images\/[\w.-]+$/),z.literal(''),z.null()]).optional(),
  active:z.boolean(),sort_order:z.number().int().min(0).max(500)
});

export const menuSchema = z.object({
  title:z.string().trim().min(2).max(100), description:z.string().trim().max(350),
  included:z.array(z.string().trim().max(80)).max(30),
  allergens:z.array(z.string().trim().max(80)).max(30),
  price_ore:z.number().int().min(0).max(10000000),
  min_people:z.number().int().min(1).max(1000),
  image_url:z.union([z.url(),z.literal(''),z.null()]).optional(),
  active:z.boolean(), sort_order:z.number().int().min(0).max(500)
});

export const settingsSchema = z.object({
  brand_name:z.string().trim().min(2).max(80),
  tagline:z.string().trim().max(180), description:z.string().trim().max(400),
  service_area:z.string().trim().max(240), location_city:z.string().trim().max(100),
  contact_email:z.union([z.email(),z.literal('')]), contact_phone:z.string().trim().max(35),
  pickup_address:z.string().trim().max(230),
  hero_video_url:z.union([z.url(),z.literal(''),z.null()]).optional(),
  hero_poster_url:z.union([z.url(),z.string().regex(/^\/images\/[\w.-]+$/),z.literal(''),z.null()]).optional(),
  google_review_url:z.union([z.url(),z.literal(''),z.null()]).optional(),
  google_maps_url:z.union([z.url(),z.literal(''),z.null()]).optional(),
  instagram_url:z.union([z.url(),z.literal(''),z.null()]).optional(),
  facebook_url:z.union([z.url(),z.literal(''),z.null()]).optional(),
  tiktok_url:z.union([z.url(),z.literal(''),z.null()]).optional(),
  delivery_enabled:z.boolean(), pickup_enabled:z.boolean(),cash_enabled:z.boolean(),
  delivery_fee_ore:z.number().int().min(0).max(10000000),
  min_advance_days:z.number().int().min(0).max(90),
  custom_min_people:z.number().int().min(1).max(100),
  delivery_zones:z.array(z.object({
    name:z.string().trim().min(2).max(80),
    postal_prefix:z.string().regex(/^\d{1,5}$/),
    fee_ore:z.number().int().min(0).max(1000000)
  })).max(100).refine(zones=>new Set(zones.map(zone=>zone.postal_prefix)).size===zones.length,'Samma postnummerprefix får inte upprepas.'),
  campaign_title:z.string().trim().max(120),
  campaign_description:z.string().trim().max(350),
  campaign_image_url:z.union([z.url(),z.string().regex(/^\/images\/[\w.-]+$/),z.literal(''),z.null()]).optional(),
  campaign_start_date:z.union([z.iso.date(),z.literal(''),z.null()]).optional(),
  campaign_end_date:z.union([z.iso.date(),z.literal(''),z.null()]).optional(),
  campaign_enabled:z.boolean()
});
export const adminActionSchema = z.object({
  action: z.enum(['review','approve','reject','request_changes','preparing','ready','dispatched','complete','cancel','cash_paid','refund','payment_link','resend_notifications']),
  admin_note: z.string().trim().max(1000).optional(),
  proposed_total_ore:z.number().int().min(1).max(100000000).optional()
}).refine(value=>value.action!=='request_changes' || Boolean(value.admin_note),'Förklara förslaget för kunden.');

export const customerActionSchema = z.discriminatedUnion('action',[
  z.object({action:z.literal('accept_changes'),revision:z.number().int().min(2)}),
  z.object({action:z.literal('register_push'),push_token:z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/)})
]);

const mediaUrl = z.union([z.url().refine(value => value.startsWith('https://')), z.string().regex(/^\/images\/[\w.-]+$/), z.literal(''), z.null()]);
export const dishSchema = z.object({
  title:z.string().trim().min(2).max(100), description:z.string().trim().max(350),
  allergens:z.array(z.string().trim().min(1).max(80)).max(30),
  price_ore:z.number().int().min(0).max(10000000), portion_label:z.string().trim().min(1).max(100),
  image_url:mediaUrl, active:z.boolean(), sort_order:z.number().int().min(0).max(500),
  category:z.enum(['kalla_meze','varma_meze','grill','vegetariskt','brod_saser','dessert']).optional(),
  suggested_per_person:z.number().min(0).max(20).optional()
});
export const zoneSchema = z.object({
  name:z.string().trim().min(2).max(100), postal_prefixes:z.array(z.string().regex(/^\d{1,5}$/)).min(1).max(100),
  fee_ore:z.number().int().min(0).max(10000000), active:z.boolean()
});
export const campaignSchema = z.object({
  title:z.string().trim().min(2).max(100), description:z.string().trim().max(500), media_url:mediaUrl,
  starts_at:z.iso.datetime({offset:true}), ends_at:z.iso.datetime({offset:true}),
  menu_ids:z.array(z.string().uuid()).max(50), active:z.boolean()
}).refine(value => Date.parse(value.starts_at) < Date.parse(value.ends_at), 'Slutdatum måste ligga efter startdatum.');
