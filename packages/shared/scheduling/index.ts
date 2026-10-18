import type { DishSelection, PublicOrder } from '../types/index.ts';

/** Visning av en redan serverbokad tid; används aldrig för att beräkna lediga tider. */
export function formatScheduledTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset',
  }).format(new Date(value));
}

/** En intern acceptans är inte en betalningsverifierad kundbekräftelse. */
export function directOrderStatus(order: PublicOrder): { label: string; detail: string; confirmed: boolean; progress: number } {
  const state = (label: string, detail: string, confirmed = false, progress = 0) => ({ label, detail, confirmed, progress });
  if (order.payment_status === 'refunded') return state('Återbetald', 'Återbetalningen har verifierats.');
  if (order.payment_review_required || order.capacity_status === 'review') return state('Köket behöver hjälpa dig', order.payment_status === 'paid'
    ? 'Betalningen är verifierad, men tiden kunde inte bekräftas. Köket kontaktar dig om en ny tid eller återbetalning.'
    : 'Beställningen behöver kontrolleras av köket innan du fortsätter.');
  if (order.status === 'rejected' || order.status === 'cancelled') return state(order.status === 'rejected' ? 'Nekad' : 'Avbruten', 'Kontakta köket om du har frågor.');
  if (order.status === 'completed') return state(order.fulfillment === 'delivery' ? 'Levererad · slutförd' : 'Slutförd', 'Tack för din beställning.', order.payment_status === 'paid', 4);
  const confirmed = order.capacity_status === 'confirmed' && (order.payment_status === 'paid' || order.payment_preference === 'cash');
  if (!confirmed) {
    if (order.payment_status === 'paid') return state('Betald · inväntar köket', 'Betalningen är verifierad. Köket behöver bekräfta en möjlig tid eller ordna återbetalning.');
    if (order.capacity_status === 'released') return state('Tiden behöver kontrolleras igen', order.payment_status === 'failed'
      ? 'Reservationen är frigiven. Ett uttryckligt återförsök kontrollerar kapaciteten på servern; ingen tid är bekräftad ännu.'
      : 'Reservationen har löpt ut utan genomförd betalning. Starta en ny beställning och välj en aktuell tid.');
    if (order.status === 'new' || order.status === 'reviewing') return state('Mottagen · inväntar köket', 'Köket behöver godkänna beställningen. En reservation är inte en bekräftad order.');
    return state('Slutför betalningen', 'Tiden hålls tillfälligt. Beställningen bekräftas först när servern verifierat betalning och kapacitet.');
  }
  if (order.status === 'ready' || order.status === 'dispatched') return state(order.fulfillment === 'delivery' ? 'På väg' : 'Klar för hämtning', 'Följ kökets besked för utlämning eller leverans.', true, 3);
  if (order.status === 'preparing') return state('Tillagas', 'Köket förbereder din mat.', true, 2);
  return state('Bekräftad', order.payment_preference === 'cash' && order.payment_status !== 'paid' ? 'Din tid är bekräftad. Betala kontant vid hämtning; köket registrerar betalningen.' : 'Betalning och tid är verifierade. Köket förbereder enligt din bokning.', true, 1);
}

/** Bara livsmedelsreferenser kopieras. Priser, kontakt, kampanj, betalning och tid läses aldrig in i ett nytt köp. */
export function directReorderDraft(order: PublicOrder): { menu_id: string; quantity: number; addons: DishSelection[] } | null {
  if (order.order_type !== 'direct' || order.status !== 'completed') return null;
  const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  const packages = order.items.filter(line => line.menu_id);
  if (packages.length !== 1 || !uuid.test(packages[0].menu_id!) || !Number.isInteger(packages[0].quantity) || packages[0].quantity < 1 || packages[0].quantity > 100) return null;
  const addons: DishSelection[] = [];
  for (const line of order.items.filter(item => item.dish_id && !item.menu_id)) {
    if (!uuid.test(line.dish_id!) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 100 || addons.some(item => item.dish_id === line.dish_id)) return null;
    addons.push({ dish_id: line.dish_id!, quantity: line.quantity });
  }
  return { menu_id: packages[0].menu_id!, quantity: packages[0].quantity, addons };
}
