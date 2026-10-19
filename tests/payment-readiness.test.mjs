import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac, randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {AdyenProvider, adyenConfigured, standardHmacPayload} from '../apps/web/src/lib/payments/providers/adyen.ts';
import {InvalidPaymentEventError} from '../apps/web/src/lib/payments/provider.ts';
import {persistVerifiedPaymentEvents, paymentWebhookResponse} from '../apps/web/src/lib/payments/inbox.ts';
import {reconcileExistingPayment} from '../apps/web/src/lib/payments/service.ts';
import {createApiClient} from '../packages/api-client/index.ts';

const env={PAYMENTS_ENABLED:'false',PAYMENT_PROVIDER:'adyen',ADYEN_ENVIRONMENT:'test',ADYEN_CAPTURE_MODE:'automatic',ADYEN_API_KEY:'fixture-api-key',ADYEN_MERCHANT_ACCOUNT:'FixtureMerchant',ADYEN_HMAC_KEY:'ab'.repeat(32)};
const now=Date.parse('2026-10-19T10:00:00Z');
const attempt=()=>({id:randomUUID(),order_id:randomUUID(),provider:'adyen',environment:'test',merchant_account:env.ADYEN_MERCHANT_ACCOUNT,integration_type:'adyen_pay_by_link',method:'card',amount_ore:40000,currency:'SEK',quote_revision:2,provider_reference:'saved-reference',idempotency_key:randomUUID(),provider_payment_id:'PL_fixture',checkout_url:null,transaction_reference:null,expires_at:null,status:'pending',created_at:new Date(now-3600000).toISOString()});
const metadata=(a,status='active')=>({environment:a.environment,id:a.provider_payment_id,url:'https://test.adyen.link/PL_fixture',amount_ore:a.amount_ore,currency:a.currency,reference:a.provider_reference,merchant_account:a.merchant_account,expires_at:new Date(now+3600000).toISOString(),status});
const signed=(patch={})=>{
  const item={pspReference:'AUTH_fixture',merchantAccountCode:env.ADYEN_MERCHANT_ACCOUNT,merchantReference:'saved-reference',amount:{value:40000,currency:'SEK'},eventCode:'AUTHORISATION',success:'true',...patch};
  item.additionalData={hmacSignature:createHmac('sha256',Buffer.from(env.ADYEN_HMAC_KEY,'hex')).update(standardHmacPayload(item)).digest('base64')};
  return {live:'false',notificationItems:[{NotificationRequestItem:item}]};
};
const request=payload=>new Request('https://merchant.example/api/payments/webhook',{method:'POST',body:JSON.stringify(payload)});

test('D: webhook ACK follows durable inbox and does not await a slow notification worker',async()=>{
  const provider=new AdyenProvider(env,fetch,'verification'),inbox=[];
  let releaseMail,mailCompleted=false;
  const slowMail=new Promise(resolve=>{releaseMail=resolve;}).then(()=>{mailCompleted=true;});
  const receive=payload=>persistVerifiedPaymentEvents(provider,payload,async events=>{inbox.push(...events);return events.length;});
  const response=await Promise.race([paymentWebhookResponse(request(signed()),true,receive),delay(1000).then(()=>{throw Error('ACK waited on delivery');})]);
  assert.equal(response.status,200);assert.equal(await response.text(),'[accepted]');
  assert.equal(inbox.length,1);assert.equal(mailCompleted,false);
  releaseMail();await slowMail;
});

test('E: invalid HMAC, environment and merchant reject before inbox; failed durable storage never ACKs',async()=>{
  const provider=new AdyenProvider(env,fetch,'verification');let writes=0;
  const receive=payload=>persistVerifiedPaymentEvents(provider,payload,async events=>{writes++;return events.length;});
  const forged=signed();forged.notificationItems[0].NotificationRequestItem.amount.value=1;
  for(const payload of [forged,{...signed(),live:'true'},signed({merchantAccountCode:'AnotherMerchant'}),signed({eventCode:'UNSUPPORTED_EVENT'})]) {
    assert.equal((await paymentWebhookResponse(request(payload),true,receive)).status,400);
  }
  assert.equal(writes,0);
  const rejectAmount=payload=>persistVerifiedPaymentEvents(provider,payload,async()=>{throw new InvalidPaymentEventError('Stored amount mismatch');});
  assert.equal((await paymentWebhookResponse(request(signed({amount:{value:1,currency:'SEK'}})),true,rejectAmount)).status,400);
  const unavailable=payload=>persistVerifiedPaymentEvents(provider,payload,async()=>{throw Error('Database unavailable');});
  assert.equal((await paymentWebhookResponse(request(signed()),true,unavailable)).status,500);
  assert.equal((await paymentWebhookResponse(request(signed()),false,receive)).status,503);
});

test('webhook limits the streamed payload even when content-length is absent or false',async()=>{
  let reads=0;const receive=async()=>{reads++;return 1;};
  assert.equal((await paymentWebhookResponse(new Request('https://merchant.example',{method:'POST',body:'x'.repeat(65537)}),true,receive)).status,413);
  assert.equal((await paymentWebhookResponse(new Request('https://merchant.example',{method:'POST',headers:{'content-length':'1'},body:'x'.repeat(65537)}),true,receive)).status,413);
  assert.equal((await paymentWebhookResponse(new Request('https://merchant.example',{method:'POST',body:'{'}),true,receive)).status,400);
  assert.equal(reads,0);
});

test('F: missing webhook schedules read-only reconciliation; expired/completed metadata and timeouts never prove unpaid',async()=>{
  const a=attempt(),original=structuredClone(a);let calls=0,status='active',fail=false;
  const provider={name:'adyen',environment:'test',merchantAccount:env.ADYEN_MERCHANT_ACCOUNT,getPayment:async()=>{calls++;if(fail)throw Error('404 or timeout');return metadata(a,status);},createPayment:async()=>assert.fail('Reconciliation must never debit')};
  const pending=await reconcileExistingPayment(provider,a,now);
  assert.equal(pending.manual_review_required,false);assert.equal(pending.next_check_at,new Date(now+300000).toISOString());
  for(status of ['expired','completed','paid']) {
    const result=await reconcileExistingPayment(provider,a,now);assert.equal(result.manual_review_required,true);assert.equal(result.next_check_at,null);
  }
  fail=true;assert.equal((await reconcileExistingPayment(provider,a,now)).reason,'provider_lookup_unresolved');
  assert.equal((await reconcileExistingPayment(provider,a,now+2*86400000)).manual_review_required,true);
  assert.equal(calls,6);assert.deepEqual(a,original);
});

test('G: immutable Hosted Checkout sessionResult is never used as a reconciliation poller',async()=>{
  let polls=0;const provider={name:'adyen',environment:'test',merchantAccount:env.ADYEN_MERCHANT_ACCOUNT,getPayment:async()=>{polls++;return {status:'completed'};}};
  const a={...attempt(),integration_type:'adyen_hosted_checkout'};
  for(let retry=0;retry<3;retry++) assert.equal((await reconcileExistingPayment(provider,a,now+retry*300000)).reason,'session_result_not_reconciliation');
  assert.equal(polls,0);
});

test('I: issuance disable/revoked live approval preserves old authenticated reads; wrong or missing stored identity fails closed',async()=>{
  const a={...attempt(),environment:'live'};let requests=0;
  const retained={...env,ADYEN_ENVIRONMENT:'live',ADYEN_LIVE_URL_PREFIX:'fixture',PAYMENTS_LIVE_APPROVED:'false'};
  const provider=new AdyenProvider(retained,async(url,options)=>{
    requests++;assert.equal(options.method,'GET');assert.equal(url,'https://fixture-checkout-live.adyenpayments.com/checkout/v71/paymentLinks/PL_fixture');
    return Response.json({id:a.provider_payment_id,url:'https://eu.adyen.link/PL_fixture',amount:{value:a.amount_ore,currency:a.currency},reference:a.provider_reference,merchantAccount:a.merchant_account,expiresAt:new Date(now+3600000).toISOString(),status:'active'});
  },'verification');
  assert.equal(adyenConfigured(retained),false);assert.throws(()=>new AdyenProvider(retained));
  assert.equal((await reconcileExistingPayment(provider,a,now)).manual_review_required,false);assert.equal(requests,1);
  for(const patch of [{environment:'test'},{merchant_account:'other'},{merchant_account:null}]) {
    assert.equal((await reconcileExistingPayment(provider,{...a,...patch},now)).reason,'verification_identity_unavailable');
  }
  assert.equal(requests,1);
});

test('reconciliation respects a bounded provider Retry-After without renewing or releasing the attempt',async()=>{
  const a=attempt(),provider={name:'adyen',environment:'test',merchantAccount:env.ADYEN_MERCHANT_ACCOUNT,getPayment:async()=>{throw Object.assign(Error('429'),{retryAfterMs:900000});}};
  assert.equal((await reconcileExistingPayment(provider,a,now)).next_check_at,new Date(now+900000).toISOString());
  assert.equal(a.status,'pending');
});

test('clients keep direct payment approval separate and reject malformed or prohibited direct methods',async()=>{
  const catalog={menus:[],dishes:[],campaigns:[],delivery_zones:[],settings:{},payment_methods:['card','cash'],direct_payment_methods:['cash'],orders_enabled:true,direct_orders_enabled:true,demo:false};
  const accepted=await createApiClient({fetch:async()=>Response.json(catalog)}).getCatalog();
  assert.deepEqual(accepted.payment_methods,['card','cash']);assert.deepEqual(accepted.direct_payment_methods,['cash']);
  for(const direct_payment_methods of ['card',null,['unpaid'],['klarna'],[1]]) {
    await assert.rejects(createApiClient({fetch:async()=>Response.json({...catalog,direct_payment_methods})}).getCatalog(),error=>error.kind==='response');
  }
});
