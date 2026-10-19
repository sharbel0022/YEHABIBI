/** All values originate on the server. A browser return URL is never payment evidence. */
export type OnlinePaymentMethod = 'swish' | 'card' | 'apple_pay' | 'google_pay';
export class InvalidPaymentEventError extends Error {}
export type PaymentEnvironment = 'test' | 'live';
export type PaymentAttempt = {
  id: string; order_id: string; provider: string; method: OnlinePaymentMethod;
  environment: PaymentEnvironment;
  merchant_account?: string | null;
  integration_type?: 'adyen_pay_by_link' | 'adyen_hosted_checkout' | 'local_test';
  amount_ore: number; currency: 'SEK'; quote_revision: number;
  provider_reference: string; idempotency_key: string;
  provider_payment_id: string | null; checkout_url: string | null;
  transaction_reference: string | null; expires_at: string | null;
  status: 'creating' | 'pending' | 'paid' | 'expired' | 'refunded' | 'failed'; created_at: string;
};
export type HostedPayment = {
  environment: PaymentEnvironment;
  id: string; url: string; amount_ore: number; currency: string;
  reference: string; merchant_account: string; expires_at: string;
  status: 'active' | 'completed' | 'paid' | 'expired' | 'paymentPending';
};
export type PaymentEvent = {
  environment: PaymentEnvironment;
  merchant_account?: string;
  provider: string; event_id: string; event_code: string;
  kind: 'paid' | 'failed' | 'refunded' | 'review'; success: boolean;
  reference: string; transaction_reference: string; original_reference: string | null;
  amount_ore: number; currency: string; occurred_at: string;
};
export type RefundAttempt = {
  environment: PaymentEnvironment;
  merchant_account?: string | null;
  id: string; order_id: string; attempt_id: string; amount_ore: number; currency: 'SEK';
  provider: string; provider_reference: string; idempotency_key: string;
  provider_refund_id: string | null; transaction_reference: string;
  status: 'creating' | 'pending' | 'confirmed' | 'needs_review'; created_at: string;
};
export interface PaymentProvider {
  readonly name: string;
  readonly environment: PaymentEnvironment;
  readonly merchantAccount?: string;
  availableMethods(amountOre?: number): Promise<OnlinePaymentMethod[]>;
  createPayment(attempt: PaymentAttempt, returnUrl: string): Promise<HostedPayment>;
  getPayment(id: string): Promise<HostedPayment>;
  verifyEvents(payload: unknown): PaymentEvent[];
  refund(attempt: RefundAttempt): Promise<{id: string; status: 'pending'}>;
}
export type PaymentRuntime = {
  identity: {provider: string; environment: PaymentEnvironment; merchant_account?: string};
  configured: boolean; webhooksConfigured: boolean; isSimulation: boolean;
  validate(): Promise<void>;
  createProvider(purpose?: 'payments' | 'verification'): PaymentProvider;
};
