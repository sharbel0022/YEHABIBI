import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac, randomUUID} from 'node:crypto';
import {AdyenProvider, adyenApiBaseUrl, adyenConfigured, adyenVerificationConfigured, standardHmacPayload, validStandardHmac} from '../apps/web/src/lib/payments/providers/adyen.ts';
import {startPayment, refundPayment, readProviderPayment} from '../apps/web/src/lib/payments/service.ts';

const env={PAYMENTS_ENABLED:'true',PAYMENT_PROVIDER:'adyen',ADYEN_ENVIRONMENT:'test',ADYEN_CAPTURE_MODE:'automatic',ADYEN_API_KEY:'fixture-api-key',ADYEN_MERCHANT_ACCOUNT:'FixtureMerchant',ADYEN_HMAC_KEY:'ab'.repeat(32),ADYEN_ENABLED_METHODS:'swish,card,apple_pay,google_pay'};
const attempt=()=>({id:randomUUID(),order_id:randomUUID(),provider:'adyen',environment:'test',method:'card',amount_ore:40000,currency:'SEK',quote_revision:2,provider_reference:randomUUID(),idempotency_key:randomUUID(),provider_payment_id:null,checkout_url:null,transaction_reference:null,expires_at:null,status:'creating',created_at:new Date().toISOString()});
const hosted=a=>({environment:a.environment,id:'PL_fixture',url:`https://${a.environment==='live'?'eu':'test'}.adyen.link/PL_fixture`,amount_ore:a.amount_ore,currency:'SEK',reference:a.provider_reference,merchant_account:'FixtureMerchant',expires_at:new Date(Date.now()+86400000).toISOString(),status:'active'});
const signed=(overrides={})=>{
  const item={pspReference:'AUTH_fixture',originalReference:'',merchantAccountCode:env.ADYEN_MERCHANT_ACCOUNT,merchantReference:'yh-reference',amount:{value:40000,currency:'SEK'},eventCode:'AUTHORISATION',success:'true',eventDate:'not-trusted',paymentMethod:'visa',...overrides};
  item.additionalData={hmacSignature:createHmac('sha256',Buffer.from(env.ADYEN_HMAC_KEY,'hex')).update(standardHmacPayload(item)).digest('base64')};
  return item;
};
const envelope=(...items)=>({live:'false',notificationItems:items.map(NotificationRequestItem=>({NotificationRequestItem}))});

test('payment gates default closed, live requires separate approval, callback verification survives issuance shutdown',()=>{
  assert.equal(adyenConfigured({}),false);
  assert.equal(adyenConfigured(env),true);
  for(const patch of [{ADYEN_ENVIRONMENT:'live'},{ADYEN_CAPTURE_MODE:'manual'},{PAYMENTS_ENABLED:'false'},{ADYEN_ENABLED_METHODS:''},{ADYEN_HMAC_KEY:'secret'}]) assert.equal(adyenConfigured({...env,...patch}),false);
  const disabled={...env,PAYMENTS_ENABLED:'false',ADYEN_API_KEY:undefined,ADYEN_ENABLED_METHODS:''};
  assert.equal(adyenVerificationConfigured(disabled),true);
  assert.equal(new AdyenProvider(disabled,fetch,'verification').verifyEvents(envelope(signed())).length,1);
  assert.throws(()=>new AdyenProvider(disabled));
});

test('production configuration requires explicit approval and a safe merchant prefix; missing gate makes zero network calls',async()=>{
  const live={...env,ADYEN_ENVIRONMENT:'live',ADYEN_LIVE_URL_PREFIX:'1797a841fbb37ca7-FixtureMerchant',PAYMENTS_LIVE_APPROVED:'true'};
  assert.equal(adyenConfigured(live),true);
  assert.equal(adyenApiBaseUrl(live),'https://1797a841fbb37ca7-FixtureMerchant-checkout-live.adyenpayments.com/checkout/v71');
  assert.equal(adyenApiBaseUrl(env),'https://checkout-test.adyen.com/v71');
  let networkCalls=0;
  const neverFetch=async()=>{networkCalls++;assert.fail('No external live request is permitted in this test.');};
  const invalid=[
    {PAYMENTS_LIVE_APPROVED:undefined},{PAYMENTS_LIVE_APPROVED:'false'},{PAYMENTS_LIVE_APPROVED:'TRUE'},
    {ADYEN_LIVE_URL_PREFIX:''},{ADYEN_LIVE_URL_PREFIX:'https://merchant.example'},{ADYEN_LIVE_URL_PREFIX:'prefix.example'},
    {ADYEN_LIVE_URL_PREFIX:'prefix/path'},{ADYEN_LIVE_URL_PREFIX:'prefix@host'},{ADYEN_LIVE_URL_PREFIX:'prefix:443'},
    {ADYEN_LIVE_URL_PREFIX:'prefix?query'},{ADYEN_LIVE_URL_PREFIX:' prefix'},{ADYEN_LIVE_URL_PREFIX:'prefix\n'},
    {ADYEN_LIVE_URL_PREFIX:'-prefix'},{ADYEN_LIVE_URL_PREFIX:'prefix-'},{ADYEN_LIVE_URL_PREFIX:'a'.repeat(50)},
    {ADYEN_CAPTURE_MODE:'manual'},{ADYEN_API_KEY:''},{ADYEN_HMAC_KEY:''},{ADYEN_MERCHANT_ACCOUNT:''},{ADYEN_ENABLED_METHODS:''}
  ];
  for(const patch of invalid) {
    assert.equal(adyenConfigured({...live,...patch}),false,JSON.stringify(patch));
    assert.throws(()=>new AdyenProvider({...live,...patch},neverFetch));
  }
  assert.equal(networkCalls,0);
  const disabled={...live,PAYMENTS_ENABLED:'false',ADYEN_API_KEY:undefined,ADYEN_ENABLED_METHODS:''};
  assert.equal(adyenConfigured(disabled),false);assert.equal(adyenVerificationConfigured(disabled),true);
  assert.equal(adyenVerificationConfigured({...disabled,PAYMENTS_LIVE_APPROVED:'false'}),false);
  const verifier=new AdyenProvider(disabled,neverFetch,'verification'), item=signed();
  assert.equal(verifier.verifyEvents({...envelope(item),live:'true'})[0].environment,'live');
  assert.throws(()=>verifier.verifyEvents(envelope(item)),/betalningsmiljö/);
  assert.throws(()=>new AdyenProvider(env,neverFetch).verifyEvents({...envelope(item),live:'true'}),/betalningsmiljö/);
  await assert.rejects(verifier.availableMethods(),/avstängda/);assert.equal(networkCalls,0);
});

test('status and refund service reject a different stored environment before any provider request',async()=>{
  const a={...attempt(),provider_payment_id:'PL_fixture'}, refund={...a,id:'refund-id',status:'pending',provider_refund_id:'REF_fixture'};
  let requests=0;
  const provider={name:'adyen',environment:'live',getPayment:async()=>{requests++;assert.fail('Cross-environment status network call.');},refund:async()=>{requests++;assert.fail('Cross-environment refund network call.');}};
  await assert.rejects(readProviderPayment(provider,a),/annan leverantörsmiljö/);
  await assert.rejects(refundPayment({reserveRefund:async()=>refund},provider,a.order_id),/annan leverantörsmiljö/);
  assert.equal(requests,0);
});

test('approved production adapter builds only official URLs in mocked network and rejects cross-environment attempts/hosts',async()=>{
  const live={...env,ADYEN_ENVIRONMENT:'live',ADYEN_LIVE_URL_PREFIX:'1797a841fbb37ca7-FixtureMerchant',PAYMENTS_LIVE_APPROVED:'true'};
  const a={...attempt(),environment:'live'}, calls=[];
  const response=()=>({id:'PL_fixture',url:'https://eu.adyen.link/PL_fixture',amount:{value:a.amount_ore,currency:'SEK'},reference:a.provider_reference,
    merchantAccount:live.ADYEN_MERCHANT_ACCOUNT,expiresAt:new Date(Date.now()+86400000).toISOString(),status:'active',manualCapture:false,captureDelayHours:0});
  let overriddenUrl=null;
  const mockedFetch=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/paymentMethods')) return Response.json({paymentMethods:[{type:'swish'}]});
    if(url.endsWith('/refunds')) return Response.json({pspReference:'REF_fixture',paymentPspReference:'AUTH_fixture',merchantAccount:live.ADYEN_MERCHANT_ACCOUNT,status:'received'});
    if(options.method==='POST') return Response.json({id:'PL_fixture'});
    return Response.json({...response(),...(overriddenUrl?{url:overriddenUrl}:{})});
  };
  const provider=new AdyenProvider(live,mockedFetch);
  assert.deepEqual(await provider.availableMethods(),['swish']);
  assert.equal((await provider.createPayment(a,'https://merchant.example/order')).url,'https://eu.adyen.link/PL_fixture');
  const before=calls.length;
  await assert.rejects(provider.createPayment({...a,environment:'test'},'https://merchant.example/order'),/annan leverantörsmiljö/);
  await assert.rejects(provider.refund({environment:'test'}),/annan leverantörsmiljö/);
  assert.equal(calls.length,before);
  assert.equal((await provider.refund({environment:'live',transaction_reference:'AUTH_fixture',amount_ore:a.amount_ore,provider_reference:'refund-reference',idempotency_key:'fixture-key'})).status,'pending');
  for(const url of ['https://test.adyen.link/PL_fixture','https://eu.adyen.link.evil.example/PL_fixture','https://us.adyen.link/PL_fixture',
    'https://evil.example/PL_fixture','https://eu.adyen.link:444/PL_fixture','https://user@eu.adyen.link/PL_fixture',
    'https://eu.adyen.link/wrong-id','https://eu.adyen.link/PL_fixture?redirect=evil','https://eu.adyen.link/PL_fixture#evil']) {
    overriddenUrl=url;await assert.rejects(provider.getPayment('PL_fixture'),/verifieras/);
  }
  assert.ok(calls.every(({url,options})=>url.startsWith('https://1797a841fbb37ca7-FixtureMerchant-checkout-live.adyenpayments.com/checkout/v71/')&&options.redirect==='error'));
  assert.equal(new AdyenProvider(env,async()=>Response.json({...response()})).environment,'test');
  await assert.rejects(new AdyenProvider(env,async()=>Response.json(response())).getPayment('PL_fixture'),/verifieras/);
});

test('Adyen official Standard HMAC vector, escaping, tampering and mixed batch validation',()=>{
  const key='44782DEF547AAA06C910C43932B1EB0C71FC68D9D0C057550C48EC2ACF6BA056';
  const vector={pspReference:'7914073381342284',merchantAccountCode:'TestMerchant',merchantReference:'TestPayment-1407325143704',amount:{value:1130,currency:'EUR'},eventCode:'AUTHORISATION',success:'true',additionalData:{hmacSignature:'coqCmt/IZ4E3CzPvMY8zTjQVL5hYJUiBRg8UU+iCWo0='}};
  assert.equal(validStandardHmac(vector,key),true);
  assert.equal(validStandardHmac({...vector,amount:{value:1131,currency:'EUR'}},key),false);
  assert.match(standardHmacPayload({...vector,merchantReference:'order:with\\slash'}),/order\\:with\\\\slash/);
  const provider=new AdyenProvider(env), item=signed();
  const events=provider.verifyEvents(envelope(item));
  assert.equal(events[0].kind,'paid'); assert.equal(events[0].amount_ore,40000);
  assert.equal(provider.verifyEvents(envelope({...item,eventDate:'changed',additionalData:{...item.additionalData,paymentLinkId:'forged-unsigned'}}))[0].event_id,events[0].event_id);
  assert.throws(()=>provider.verifyEvents(envelope(item,{...signed(),merchantAccountCode:'OtherMerchant'})),/signatur|konto/);
  assert.throws(()=>provider.verifyEvents({...envelope(item),live:'true'}),/betalningsmiljö/);
  assert.throws(()=>provider.verifyEvents(envelope({...signed(),success:true})),/signatur/);
  assert.equal(provider.verifyEvents(envelope(signed({eventCode:'REFUND',success:'false'})))[0].kind,'review');
  assert.equal(provider.verifyEvents(envelope(signed({eventCode:'CAPTURE',success:'false'})))[0].kind,'review');
  for(const eventCode of ['REFUND_FAILED','REFUNDED_REVERSED','CAPTURE_FAILED','CHARGEBACK','SETTLED_REVERSED']) assert.equal(provider.verifyEvents(envelope(signed({eventCode})))[0].kind,'review');
});

test('only discovered and explicitly enabled methods; authenticated hosted link restricts card brands',async()=>{
  const calls=[], a=attempt();
  const fetcher=async(url,options)=>{
    const body=options.body ? JSON.parse(options.body) : null;
    calls.push({url,options,body});
    if(url.endsWith('/paymentMethods')) return Response.json({paymentMethods:[{type:'scheme',brands:['visa','mc','amex']},{type:'swish'},{type:'klarna'}]});
    if(options.method==='POST') return Response.json({id:'PL_fixture'}); // POST schema intentionally has no status.
    return Response.json({id:'PL_fixture',url:'https://test.adyen.link/PL_fixture',amount:{value:a.amount_ore,currency:'SEK'},reference:a.provider_reference,merchantAccount:env.ADYEN_MERCHANT_ACCOUNT,expiresAt:new Date(Date.now()+86400000).toISOString(),status:'active',manualCapture:false,captureDelayHours:0});
  };
  const provider=new AdyenProvider(env,fetcher);
  assert.deepEqual(await provider.availableMethods(a.amount_ore),['swish','card']);
  const payment=await provider.createPayment(a,'https://example.test/order?token=opaque');
  assert.equal(payment.status,'active');
  const create=calls.find(call=>call.url.endsWith('/paymentLinks'));
  assert.deepEqual(create.body.allowedPaymentMethods,['visa','mc']);
  assert.equal(create.body.reusable,false);assert.equal(create.body.manualCapture,false);assert.equal(create.body.captureDelayHours,0);
  assert.equal(create.body.amount.value,a.amount_ore);assert.equal(create.body.amount.currency,'SEK');
  assert.equal(create.options.headers['idempotency-key'],a.idempotency_key);
  assert.ok(calls.every(call=>call.url.startsWith('https://checkout-test.adyen.com/v71/')));
  assert.equal(calls.at(-1).options.method,'GET');
  await assert.rejects(provider.createPayment(a,'http://example.test/order'),/HTTPS/);
  const bad=new AdyenProvider(env,async()=>Response.json({id:'PL_fixture',url:'https://evil.example/pay',amount:{value:1,currency:'SEK'}}));
  await assert.rejects(bad.getPayment('PL_fixture'),/verifieras/);
});

test('durable reservation is reused after concurrent retry and after provider/DB process crash',async()=>{
  const a=attempt(), keys=[], requests=[], log=[];
  let stored=null, failAttach=true;
  const store={reserve:async()=>{log.push('reserve');return {...a,provider_payment_id:stored};},attach:async(_,payment)=>{log.push('attach');if(failAttach){failAttach=false;throw Error('simulated crash');}stored=payment.id;},expire:async()=>assert.fail('not expired')};
  const provider={name:'adyen',environment:'test',availableMethods:async()=>['card'],createPayment:async(reserved)=>{log.push('provider');keys.push(reserved.idempotency_key);requests.push(reserved.provider_reference);return hosted(a);},getPayment:async()=>hosted(a)};
  const input={orderId:a.order_id,method:'card',revision:2,amount:a.amount_ore,returnUrl:'https://example.test/order'};
  await assert.rejects(startPayment(store,provider,input),/crash/);
  assert.equal((await startPayment(store,provider,input)).id,'PL_fixture');
  assert.deepEqual(keys,[a.idempotency_key,a.idempotency_key]);assert.deepEqual(requests,[a.provider_reference,a.provider_reference]);
  assert.deepEqual(log.slice(0,3),['reserve','provider','attach']);
  await Promise.all([startPayment(store,provider,input),startPayment(store,provider,input)]);
  assert.equal(keys.length,2); // Already attached link is read, never recreated.
});

test('wrong amounts/revisions, completed links and expired/ambiguous attempts never claim success or create another charge',async()=>{
  const a=attempt();let attaches=0,expires=0,creates=0;
  const store={reserve:async()=>a,attach:async()=>attaches++,expire:async()=>expires++};
  let value=hosted(a);
  const provider={name:'adyen',environment:'test',availableMethods:async()=>['card'],createPayment:async()=>{creates++;return value;},getPayment:async()=>value};
  const input={orderId:a.order_id,method:'card',revision:2,amount:a.amount_ore,returnUrl:'https://example.test'};
  for(const patch of [{amount_ore:a.amount_ore+1},{currency:'EUR'},{reference:'other-revision'}]) {
    value={...hosted(a),...patch};await assert.rejects(startPayment(store,provider,input),/matchar/);
  }
  for(const status of ['completed','paid','paymentPending']) {value={...hosted(a),status};await assert.rejects(startPayment(store,provider,input),/behandlas/);}
  value={...hosted(a),status:'expired'};await assert.rejects(startPayment(store,provider,input),/gått ut/);
  assert.equal(expires,1);assert.equal(attaches,0);
  const before=creates;a.created_at=new Date(Date.now()-6*86400000).toISOString();
  await assert.rejects(startPayment(store,provider,input),/stämmas av/);assert.equal(creates,before);
});

test('refund request remains pending, exact persisted key survives crash, confirmation comes from webhook',async()=>{
  const r={id:randomUUID(),order_id:randomUUID(),attempt_id:randomUUID(),provider:'adyen',environment:'test',amount_ore:40000,currency:'SEK',provider_reference:'refund-reference',idempotency_key:randomUUID(),transaction_reference:'AUTH_fixture',provider_refund_id:null,status:'creating',created_at:new Date().toISOString()};
  const keys=[];let crash=true;
  const store={reserveRefund:async()=>r,attachRefund:async(_,id)=>{if(crash){crash=false;throw Error('crash');}r.provider_refund_id=id;r.status='pending';}};
  const provider={name:'adyen',environment:'test',refund:async attempt=>{keys.push(attempt.idempotency_key);return {id:'REF_fixture',status:'pending'};}};
  await assert.rejects(refundPayment(store,provider,r.order_id),/crash/);
  assert.equal((await refundPayment(store,provider,r.order_id)).status,'pending');
  assert.equal((await refundPayment(store,provider,r.order_id)).status,'pending');
  assert.deepEqual(keys,[r.idempotency_key,r.idempotency_key]);
  r.status='confirmed';assert.equal((await refundPayment(store,provider,r.order_id)).status,'refunded');
  r.status='needs_review';await assert.rejects(refundPayment(store,provider,r.order_id),/kontrolleras/);
});
