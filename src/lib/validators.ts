import { z } from 'zod';

export const newOrderSchema = z.object({
  menu_id: z.string().uuid(),
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
  min_advance_days:z.number().int().min(0).max(90)
});
export const adminActionSchema = z.object({
  action: z.enum(['approve','reject','request_changes','ready','complete','cash_paid','refund','payment_link']),
  admin_note: z.string().trim().max(1000).optional()
});
