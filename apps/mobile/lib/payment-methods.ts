import { onlinePaymentMethods, type Catalog } from '@yehabibi/shared';

/** Hosted checkout decides wallet readiness. OS alone proves no native wallet capability. */
export function mobileOnlinePaymentMethods(
  catalog: Pick<Catalog, 'payment_methods' | 'direct_payment_methods' | 'demo' | 'test_mode'>,
  scope: 'catering' | 'direct' = 'catering',
) {
  if (catalog.demo) return [];
  const methods = scope === 'direct' ? catalog.direct_payment_methods || [] : catalog.payment_methods;
  // Only the explicitly verified simulator may display every simulated wallet.
  return onlinePaymentMethods(methods, { applePay: false, googlePay: false }, catalog.test_mode === true);
}
