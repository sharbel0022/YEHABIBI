export type Occasion = 'hemma' | 'fest' | 'foretag';
export type Fulfillment = 'delivery' | 'pickup';
export type OnlinePaymentMethod = 'swish' | 'card' | 'apple_pay' | 'google_pay';
export type PaymentMethod = OnlinePaymentMethod | 'cash';
export type PaymentPreference = PaymentMethod | 'unpaid';
export type OrderStatus = 'new' | 'reviewing' | 'changes_requested' | 'approved' | 'preparing' | 'rejected' | 'ready' | 'dispatched' | 'completed' | 'cancelled';
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
  cash_enabled: boolean; allow_unpaid_requests: boolean; delivery_fee_ore: number; min_advance_days: number;
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
  request_id?: string;
  menu_id?: string; items?: DishSelection[]; delivery_zone_id?: string;
  guests: number; occasion: Occasion; event_date: string; event_time: string;
  fulfillment: Fulfillment; address: string; postal_code: string; city: string;
  full_name: string; email: string; phone: string; notes: string;
  payment_preference: PaymentPreference; terms_accepted: true; website?: string;
};
/** Bara menyval sparas i ett utkast. Priser läses alltid från den aktuella katalogen. */
export type MenuSelection = {
  menuId: string | null;
  quantities: Record<string, number>;
  guests: number;
  occasion: Occasion;
};
export type OrderContactInput = Omit<OrderInput, 'request_id' | 'menu_id' | 'items' | 'guests' | 'occasion' | 'terms_accepted'> & {
  terms_accepted: boolean;
};
export type OrderPayload = Omit<OrderInput, 'terms_accepted'> & { terms_accepted: boolean };
export type OrderReference = { code: string; token: string };
export type OrderReceipt = OrderReference & { tracking_url: string };
export type OrderStatusResponse = { order: PublicOrder };
export type PaymentSessionResponse = { checkout_url: string; payment_status: PaymentStatus };
export type PushRegistrationResponse = { registered: true };
/** Ursprungliga rader bevaras. Förslaget visar en uttrycklig prisjustering. */
export type OrderProposal = {
  revision:number; message:string; subtotal_ore:number; delivery_fee_ore:number;
  total_ore:number; price_adjustment_ore:number; created_at:string;
};
export type CateringOrder = {
  id: string; code: string; tracking_hash: string; menu_id: string | null;
  menu_title: string; price_per_person_ore: number; delivery_zone_id?: string | null;
  guests: number; occasion: Occasion; event_date: string; event_time: string;
  fulfillment: Fulfillment; address: string; postal_code: string; city: string;
  full_name: string; email: string; phone: string; notes: string;
  subtotal_ore: number; delivery_fee_ore: number; total_ore: number;
  payment_preference: PaymentPreference; payment_status: PaymentStatus; status: OrderStatus;
  checkout_url: string | null;
  /** Inaktiva historiska referenser. Används aldrig för nya betalningar. */
  stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null;
  payment_provider?: string | null; provider_payment_id?: string | null; payment_attempt_id?: string | null;
  payment_transaction_reference?: string | null; payment_method?: PaymentMethod | null;
  payment_refund_status?: 'pending' | 'confirmed' | 'needs_review' | null;
  payment_review_required?: boolean; payment_review_reason?: string | null;
  admin_note: string | null; created_at: string; updated_at: string;
  order_items?: OrderLine[];
  items_snapshot:LegacyOrderLine[];
  request_id?:string|null; request_hash?:string|null;
  quote_revision?:number; accepted_revision?:number; proposal?:OrderProposal|null;
  price_adjustment_ore?:number;
};
export type PublicOrder = Pick<CateringOrder, 'code' | 'menu_title' | 'guests' | 'event_date' | 'event_time' | 'fulfillment' | 'status' | 'payment_status' | 'payment_preference' | 'subtotal_ore' | 'delivery_fee_ore' | 'total_ore' | 'checkout_url' | 'created_at' | 'proposal' | 'price_adjustment_ore' | 'payment_provider' | 'provider_payment_id' | 'payment_transaction_reference' | 'payment_method' | 'payment_review_required' | 'payment_review_reason' | 'payment_refund_status'> & { items: OrderLine[]; admin_note?:string|null };
export type Catalog = {
  menus: Menu[]; dishes: Dish[]; campaigns: Campaign[]; settings: Settings;
  delivery_zones: DeliveryZone[]; orders_enabled: boolean; payment_methods: PaymentPreference[]; demo: boolean;
  payment_unavailable_reason?: string;
};
