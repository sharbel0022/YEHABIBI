import type { DeliveryZone, Dish, DishSelection, Fulfillment, Occasion, OrderLine, OrderStatus, PaymentPreference, PaymentStatus } from '../types/index.ts';
import { orderLimits } from '../limits.ts';

export const occasions: Record<Occasion, string> = {
  hemma: 'Hemma', fest: 'Fest', foretag: 'Företag'
};
export const paymentLabels: Record<PaymentPreference, string> = {
  swish: 'Swish', card: 'Visa / Mastercard', apple_pay: 'Apple Pay', google_pay: 'Google Pay',
  cash: 'Kontant vid hämtning', unpaid: 'Obetald förfrågan – betalning avtalas efter godkännande'
};
export const statusLabels: Record<OrderStatus, string> = {
  new: 'Mottagen', reviewing:'Under granskning', changes_requested: 'Ändring föreslagen',
  approved: 'Godkänd', preparing: 'Under förberedelse', rejected: 'Nekad', ready: 'Klar för hämtning', dispatched:'På väg',
  completed: 'Slutförd', cancelled: 'Avbruten'
};
export const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: 'Obetald', pending: 'Väntar på betalning', paid: 'Betald',
  refunded: 'Återbetald', failed: 'Betalning misslyckades'
};

export function calcTotal(priceOre: number, guests: number, fulfillment: Fulfillment, deliveryFeeOre: number) {
  if (![priceOre, guests, deliveryFeeOre].every((n) => Number.isSafeInteger(n) && n >= 0) || guests < 1) {
    throw new Error('Ogiltig prisberäkning');
  }
  const subtotal = priceOre * guests;
  const delivery = fulfillment === 'delivery' ? deliveryFeeOre : 0;
  const total = subtotal + delivery;
  if (!Number.isSafeInteger(total) || total > orderLimits.maxOrderTotalOre) throw new Error('Belopp för högt');
  return { subtotal_ore: subtotal, delivery_fee_ore: delivery, total_ore: total };
}

/** Live calculation shared by the customer, admin and server. Amounts are whole öre. */
export function calcItemsTotal(
  items: Array<{ unit_price_ore:number; quantity:number }>,
  guests:number, fulfillment:Fulfillment, deliveryFeeOre:number
) {
  if (!Number.isSafeInteger(guests) || guests < 1 || guests > 1000 ||
      !Number.isSafeInteger(deliveryFeeOre) || deliveryFeeOre < 0 ||
      items.length < 1 || items.length > 40) throw new Error('Ogiltigt antal eller avgift');
  let subtotal = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100 ||
        !Number.isSafeInteger(item.unit_price_ore) || item.unit_price_ore < 0) throw new Error('Ogiltig maträtt');
    subtotal += item.quantity * item.unit_price_ore;
    if (!Number.isSafeInteger(subtotal) || subtotal > orderLimits.maxOrderTotalOre) throw new Error('Belopp för högt');
  }
  const fee = fulfillment === 'delivery' ? deliveryFeeOre : 0;
  const total = subtotal + fee;
  if (!Number.isSafeInteger(total) || total > orderLimits.maxOrderTotalOre) throw new Error('Belopp för högt');
  return {subtotal_ore:subtotal,delivery_fee_ore:fee,total_ore:total,per_person_ore:Math.round(total/guests)};
}

/** Match the most specific delivery zone by postal-code prefix; fallback to the base price. */
export function deliveryFeeFor(
  postCode:string, baseFee:number, zones:Array<{postal_prefix:string;fee_ore:number}>
) {
  const normal = postCode.replace(/\s/g,'');
  const matching = zones.filter(zone => normal.startsWith(zone.postal_prefix))
    .sort((a,b) => b.postal_prefix.length-a.postal_prefix.length);
  return matching[0]?.fee_ore ?? baseFee;
}
export function campaignIsActive(enabled:boolean, start:string|null, end:string|null, today:string) {
  return enabled && (!start || today>=start) && (!end || today<=end);
}

export function canUseCash(preference: PaymentPreference, fulfillment: Fulfillment, enabled: boolean) {
  return preference !== 'cash' || (fulfillment === 'pickup' && enabled);
}

export function canTransition(status: OrderStatus, action: string, payment: PaymentStatus, preference: PaymentPreference) {
  if (action === 'review') return status === 'new';
  if (action === 'approve') return status === 'new' || status === 'reviewing';
  if (action === 'reject' || action === 'request_changes') return ['new','reviewing','changes_requested'].includes(status);
  if (action === 'cancel') return ['new','reviewing','changes_requested','approved'].includes(status) && payment === 'unpaid';
  if (action === 'preparing') return status === 'approved' && (payment === 'paid' || preference === 'cash');
  if (action === 'ready') return (status === 'approved' || status === 'preparing') && (payment === 'paid' || preference === 'cash');
  if (action === 'dispatched') return ['approved','preparing','ready'].includes(status) && payment === 'paid';
  if (action === 'complete') return ['approved','preparing','ready','dispatched'].includes(status) && payment === 'paid';
  if (action === 'cash_paid') return preference === 'cash' && ['approved','preparing','ready'].includes(status) && payment === 'unpaid';
  return false;
}

/** Alla belopp lagras i heltalsöre. Delbelopp per person kan behöva avrundas. */
export function calcDishTotal(items: DishSelection[], dishes: Dish[], guests: number, fulfillment: Fulfillment, deliveryFeeOre: number) {
  if (!Number.isSafeInteger(guests) || guests < orderLimits.minGuests || guests > orderLimits.maxGuests || !items.length || items.length > orderLimits.maxDishes) throw new Error('Ogiltigt antal');
  const seen = new Set<string>();
  const lines: OrderLine[] = items.map(item => {
    const dish = dishes.find(row => row.id === item.dish_id && row.active);
    if (!dish || seen.has(item.dish_id) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > orderLimits.maxQuantity || !Number.isSafeInteger(dish.price_ore) || dish.price_ore <= 0) throw new Error('Ogiltig maträtt eller mängd');
    seen.add(item.dish_id);
    return { dish_id: dish.id, menu_id: null, title: dish.title, quantity: item.quantity, unit_price_ore: dish.price_ore, total_ore: dish.price_ore * item.quantity };
  });
  const totals = calcTotal(lines.reduce((sum, line) => sum + line.total_ore, 0), 1, fulfillment, deliveryFeeOre);
  return { ...totals, price_per_person_ore: Math.round(totals.total_ore / guests), lines };
}

export function findDeliveryZone(zones: DeliveryZone[], postalCode: string, zoneId?: string) {
  const postal = postalCode.replace(/\s/g, '');
  if (!/^\d{5}$/.test(postal)) return null;
  const matching = zones.filter(zone => zone.active && zone.postal_prefixes.some(prefix => postal.startsWith(prefix)));
  const specificity = (zone:DeliveryZone) => Math.max(...zone.postal_prefixes.filter(prefix=>postal.startsWith(prefix)).map(prefix=>prefix.length));
  const best = matching.sort((a,b) => specificity(b)-specificity(a) || a.fee_ore-b.fee_ore || a.id.localeCompare(b.id))[0] || null;
  return zoneId && best?.id!==zoneId ? null : best;
}

export function eventDateBounds(minAdvanceDays:number,now=new Date()) {
  const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const day = Date.parse(`${today}T00:00:00Z`);
  const dateAfter = (days:number) => new Date(day+days*86400000).toISOString().slice(0,10);
  return {min:dateAfter(minAdvanceDays),max:dateAfter(365)};
}
export function isValidEventDate(date: string, minAdvanceDays: number, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const candidate = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(candidate.getTime()) || candidate.toISOString().slice(0, 10) !== date) return false;
  const bounds=eventDateBounds(minAdvanceDays,now);
  return date>=bounds.min && date<=bounds.max;
}

export function formatSek(ore: number) {
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(ore / 100)} kr`;
}

export function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

/** Lokal simulering får bara öppna samma privata backend som intygat testläget. */
export function safePaymentUrl(value: string | null | undefined, apiOrigin: string, verifiedTestMode = false) {
  if (!verifiedTestMode) return safeExternalUrl(value);
  if (!value) return null;
  try {
    const base = new URL(apiOrigin), url = new URL(value, base);
    const privateHost = (hostname: string) => {
      if (hostname === 'localhost' || hostname === '[::1]') return true;
      const parts = hostname.split('.');
      if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
      const [first, second] = parts.map(Number);
      return first === 127 || first === 10 || first === 192 && second === 168 || first === 172 && second >= 16 && second <= 31;
    };
    if (url.username || url.password || base.username || base.password || url.origin !== base.origin ||
        !privateHost(base.hostname) || !['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch { return null; }
}

export function paymentMethodLabel(preference: PaymentPreference, testMode = false) {
  return testMode && !['cash', 'unpaid'].includes(preference)
    ? `Simulerad ${paymentLabels[preference]}` : paymentLabels[preference];
}

export const testModeBanner = 'TESTLÄGE – INGA RIKTIGA BESTÄLLNINGAR';

const htmlEntities: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
};

export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, character => htmlEntities[character] ?? character);
}
