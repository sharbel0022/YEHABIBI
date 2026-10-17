export type Occasion = 'hemma' | 'fest' | 'foretag';
export type Fulfillment = 'delivery' | 'pickup';
export type PaymentPreference = 'swish' | 'card' | 'apple_pay' | 'cash';
export type OrderStatus = 'new' | 'changes_requested' | 'approved' | 'preparing' | 'rejected' | 'ready' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded' | 'failed';
export type ItemCategory = 'kalla_meze' | 'varma_meze' | 'grill' | 'vegetariskt' | 'brod_saser' | 'dessert';
/** V2-namn finns kvar för admin/API. Datan kommer från samma dishes-tabell. */
export type MenuItem = {
  id:string; title:string; description:string; category:ItemCategory; unit_label:string;
  unit_price_ore:number; suggested_per_person:number; allergens:string[]; image_url:string|null; active:boolean; sort_order:number;
};
export type LegacyOrderLine = {item_id:string;title:string;quantity:number;unit_label:string;unit_price_ore:number;line_total_ore:number};
export type LegacyDeliveryZone = {name:string;postal_prefix:string;fee_ore:number};

export type Menu = {
  id: string; slug: string; title: string; description: string;
  included: string[]; allergens: string[]; price_ore: number;
  min_people: number; image_url: string | null; active: boolean; sort_order: number;
};
export type Dish = {
  id: string; slug: string; title: string; description: string; allergens: string[];
  price_ore: number; portion_label: string; image_url: string | null; active: boolean; sort_order: number;
  category?:ItemCategory; suggested_per_person?:number;
};
export type DeliveryZone = {
  id: string; name: string; postal_prefixes: string[]; fee_ore: number; active: boolean;
};
export type Campaign = {
  id: string; title: string; description: string; media_url: string | null;
  starts_at: string; ends_at: string; menu_ids: string[]; active: boolean;
};
export type Settings = {
  id: number; brand_name: string; tagline: string; description: string;
  service_area: string; location_city: string; contact_email: string; contact_phone: string;
  hero_video_url: string | null; hero_poster_url: string | null; google_review_url: string | null;
  google_maps_url: string | null; instagram_url: string | null; facebook_url: string | null; tiktok_url: string | null;
  pickup_address: string; delivery_enabled: boolean; pickup_enabled: boolean;
  cash_enabled: boolean; delivery_fee_ore: number; min_advance_days: number;
  custom_min_people:number; delivery_zones:LegacyDeliveryZone[];
  campaign_title:string; campaign_description:string; campaign_image_url:string|null;
  campaign_start_date:string|null; campaign_end_date:string|null; campaign_enabled:boolean;
};
export type DishSelection = { dish_id: string; quantity: number };
export type OrderLine = {
  dish_id: string | null; menu_id: string | null; title: string;
  quantity: number; unit_price_ore: number; total_ore: number;
  item_id?:string|null; unit_label?:string;
};
export type OrderInput = {
  menu_id?: string; items?: DishSelection[]; delivery_zone_id?: string;
  guests: number; occasion: Occasion; event_date: string; event_time: string;
  fulfillment: Fulfillment; address: string; postal_code: string; city: string;
  full_name: string; email: string; phone: string; notes: string;
  payment_preference: PaymentPreference; terms_accepted: true; website?: string;
};
export type CateringOrder = {
  id: string; code: string; tracking_hash: string; menu_id: string | null;
  menu_title: string; price_per_person_ore: number; delivery_zone_id?: string | null;
  guests: number; occasion: Occasion; event_date: string; event_time: string;
  fulfillment: Fulfillment; address: string; postal_code: string; city: string;
  full_name: string; email: string; phone: string; notes: string;
  subtotal_ore: number; delivery_fee_ore: number; total_ore: number;
  payment_preference: PaymentPreference; payment_status: PaymentStatus; status: OrderStatus;
  checkout_url: string | null; stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null;
  admin_note: string | null; created_at: string; updated_at: string;
  order_items?: OrderLine[];
  items_snapshot:LegacyOrderLine[];
};
export type PublicOrder = Pick<CateringOrder, 'code' | 'menu_title' | 'guests' | 'event_date' | 'event_time' | 'fulfillment' | 'status' | 'payment_status' | 'payment_preference' | 'subtotal_ore' | 'delivery_fee_ore' | 'total_ore' | 'checkout_url' | 'created_at'> & { items: OrderLine[] };
export type Catalog = {
  menus: Menu[]; dishes: Dish[]; campaigns: Campaign[]; settings: Settings;
  delivery_zones: DeliveryZone[]; orders_enabled: boolean; payment_methods: PaymentPreference[]; demo: boolean;
};
