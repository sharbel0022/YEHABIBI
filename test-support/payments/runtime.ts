import 'server-only';
import { adminDb } from '@/lib/supabase';
import type { PaymentRuntime } from '@/lib/payments/provider';
import { testEnvironmentSettings, assertTestIsolation } from '@/lib/test-payments/guard';
import { TestPaymentProvider } from '@/lib/test-payments/provider';
import { dispatchTestPaymentEvent } from '@/lib/test-payments/dispatch';

export function paymentRuntime(): PaymentRuntime {
  let enabled = false;
  try { testEnvironmentSettings(); enabled = true; } catch {}
  const validate = async () => { await assertTestIsolation(async () => {
    const {data, error} = await adminDb().from('test_environment_guard').select('isolation_id,secret_hash').eq('id',true).single();
    if (error) throw new Error('Testdatabasen kunde inte verifieras.');
    return data;
  }); };
  return {identity: {provider: 'local_test', environment: 'test'}, configured: enabled, webhooksConfigured: enabled,
    isSimulation: true, validate, createProvider: () => new TestPaymentProvider(adminDb(), validate, testEnvironmentSettings(), dispatchTestPaymentEvent)};
}
