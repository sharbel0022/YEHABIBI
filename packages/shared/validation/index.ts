import { z } from 'zod';
import { orderLimits } from '../limits.ts';

export const eventTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
export function isValidEventTime(value: string) { return eventTimePattern.test(value); }

const contactFields = {
  full_name: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  phone: z.string().trim().min(7).max(30).regex(/^[+\d()\s-]+$/),
  notes: z.string().trim().max(1000).default(''),
};
export const orderContactSchema = z.object(contactFields);

export const newOrderSchema = z.object({
  campaign_id:z.string().uuid().optional(),
  request_id:z.string().uuid().optional(),
  menu_id: z.string().uuid().nullish().transform(value=>value??undefined),
  items: z.array(z.union([
    z.object({dish_id:z.string().uuid(),quantity:z.number().int().min(1).max(orderLimits.maxQuantity)}),
    z.object({item_id:z.string().uuid(),quantity:z.number().int().min(1).max(100)}).transform(({item_id,quantity})=>({dish_id:item_id,quantity}))
  ])).max(orderLimits.maxDishes).optional().transform(value=>value?.length?value:undefined),
  delivery_zone_id: z.string().uuid().optional(),
  guests: z.number().int().min(orderLimits.minGuests).max(orderLimits.maxGuests),
  occasion: z.enum(['hemma','fest','foretag']),
  event_date: z.iso.date(),
  event_time: z.string().regex(eventTimePattern),
  fulfillment: z.enum(['delivery','pickup']),
  address: z.string().trim().max(220).default(''),
  postal_code: z.string().trim().max(15).default(''),
  city: z.string().trim().max(100).default(''),
  full_name: contactFields.full_name,
  email: contactFields.email,
  phone: contactFields.phone,
  notes: contactFields.notes,
  payment_preference: z.enum(['swish','card','apple_pay','google_pay','cash','unpaid']),
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
  image_url:z.union([z.url().refine(value=>value.startsWith('https://')),z.string().regex(/^\/images\/[\w.-]+$/),z.literal(''),z.null()]).optional(),
  active:z.boolean(), sort_order:z.number().int().min(0).max(500),
  direct_order_enabled:z.boolean().optional(), catering_enabled:z.boolean().optional(),
  package_portions:z.number().int().min(1).max(10).optional(),
  preparation_minutes:z.number().int().min(1).max(1440).optional(),
  extra_preparation_minutes:z.number().int().min(0).max(1440).optional(),
  extra_preparation_every:z.number().int().min(1).max(100).optional()
  ,package_group:z.string().trim().max(100).optional(),size_label:z.string().trim().max(80).optional(),
  catering_price_ore:z.number().int().min(0).max(10000000).optional(),
  availability_state:z.enum(['available','paused','sold_out']).optional(),kitchen_units:z.number().int().min(1).max(10000).optional(),
  allowed_addon_ids:z.array(z.string().uuid()).max(50).optional()
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
  allow_unpaid_requests:z.boolean().default(false),
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
  action: z.enum(['review','approve','reject','request_changes','preparing','ready','dispatched','complete','cancel','cash_paid','refund','payment_link','resend_notifications','acknowledge','packing','issue']),
  admin_note: z.string().trim().max(1000).optional(),
  packing_checklist:z.object({packages:z.boolean(),extras:z.boolean(),sauces_bread:z.boolean(),allergen_labels:z.boolean(),order_number:z.boolean()}).optional(),
  kitchen_issue:z.enum(['no_show','delivery_delayed','other']).nullable().optional(),kitchen_note:z.string().trim().max(1000).optional(),
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
  suggested_per_person:z.number().min(0).max(20).optional(),
  direct_addon_enabled:z.boolean().optional(),kitchen_units:z.number().int().min(1).max(10000).optional(),
  preparation_minutes:z.number().int().min(0).max(1440).optional()
});
export const zoneSchema = z.object({
  name:z.string().trim().min(2).max(100), postal_prefixes:z.array(z.string().regex(/^\d{1,5}$/)).min(1).max(100),
  fee_ore:z.number().int().min(0).max(10000000), active:z.boolean(),
  direct_enabled:z.boolean().optional(), travel_minutes:z.number().int().min(0).max(480).nullable().optional(),
  capacity_per_slot:z.number().int().min(1).max(1000).optional(),max_package_quantity:z.number().int().min(1).max(100).optional(),
  delivery_window_minutes:z.number().int().min(5).max(120).optional()
});

const availabilityFields = {
  menu_id:z.string().uuid(), quantity:z.number().int().min(1).max(100), fulfillment:z.enum(['pickup','delivery']),
  postal_code:z.string().trim().max(15).optional(), delivery_zone_id:z.string().uuid().optional()
  ,addons:z.array(z.object({dish_id:z.string().uuid(),quantity:z.number().int().min(1).max(100)})).max(20)
    .refine(items=>new Set(items.map(item=>item.dish_id)).size===items.length,'Samma tillbehör får bara anges en gång.').optional(),
  campaign_id:z.string().uuid().optional()
};
export const availabilitySchema = z.object(availabilityFields);
export const directOrderSchema = z.object({
  ...availabilityFields, ...contactFields, request_id:z.string().uuid().optional(),
  scheduled_at:z.iso.datetime({offset:true}), expected_total_ore:z.number().int().min(1).max(100000000),
  address:z.string().trim().max(220).default(''), postal_code:z.string().trim().max(15).default(''), city:z.string().trim().max(100).default(''),
  payment_preference:z.enum(['swish','card','apple_pay','google_pay','cash','unpaid']), terms_accepted:z.literal(true), website:z.string().max(0).optional()
});
const openingFields = {
  closed:z.boolean(), opens_at:z.string().regex(eventTimePattern), closes_at:z.string().regex(eventTimePattern),
  cutoff_at:z.string().regex(eventTimePattern), pickup_from:z.string().regex(eventTimePattern), pickup_until:z.string().regex(eventTimePattern),
  delivery_from:z.string().regex(eventTimePattern), delivery_until:z.string().regex(eventTimePattern)
};
export const schedulingSchema = z.object({
  enabled:z.boolean(), paused:z.boolean(), auto_approve:z.boolean(), interval_minutes:z.number().int().min(5).max(120),
  min_advance_minutes:z.number().int().min(0).max(10080), capacity_per_slot:z.number().int().min(1).max(1000),
  capacity_buffer_minutes:z.number().int().min(0).max(1440), max_days_ahead:z.number().int().min(1).max(30),
  weekly_hours:z.array(z.object({...openingFields,weekday:z.number().int().min(0).max(6)})).max(7)
    .refine(days=>new Set(days.map(day=>day.weekday)).size===days.length,'Varje veckodag får bara anges en gång.'),
  special_hours:z.array(z.object({...openingFields,date:z.iso.date()})).max(100)
    .refine(days=>new Set(days.map(day=>day.date)).size===days.length,'Varje datum får bara anges en gång.'),
  blocked_slots:z.array(z.object({starts_at:z.iso.datetime({offset:true}),ends_at:z.iso.datetime({offset:true})})
    .refine(slot=>Date.parse(slot.ends_at)>Date.parse(slot.starts_at),'Sluttid måste ligga efter starttid.')).max(200),
  hold_minutes:z.number().int().min(1).max(60).optional(),delivery_capacity_per_slot:z.number().int().min(1).max(1000).optional(),
  watchdog_enabled:z.boolean().optional(),acknowledgement_minutes:z.number().int().min(1).max(120).optional(),auto_pause_unacknowledged:z.boolean().optional()
});
export const campaignSchema = z.object({
  title:z.string().trim().min(2).max(100), description:z.string().trim().max(500), media_url:mediaUrl,
  starts_at:z.iso.datetime({offset:true}), ends_at:z.iso.datetime({offset:true}),
  menu_ids:z.array(z.string().uuid()).max(50), active:z.boolean(),
  order_cutoff_at:z.iso.datetime({offset:true}).nullable().optional(),fulfillment_dates:z.array(z.iso.date()).max(100).optional(),
  quantity_limit:z.number().int().min(1).max(1000000).nullable().optional()
}).refine(value => Date.parse(value.starts_at) < Date.parse(value.ends_at), 'Slutdatum måste ligga efter startdatum.');
