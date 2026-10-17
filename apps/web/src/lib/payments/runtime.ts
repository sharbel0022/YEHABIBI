import 'server-only';
import { AdyenProvider, adyenConfigured, adyenVerificationConfigured } from './providers/adyen';
import type { PaymentRuntime } from './provider';

/** Production composition root. No environment variable can select another provider implementation. */
export function paymentRuntime(): PaymentRuntime {
  return {
    identity: {provider: 'adyen', environment: process.env.ADYEN_ENVIRONMENT === 'live' ? 'live' : 'test'},
    configured: adyenConfigured(), webhooksConfigured: adyenVerificationConfigured(), isSimulation: false,
    validate: async () => {},
    createProvider: purpose => new AdyenProvider(process.env, fetch, purpose)
  };
}
