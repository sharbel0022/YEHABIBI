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
  direct_order_enabled?: boolean; catering_enabled?: boolean; package_portions?: number;
  preparation_minutes?: number; extra_preparation_minutes?: number; extra_preparation_every?: number;
  package_group?: string; size_label?: string; catering_price_ore?: number;
  availability_state?: 'available'|'paused'|'sold_out'; kitchen_units?: number; allowed_addon_ids?: string[];
};
export type Dish = {
  id: string; slug: string; title: string; description: string; allergens: string[];
  price_ore: number; portion_label: string; image_url: string | null; active: boolean; sort_order: number;
  category?:ItemCategory; suggested_per_person?:number;
  direct_addon_enabled?:boolean; kitchen_units?:number; preparation_minutes?:number;
};
export type DeliveryZone = {
  id: string; name: string; postal_prefixes: string[]; fee_ore: number; active: boolean;
  direct_enabled?: boolean; travel_minutes?: number | null;
  capacity_per_slot?:number; max_package_quantity?:number; delivery_window_minutes?:number;
};
export type Campaign = {
  id: string; title: string; description: string; media_url: string | null;
  starts_at: string; ends_at: string; menu_ids: string[]; active: boolean;
  order_cutoff_at?:string|null; fulfillment_dates?:string[]; quantity_limit?:number|null;
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
  campaign_id?:string;
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
export type PaymentSessionResponse = { checkout_url: string; payment_status: PaymentStatus; test_mode?: boolean };
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
  order_type?: 'direct' | 'catering'; package_quantity?: number | null; scheduled_at?: string | null;
  campaign_id?:string|null; capacity_status?:CapacityStatus|null; hold_expires_at?:string|null;
  preparation_starts_at?:string|null; confirmed_at?:string|null; kitchen_units?:number;
  acknowledged_at?:string|null; acknowledged_by?:string|null; packing_checklist?:PackingChecklist|Record<string,never>;
  packed_at?:string|null; kitchen_issue?:'no_show'|'delivery_delayed'|'other'|null; kitchen_note?:string|null;
};
export type PublicOrder = Pick<CateringOrder, 'code' | 'menu_title' | 'guests' | 'event_date' | 'event_time' | 'fulfillment' | 'status' | 'payment_status' | 'payment_preference' | 'subtotal_ore' | 'delivery_fee_ore' | 'total_ore' | 'checkout_url' | 'created_at' | 'proposal' | 'price_adjustment_ore' | 'payment_provider' | 'provider_payment_id' | 'payment_transaction_reference' | 'payment_method' | 'payment_review_required' | 'payment_review_reason' | 'payment_refund_status'> & { items: OrderLine[]; admin_note?:string|null; order_type?:'direct'|'catering'; package_quantity?:number|null; scheduled_at?:string|null; capacity_status?:CapacityStatus|null; hold_expires_at?:string|null; preparation_starts_at?:string|null; confirmed_at?:string|null; campaign_id?:string|null };
export type Catalog = {
  menus: Menu[]; dishes: Dish[]; campaigns: Campaign[]; settings: Settings;
  delivery_zones: DeliveryZone[]; orders_enabled: boolean; payment_methods: PaymentPreference[]; demo: boolean;
  payment_unavailable_reason?: string; direct_orders_enabled?: boolean;
  /** Endast den isolerade servern får intyga ett fungerande testläge. */
  test_mode?: boolean;
  opening_hours?:Pick<SchedulingSettings,'weekly_hours'|'special_hours'>;
};

export type CapacityStatus='held'|'confirmed'|'released'|'review';
export type PackingChecklist={packages:boolean;extras:boolean;sauces_bread:boolean;allergen_labels:boolean;order_number:boolean};
export type CapacityReservation={id:string;order_id:string|null;source:'direct'|'catering'|'manual';resource:'kitchen'|'delivery';zone_id:string|null;starts_at:string;ends_at:string;units:number;state:CapacityStatus;expires_at:string|null;reason:string|null};
export type OpeningHours = {
  weekday: number; closed: boolean; opens_at: string; closes_at: string; cutoff_at: string;
  pickup_from: string; pickup_until: string; delivery_from: string; delivery_until: string;
};
export type SpecialOpeningHours = Omit<OpeningHours, 'weekday'> & { date: string };
export type SchedulingSettings = {
  id: number; enabled: boolean; paused: boolean; auto_approve: boolean; interval_minutes: number;
  min_advance_minutes: number; capacity_per_slot: number; capacity_buffer_minutes: number; max_days_ahead: number;
  weekly_hours: OpeningHours[]; special_hours: SpecialOpeningHours[];
  blocked_slots: { starts_at: string; ends_at: string }[];
  hold_minutes?:number; delivery_capacity_per_slot?:number; watchdog_enabled?:boolean;
  acknowledgement_minutes?:number; auto_pause_unacknowledged?:boolean;
};
export type AvailabilityInput = {
  menu_id: string; quantity: number; fulfillment: Fulfillment; postal_code?: string; delivery_zone_id?: string;
  addons?:DishSelection[]; campaign_id?:string;
};
export type AvailableSlot = {
  starts_at: string; label: string; event_date: string; event_time: string; remaining_capacity: number;
  ends_at?:string; preparation_starts_at?:string;
};
export type AvailabilityResponse = {
  server_now: string; timezone: 'Europe/Stockholm'; enabled: boolean; reason?: string;
  pickup_address: string; preparation_minutes: number; delivery_fee_ore: number; subtotal_ore: number; total_ore: number;
  delivery_zone_id: string | null; slots: AvailableSlot[];
  lines?:OrderLine[]; kitchen_units?:number; delivery_window_minutes?:number;campaign_id?:string|null;
};
export type DirectOrderInput = AvailabilityInput & {
  request_id?: string; scheduled_at: string; expected_total_ore: number;
  address: string; postal_code: string; city: string; full_name: string; email: string; phone: string; notes: string;
  payment_preference: PaymentPreference; terms_accepted: true; website?: string;
};
