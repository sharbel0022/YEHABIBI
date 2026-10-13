import type { Fulfillment, Occasion, OrderStatus, PaymentPreference, PaymentStatus } from '../types/domain.ts';

export const occasions: Record<Occasion, string> = {
  hemma: 'Hemma', fest: 'Fest', foretag: 'Företag'
};
export const paymentLabels: Record<PaymentPreference, string> = {
  swish: 'Swish', card: 'Kort', apple_pay: 'Apple Pay', cash: 'Kontant vid hämtning'
};
export const statusLabels: Record<OrderStatus, string> = {
  new: 'Ny förfrågan', changes_requested: 'Ändring föreslagen',
  approved: 'Godkänd', rejected: 'Nekad', ready: 'Klar för hämtning/leverans',
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
  if (!Number.isSafeInteger(total) || total > 100000000) throw new Error('Belopp för högt');
  return { subtotal_ore: subtotal, delivery_fee_ore: delivery, total_ore: total };
}

export function canUseCash(preference: PaymentPreference, fulfillment: Fulfillment, enabled: boolean) {
  return preference !== 'cash' || (fulfillment === 'pickup' && enabled);
}

export function canTransition(status: OrderStatus, action: string, payment: PaymentStatus, preference: PaymentPreference) {
  if (action === 'approve' || action === 'reject' || action === 'request_changes') {
    return status === 'new' || status === 'changes_requested';
  }
  if (action === 'ready') return status === 'approved';
  if (action === 'complete') return (status === 'approved' || status === 'ready') && payment === 'paid';
  if (action === 'cash_paid') return preference === 'cash' && (status === 'approved' || status === 'ready') && payment === 'unpaid';
  return false;
}

export function stripePaymentTypes(preference: PaymentPreference, swishEnabled: boolean): ['card'] | ['swish'] {
  if (preference === 'cash') throw new Error('Kontantbetalningar ska inte gå till Stripe');
  if (preference === 'swish') {
    if (!swishEnabled) throw new Error('Swish är ännu inte aktiverat i betalningskontot');
    return ['swish'];
  }
  return ['card']; // Apple Pay is a wallet on eligible Stripe card checkout devices.
}

export function isValidEventDate(date: string, minAdvanceDays: number, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const candidate = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(candidate.getTime()) || candidate.toISOString().slice(0, 10) !== date) return false;
  const swedishToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${swedishToday}T00:00:00Z`)) / 86400000;
  return days >= minAdvanceDays && days <= 365;
}

export function formatSek(ore: number) {
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(ore / 100)} kr`;
}

export function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

const htmlEntities: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
};

export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, character => htmlEntities[character] ?? character);
}
