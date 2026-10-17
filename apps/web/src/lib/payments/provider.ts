/** All values originate on the server. A browser return URL is never payment evidence. */
export type OnlinePaymentMethod = 'swish' | 'card' | 'apple_pay' | 'google_pay';
export type PaymentAttempt = {
  id: string; order_id: string; provider: string; method: OnlinePaymentMethod;
  amount_ore: number; currency: 'SEK'; quote_revision: number;
  provider_reference: string; idempotency_key: string;
  provider_payment_id: string | null; checkout_url: string | null;
  transaction_reference: string | null; expires_at: string | null;
  status: 'creating' | 'pending' | 'paid' | 'expired' | 'refunded'; created_at: string;
};
export type HostedPayment = {
  id: string; url: string; amount_ore: number; currency: string;
  reference: string; merchant_account: string; expires_at: string;
  status: 'active' | 'completed' | 'paid' | 'expired' | 'paymentPending';
};
export type PaymentEvent = {
  provider: string; event_id: string; event_code: string;
  kind: 'paid' | 'failed' | 'refunded' | 'review'; success: boolean;
  reference: string; transaction_reference: string; original_reference: string | null;
  amount_ore: number; currency: string; occurred_at: string;
};
export type RefundAttempt = {
  id: string; order_id: string; attempt_id: string; amount_ore: number; currency: 'SEK';
  provider: string; provider_reference: string; idempotency_key: string;
  provider_refund_id: string | null; transaction_reference: string;
  status: 'creating' | 'pending' | 'confirmed' | 'needs_review'; created_at: string;
};
export interface PaymentProvider {
  readonly name: string;
  availableMethods(amountOre?: number): Promise<OnlinePaymentMethod[]>;
  createPayment(attempt: PaymentAttempt, returnUrl: string): Promise<HostedPayment>;
  getPayment(id: string): Promise<HostedPayment>;
  verifyEvents(payload: unknown): PaymentEvent[];
  refund(attempt: RefundAttempt): Promise<{id: string; status: 'pending'}>;
}
