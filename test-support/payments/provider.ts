import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HostedPayment, OnlinePaymentMethod, PaymentAttempt, PaymentEvent, PaymentProvider, RefundAttempt } from '@/lib/payments/provider';
import type { IsolationSettings } from './guard.ts';

export type SimulationAction = 'success' | 'decline' | 'cancel' | 'expire' | 'duplicate' | 'delay' | 'deliver_delayed';
type Session = {id: string; attempt_id: string; reference: string; amount_ore: number; currency: string; method: OnlinePaymentMethod;
  return_url: string; checkout_url: string; status: 'active' | 'completed' | 'expired'; last_outcome: string | null; expires_at: string; delayed_event_id: string | null};
type Envelope = {version: string; isolation_id: string; event: PaymentEvent; signature: string};
const VERSION = 'local-test-payment-v1';
function canonical(id: string, event: PaymentEvent) {
  return JSON.stringify([VERSION,id,event.provider,event.environment,event.event_id,event.event_code,event.kind,event.success,
    event.reference,event.transaction_reference,event.original_reference,event.amount_ore,event.currency,event.occurred_at]);
}
export function signTestEvent(event: PaymentEvent, settings: IsolationSettings): Envelope {
  return {version: VERSION,isolation_id: settings.id,event,
    signature: createHmac('sha256',settings.secret).update(canonical(settings.id,event)).digest('hex')};
}
export function verifyTestEvent(payload: unknown, settings: IsolationSettings): PaymentEvent {
  const item = payload as Envelope;
  if (!item || item.version !== VERSION || item.isolation_id !== settings.id || !item.event
    || !/^[a-f\d]{64}$/.test(item.signature || '')) throw new Error('Ogiltig signerad testhändelse.');
  const event = item.event, expected = Buffer.from(signTestEvent(event,settings).signature,'hex'), actual = Buffer.from(item.signature,'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual,expected) || event.provider !== 'local_test' || event.environment !== 'test'
    || !['AUTHORISATION','REFUND'].includes(event.event_code) || !Number.isSafeInteger(event.amount_ore) || event.amount_ore<=0 || event.currency !== 'SEK'
    || !/^[a-f\d]{64}$/.test(event.event_id)) throw new Error('Ogiltig signerad testhändelse.');
  return event;
}
/** This class is absent from every normal production build. It never imports or calls Adyen. */
export class TestPaymentProvider implements PaymentProvider {
  readonly name = 'local_test'; readonly environment = 'test' as const;
  private db: SupabaseClient;
  private validate: () => Promise<void>;
  private settings: IsolationSettings;
  private dispatch: (payload: Envelope) => Promise<void>;
  constructor(db: SupabaseClient, validate: () => Promise<void>, settings: IsolationSettings, dispatch: (payload: Envelope) => Promise<void>) {
    this.db=db;this.validate=validate;this.settings=settings;this.dispatch=dispatch;
  }
  async availableMethods(): Promise<OnlinePaymentMethod[]> { await this.validate(); return ['swish','card','apple_pay','google_pay']; }
  private async session(id: string): Promise<Session> {
    await this.validate();
    if (!/^lt_[a-f\d]{64}$/.test(id)) throw new Error('Ogiltig testbetalningslänk.');
    const {data,error} = await this.db.from('test_payment_sessions').select('*').eq('id',id).single();
    if (error || !data) throw new Error('Testbetalningen hittades inte.');
    return data as Session;
  }
  private hosted(session: Session): HostedPayment {
    return {environment:'test',id:session.id,url:session.checkout_url,amount_ore:session.amount_ore,currency:session.currency,
      reference:session.reference,merchant_account:this.settings.id,expires_at:session.expires_at,status:session.status};
  }
  async createPayment(attempt: PaymentAttempt, returnUrl: string) {
    await this.validate();
    if (attempt.provider!==this.name || attempt.environment!=='test') throw new Error('Fel testbetalningsmiljö.');
    const url=new URL(returnUrl);
    if (url.origin!==this.settings.checkoutOrigin) throw new Error('Fel lokal returadress.');
    const id='lt_'+createHmac('sha256',this.settings.secret).update(`${this.settings.id}:${attempt.id}`).digest('hex');
    const row={id,attempt_id:attempt.id,reference:attempt.provider_reference,amount_ore:attempt.amount_ore,currency:'SEK',method:attempt.method,
      return_url:url.href,checkout_url:`${this.settings.checkoutOrigin}/__test/payment/${id}`,
      expires_at:new Date(Date.parse(attempt.created_at)+86400000).toISOString()};
    const {error}=await this.db.from('test_payment_sessions').upsert(row,{onConflict:'attempt_id',ignoreDuplicates:true});
    if (error) throw new Error('Testbetalningen kunde inte reserveras.');
    return this.hosted(await this.session(id));
  }
  async getPayment(id: string) {
    const session=await this.session(id);
    // An explicitly simulated expiry has a verified terminal failure and cannot have an in-flight charge.
    // Reopen the SAME local capability for a safe test retry, unlike ambiguous real provider expiry.
    if (session.status==='expired') {
      const {error}=await this.db.from('test_payment_sessions').update({status:'active',expires_at:new Date(Date.now()+86400000).toISOString()}).eq('id',id).eq('status','expired');
      if (error) throw new Error('Testbetalningen kunde inte förnyas.');
      return this.hosted(await this.session(id));
    }
    return this.hosted(session);
  }
  verifyEvents(payload: unknown) { return [verifyTestEvent(payload,this.settings)]; }
  async inspectSession(id: string) {
    const session=await this.session(id);
    if (!session.delayed_event_id) return {...session,delayed_delivered:false};
    const {data,error}=await this.db.from('test_payment_deliveries').select('delivered_at').eq('event_id',session.delayed_event_id).single();
    if (error || !data) throw new Error('Den sparade testhändelsen kunde inte läsas.');
    return {...session,delayed_delivered:Boolean(data.delivered_at)};
  }
  private event(session: Session, action: string, refund?: RefundAttempt): PaymentEvent {
    const success=action==='success' || action==='refund';
    // Each failure click is a new outcome on the reusable checkout. Its saved envelope remains replayable.
    // Financial outcomes keep their original identity so success/refund retries cannot create a second event.
    const eventId=success?createHash('sha256').update(`${this.settings.id}:${session.id}:${action}:${refund?.id||''}`).digest('hex'):randomBytes(32).toString('hex');
    return {provider:this.name,environment:'test',event_id:eventId,
      event_code:refund?'REFUND':'AUTHORISATION',kind:refund?'refunded':success?'paid':'failed',success,
      reference:refund?.provider_reference||session.reference,transaction_reference:refund?'refund_'+refund.id:'pay_'+session.id,
      original_reference:refund?.transaction_reference||null,amount_ore:session.amount_ore,currency:'SEK',
      // Stable timestamp also preserves success/refund signatures across process restarts.
      occurred_at:new Date(0).toISOString()};
  }
  private async deliver(session: Session, action: string, refund?: RefundAttempt) {
    const payload=signTestEvent(this.event(session,action==='delay'?'success':action,refund),this.settings);
    const {data,error}=await this.db.rpc('test_prepare_payment_delivery',{p_session_id:session.id,p_action:action,p_event_id:payload.event.event_id,p_payload:payload});
    if (error || !data) throw new Error('Testbetalningens utfall kunde inte sparas.');
    if (action==='delay') return; // Durable provider outcome, deliberately withheld webhook.
    await this.dispatch(data as Envelope);
    const {error:markError}=await this.db.from('test_payment_deliveries').update({delivered_at:new Date().toISOString()}).eq('event_id',payload.event.event_id);
    if (markError) throw new Error('Testhändelsen är sparad. Försök igen för att bekräfta leveransen.');
  }
  async simulate(id: string, action: SimulationAction) {
    const session=await this.session(id);
    if (!['success','decline','cancel','expire','duplicate','delay','deliver_delayed'].includes(action)) throw new Error('Ogiltigt testval.');
    if (action==='deliver_delayed') {
      if (!session.delayed_event_id) throw new Error('Spara först en fördröjd testhändelse.');
      const {data,error}=await this.db.from('test_payment_deliveries').select('*').eq('event_id',session.delayed_event_id).eq('session_id',session.id).single();
      if (error || !data) throw new Error('Den sparade testhändelsen saknas.');
      await this.dispatch(data.payload as Envelope);
      const {error:markError}=await this.db.from('test_payment_deliveries').update({delivered_at:new Date().toISOString()}).eq('event_id',session.delayed_event_id);
      if (markError) throw new Error('Testhändelsen är sparad. Leveransen kan upprepas.');
      return this.session(id);
    }
    if (action==='duplicate' && session.status!=='completed') throw new Error('Simulera först en lyckad betalning.');
    await this.deliver(session,action==='duplicate'?'success':action);
    return this.session(id);
  }
  async refund(refund: RefundAttempt) {
    await this.validate();
    if (refund.provider!==this.name || refund.environment!=='test') throw new Error('Fel teståterbetalningsmiljö.');
    const {data,error}=await this.db.from('test_payment_sessions').select('id').eq('attempt_id',refund.attempt_id).single();
    if (error || !data) throw new Error('Testbetalningen hittades inte.');
    await this.deliver(await this.session(data.id),'refund',refund);
    return {id:'refund_'+refund.id,status:'pending' as const};
  }
}
