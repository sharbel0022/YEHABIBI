import 'server-only';
import { randomUUID } from 'node:crypto';
import { adminDb } from '@/lib/supabase';
import { deliverNotificationBatch } from '@/lib/mailer';
import { paymentRuntime } from '@/lib/payments/runtime';
import { reconcileExistingPayment } from '@/lib/payments/service';
import type { PaymentAttempt } from '@/lib/payments/provider';
import { DeliveryRetryError } from './policy';

type Job = {id:string; kind:string; lease_token:string; payload:Record<string, unknown>};

/** One bounded tick. The scheduler, rather than page visits, invokes this entry point. */
export async function runBackgroundJobs() {
  const db = adminDb(), worker = randomUUID();
  async function rpc<T>(name:string, args:Record<string,unknown> = {}):Promise<T> {
    const {data,error} = await db.rpc(name,args).abortSignal(AbortSignal.timeout(10000));
    if (error) throw new Error('Background database operation failed');
    return data as T;
  }
  await rpc('enqueue_background_maintenance');
  // A lease exceeds this tick's network budget. DB mutations fence on lease_token.
  const jobs = await rpc<Job[]>('claim_background_jobs',{p_worker:worker,p_limit:3,p_lease_seconds:180});
  let completed=0, failed=0;
  for (const job of jobs || []) {
    try {
      if (job.kind === 'reconciliation') {
        const {data:attempt,error} = await db.from('payment_attempts').select('*').eq('id',job.payload.attempt_id).abortSignal(AbortSignal.timeout(8000)).single();
        if (error || !attempt) throw new Error('Payment attempt unavailable');
        const runtime = paymentRuntime(); await runtime.validate();
        let result;
        try { result = await reconcileExistingPayment(runtime.createProvider('verification'),attempt as PaymentAttempt); }
        catch { result = {reason:'verification_credentials_or_identity_unavailable',manual_review_required:true,next_check_at:null}; }
        // Fenced completion also records reconciliation metadata in one transaction.
        const accepted=await rpc<boolean>('finish_payment_reconciliation_job',{p_id:job.id,p_lease_token:job.lease_token,
          p_reason:result.reason,p_manual_review:result.manual_review_required,p_next_check_at:result.next_check_at});
        if(!accepted)throw new Error('Job lease lost');
      } else {
        if(!await rpc<boolean>('execute_database_job',{p_id:job.id,p_lease_token:job.lease_token}))throw new Error('Job lease lost');
      }
      completed++;
    } catch (error) {
      failed++;
      // Never persist provider bodies, order tokens, URLs or credentials as errors.
      await rpc('fail_background_job',{p_id:job.id,p_lease_token:job.lease_token,p_error:'job_execution_failed',
        p_retry_after_seconds:error instanceof DeliveryRetryError ? error.retryAfter ?? null : null});
    }
  }
  const notifications = await deliverNotificationBatch(worker,1);
  const health = await rpc('background_job_health');
  return {completed,failed,notifications,health};
}
