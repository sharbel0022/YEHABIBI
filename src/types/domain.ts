/** Adminstyrda rätter för "Bygg eget" (alla priser i öre). */
export type ItemCategory = 'kalla_meze' | 'varma_meze' | 'grill' | 'vegetariskt' | 'brod_saser' | 'dessert';
export type MenuItem = {
  id: string; title: string; description: string; category: ItemCategory;
  unit_label: string; unit_price_ore: number; suggested_per_person: number;
  allergens: string[]; image_url: string | null; active: boolean; sort_order: number;
};
export type OrderLine = {
  item_id: string; title: string; quantity: number; unit_label: string;
  unit_price_ore: number; line_total_ore: number;
};
export type DeliveryZone = { name: string; postal_prefix: string; fee_ore: number };

export type Occasion = 'hemma' | 'fest' | 'foretag';
export type Fulfillment = 'delivery' | 'pickup';
export type PaymentPreference = 'swish' | 'card' | 'apple_pay' | 'cash';
export type OrderStatus = 'new' | 'changes_requested' | 'approved' | 'rejected' | 'ready' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded' | 'failed';

export type Menu = {
  id: string; slug: string; title: string; description: string;
  included: string[]; allergens: string[]; price_ore: number;
  min_people: number; image_url: string | null; active: boolean;
  sort_order: number;
};

export type Settings = {
  id: number; brand_name: string; tagline: string; description: string;
  service_area: string; location_city: string; contact_email: string;
  contact_phone: string; hero_video_url: string | null;
  hero_poster_url: string | null; google_review_url: string | null;
  google_maps_url: string | null; instagram_url: string | null;
  facebook_url: string | null; tiktok_url: string | null;
  pickup_address: string;
  custom_min_people: number; delivery_zones: DeliveryZone[];
  campaign_title: string; campaign_description: string; campaign_image_url: string | null;
  campaign_start_date: string | null; campaign_end_date: string | null;
  campaign_enabled: boolean; delivery_enabled: boolean; pickup_enabled: boolean;
  cash_enabled: boolean; delivery_fee_ore: number; min_advance_days: number;
};

export type CateringOrder = {
  id: string; code: string; tracking_hash: string; menu_id: string | null;
  menu_title: string; price_per_person_ore: number; items_snapshot: OrderLine[];
  guests: number; occasion: Occasion; event_date: string; event_time: string;
  fulfillment: Fulfillment; address: string; postal_code: string; city: string;
  full_name: string; email: string; phone: string; notes: string;
  subtotal_ore: number; delivery_fee_ore: number; total_ore: number;
  payment_preference: PaymentPreference; payment_status: PaymentStatus;
  status: OrderStatus; checkout_url: string | null;
  stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null;
  admin_note: string | null; created_at: string; updated_at: string;
};
