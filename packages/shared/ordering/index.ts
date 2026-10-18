import { calcDishTotal, calcTotal, canUseCash, findDeliveryZone, isValidEventDate } from '../pricing/index.ts';
import { isValidEventTime, orderContactSchema } from '../validation/index.ts';
import { orderLimits } from '../limits.ts';
import type {
  Catalog, DeliveryZone, DishSelection, Fulfillment, Menu, MenuSelection,
  OnlinePaymentMethod, OrderContactInput, OrderInput, OrderPayload, PublicOrder, Settings,
} from '../types/index.ts';

export function minimumGuestsFor(menu: Pick<Menu, 'min_people'> | null | undefined, customMinimum: number) {
  return menu?.min_people ?? customMinimum;
}

/** Köket anger antal enheter per person. Avrunda uppåt till hela beställningsbara enheter. */
export function suggestedQuantity(guests: number, perPerson: number | undefined) {
  if (!Number.isSafeInteger(guests) || guests < 1 || guests > orderLimits.maxGuests ||
      !Number.isFinite(perPerson) || !perPerson || perPerson < 0) return 0;
  const units = guests * perPerson;
  // Exempelvis 100 × 0,07 kan bli 7,000000000000001 i JavaScript.
  return Math.min(orderLimits.maxQuantity, Math.ceil(units - Number.EPSILON * units));
}

export function itemsFromQuantities(quantities: Record<string, number>): DishSelection[] {
  return Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dish_id, quantity]) => ({ dish_id, quantity }));
}

/** Läser bara matval från lokal lagring; kontaktuppgifter och klientpriser ignoreras. */
export function parseSelectionDraft(value: unknown): MenuSelection {
  const draft = value && typeof value === 'object' ? value as Partial<MenuSelection> : {};
  const quantities = draft.quantities && typeof draft.quantities === 'object' && !Array.isArray(draft.quantities)
    ? Object.fromEntries(Object.entries(draft.quantities)
      .filter(([id, quantity]) => id.length > 0 && id.length <= 100 &&
        Number.isSafeInteger(quantity) && quantity > 0 && quantity <= orderLimits.maxQuantity)
      .slice(0, orderLimits.maxDishes)) : {};
  return {
    menuId: typeof draft.menuId === 'string' && draft.menuId.length > 0 && draft.menuId.length <= 100 ? draft.menuId : null,
    quantities,
    guests: Number.isSafeInteger(draft.guests) && draft.guests! > 0 && draft.guests! <= orderLimits.maxGuests ? draft.guests! : 10,
    occasion: draft.occasion === 'fest' || draft.occasion === 'foretag' ? draft.occasion : 'hemma',
  };
}

/** En demo eller misslyckad hämtning får inte radera ett tidigare sparat utkast. */
export function reconcileSelection(catalog: Catalog, selection: MenuSelection): MenuSelection {
  if (catalog.demo) return selection;
  const available = new Set(catalog.dishes.filter(dish => dish.active).map(dish => dish.id));
  const quantities = Object.fromEntries(Object.entries(selection.quantities).filter(([id]) => available.has(id)));
  const menuId = catalog.menus.some(menu => menu.active && menu.id === selection.menuId) ? selection.menuId : null;
  return menuId === selection.menuId && Object.keys(quantities).length === Object.keys(selection.quantities).length
    ? selection : { ...selection, menuId, quantities };
}

/** Förhandsvisning från aktuell katalog. Servern läser om priserna före lagring. */
export function quoteSelection(catalog: Pick<Catalog, 'menus' | 'dishes' | 'settings'>,
  selection: MenuSelection, fulfillment: Fulfillment = 'pickup', fee = 0) {
  if (!Number.isSafeInteger(selection.guests) || selection.guests < 1 || selection.guests > orderLimits.maxGuests) return null;
  const menu = catalog.menus.find(item => item.id === selection.menuId && item.active);
  try {
    if (selection.menuId) {
      if (!menu || menu.price_ore <= 0 || selection.guests < minimumGuestsFor(menu, catalog.settings.custom_min_people)) return null;
      return {
        ...calcTotal(menu.catering_price_ore??menu.price_ore, selection.guests, fulfillment, fee),
        price_per_person_ore: menu.catering_price_ore??menu.price_ore,
      };
    }
    if (selection.guests < minimumGuestsFor(null, catalog.settings.custom_min_people)) return null;
    return calcDishTotal(itemsFromQuantities(selection.quantities), catalog.dishes, selection.guests, fulfillment, fee);
  } catch {
    return null;
  }
}

export function availablePaymentMethods(catalog: Pick<Catalog, 'payment_methods' | 'settings'>, fulfillment: Fulfillment) {
  const methods = catalog.payment_methods.filter(method => method !== 'unpaid' &&
    canUseCash(method, fulfillment, catalog.settings.cash_enabled));
  return catalog.settings.allow_unpaid_requests ? [...methods, 'unpaid' as const] : methods;
}

/** Kontots metoder kommer från backend. Plånböcker behöver även stöd på enheten. */
export function onlinePaymentMethods(methods: Catalog['payment_methods'], wallets: { applePay: boolean; googlePay: boolean }, testMode = false): OnlinePaymentMethod[] {
  return methods.filter((method): method is OnlinePaymentMethod =>
    method === 'card' || method === 'swish' || method === 'apple_pay' && (wallets.applePay || testMode) || method === 'google_pay' && (wallets.googlePay || testMode));
}

/** Ett startat försök fortsätter med samma metod och idempotensnyckel. */
export function orderPaymentMethods(methods: OnlinePaymentMethod[], order: Pick<PublicOrder, 'payment_provider' | 'payment_method'>) {
  return order.payment_provider && order.payment_method
    ? methods.filter(method => method === order.payment_method) : methods;
}

/** Lokala HTTP-backender får egna privata minnen. Befintliga HTTPS-nycklar bevaras. */
export function localApiStorageKey(key: string, apiUrl: string) {
  try {
    const url = new URL(apiUrl);
    if (url.protocol !== 'http:') return key;
    const origin = Array.from(url.origin).map(character => character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    return `${key}.local-${origin}`;
  } catch { return key; }
}

export function canOfferDelivery(catalog: Pick<Catalog, 'payment_methods' | 'settings' | 'delivery_zones'>) {
  return catalog.settings.delivery_enabled && catalog.delivery_zones.some(zone => zone.active) &&
    availablePaymentMethods(catalog, 'delivery').length > 0;
}

/** Samma orderformat för webb och mobil; klientbelopp skickas aldrig till servern. */
export function buildOrderPayload(selection: MenuSelection, contact: OrderContactInput): OrderPayload {
  return {
    ...(contact.campaign_id?{campaign_id:contact.campaign_id}:{}),
    menu_id: selection.menuId || undefined,
    items: selection.menuId ? undefined : itemsFromQuantities(selection.quantities),
    delivery_zone_id: contact.fulfillment === 'delivery' ? contact.delivery_zone_id : undefined,
    guests: selection.guests,
    occasion: selection.occasion,
    event_date: contact.event_date,
    event_time: contact.event_time,
    fulfillment: contact.fulfillment,
    address: contact.address,
    postal_code: contact.postal_code,
    city: contact.city,
    full_name: contact.full_name,
    email: contact.email,
    phone: contact.phone,
    notes: contact.notes,
    payment_preference: contact.payment_preference,
    terms_accepted: contact.terms_accepted,
    ...(contact.website !== undefined ? { website: contact.website } : {}),
  };
}

export function orderContactError(value: unknown) {
  const result = orderContactSchema.safeParse(value);
  if (result.success) return '';
  const messages: Record<string, string> = {
    full_name: 'Ange ditt fullständiga namn, minst två tecken.',
    email: 'Ange en giltig e-postadress, högst 200 tecken.',
    phone: 'Ange ett telefonnummer med minst 7 tecken. Använd siffror, +, mellanslag, bindestreck eller parenteser.',
    notes: 'Önskemålen får innehålla högst 1 000 tecken.',
  };
  return messages[String(result.error.issues[0]?.path[0])] || 'Kontrollera kontaktuppgifterna.';
}

type OrderDetails = Pick<OrderInput, 'event_date' | 'event_time' | 'fulfillment' | 'address' | 'postal_code' | 'city' | 'delivery_zone_id'>;

/** Datum, tid och leverans valideras också på nytt när förfrågan skickas. */
export function orderDetailsError(input: OrderDetails, settings: Settings, zones: DeliveryZone[], now = new Date()) {
  if (!isValidEventDate(input.event_date, settings.min_advance_days, now) || !isValidEventTime(input.event_time)) {
    return `Ange en giltig tid och ett datum minst ${settings.min_advance_days} dagar framåt, inom ett år.`;
  }
  if (input.fulfillment === 'pickup') return settings.pickup_enabled ? '' : 'Hämtning är inte tillgänglig. Kontakta oss.';
  if (!settings.delivery_enabled) return 'Leverans är inte tillgänglig. Välj hämtning.';
  if (!input.address.trim() || !input.city.trim() || !input.postal_code.trim()) return 'Ange fullständig leveransadress.';
  if (!findDeliveryZone(zones, input.postal_code, input.delivery_zone_id)) {
    return 'Postnumret ligger utanför våra leveranszoner. Välj hämtning eller kontakta oss.';
  }
  return '';
}

/** Visningsregel. Bara backend och signerade webhooks kan bekräfta betalningen. */
export function canPayOrder(order: Pick<PublicOrder, 'status' | 'payment_status' | 'payment_preference' | 'checkout_url' | 'proposal' | 'payment_review_required' | 'capacity_status'>) {
  if(order.capacity_status==='review' || order.capacity_status==='released' && order.payment_status!=='failed')return false;
  if (order.payment_review_required || order.proposal || order.payment_preference === 'cash' ||
      !['approved', 'preparing', 'ready'].includes(order.status) ||
      !['unpaid', 'pending', 'failed'].includes(order.payment_status)) return false;
  return true;
}

/** Samma åtta kundsteg; nekade och avbrutna order har ingen aktiv framstegspunkt. */
export function orderProgress(order: Pick<PublicOrder, 'status' | 'payment_status'>) {
  if (order.status === 'rejected' || order.status === 'cancelled') return 0;
  if (order.status === 'completed') return 8;
  if (order.status === 'ready' || order.status === 'dispatched') return 7;
  if (order.status === 'preparing') return 6;
  if (order.status === 'approved') return order.payment_status === 'paid' ? 5 : 4;
  if (order.status === 'reviewing' || order.status === 'changes_requested') return 2;
  return 1;
}

export function orderTimelineLabels(order: Pick<PublicOrder, 'fulfillment' | 'payment_preference'>) {
  return ['Mottagen', 'Under granskning', 'Godkänd',
    order.payment_preference === 'cash' ? 'Betalning vid hämtning' : 'Väntar på betalning',
    'Betald', 'Under förberedelse', order.fulfillment === 'pickup' ? 'Klar för hämtning' : 'På väg', 'Slutförd'];
}
