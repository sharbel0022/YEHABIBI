import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {testEnvironmentSettings,assertTestIsolation} from '../test-support/payments/guard.ts';
import {TestPaymentProvider,signTestEvent,verifyTestEvent} from '../test-support/payments/provider.ts';
import {startPayment,refundPayment} from '../apps/web/src/lib/payments/service.ts';

const env={APP_ENV:'test',NODE_ENV:'development',PAYMENTS_ENABLED:'false',PAYMENTS_LIVE_APPROVED:'false',TEST_ISOLATION_ID:randomUUID(),TEST_PAYMENT_SECRET:'ef'.repeat(32),
  TEST_BACKEND_ORIGIN:'http://127.0.0.1:43210',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:43210',NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:43211'};
const marker={isolation_id:env.TEST_ISOLATION_ID,secret_hash:createHash('sha256').update(env.TEST_PAYMENT_SECRET).digest('hex')};

test('test payment isolation requires all static guards plus matching private DB attestation',async()=>{
  assert.equal(testEnvironmentSettings(env).checkoutOrigin,env.NEXT_PUBLIC_SITE_URL);
  await assertTestIsolation(async()=>marker,env);
  let reads=0;
  for(const patch of [{APP_ENV:'production'},{APP_ENV:undefined},{NODE_ENV:'production'},{NODE_ENV:undefined},{PAYMENTS_ENABLED:'true'},
    {PAYMENTS_LIVE_APPROVED:'true'},{ADYEN_API_KEY:'unexpected-real-key'},{ADYEN_MERCHANT_ACCOUNT:'unexpected-real-account'},
    {TEST_PAYMENT_SECRET:'short'},{TEST_ISOLATION_ID:'invalid'},{TEST_BACKEND_ORIGIN:'https://project.supabase.co'},
    {NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co'},{NEXT_PUBLIC_SITE_URL:'https://customer-production.example'},
    {TEST_BACKEND_ORIGIN:'http://127.0.0.1:43210@evil.example'}]) {
    await assert.rejects(assertTestIsolation(async()=>{reads++;return marker;},{...env,...patch}));
  }
  assert.equal(reads,0);
  await assert.rejects(assertTestIsolation(async()=>null,env),/isoleringsmarkör/);
  await assert.rejects(assertTestIsolation(async()=>({...marker,isolation_id:randomUUID()}),env),/isoleringsmarkör/);
  await assert.rejects(assertTestIsolation(async()=>({...marker,secret_hash:'00'.repeat(32)}),env),/isoleringsmarkör/);
  const source=readFileSync(new URL('../apps/web/src/lib/payments/runtime.ts',import.meta.url),'utf8');
  assert.match(source,/new AdyenProvider/);
  for(const forbidden of ['TestPaymentProvider','local_test','TEST_PAYMENT_SECRET','TEST_PAYMENTS_ENABLED','test-support']) assert.equal(source.includes(forbidden),false);
});

test('local callbacks require server HMAC, exact isolation identity and provider/environment',()=>{
  const settings=testEnvironmentSettings(env),event={provider:'local_test',environment:'test',event_id:'a'.repeat(64),event_code:'AUTHORISATION',kind:'paid',success:true,
    reference:'reserved-order-reference',transaction_reference:'payment-reference',original_reference:null,amount_ore:48000,currency:'SEK',occurred_at:new Date(0).toISOString()};
  const signed=signTestEvent(event,settings);
  assert.deepEqual(verifyTestEvent(JSON.parse(JSON.stringify(signed)),settings),event);
  for(const patch of [{signature:'0'.repeat(64)},{isolation_id:randomUUID()},{event:{...event,amount_ore:1}},{event:{...event,provider:'adyen'}},{event:{...event,environment:'live'}}]) assert.throws(()=>verifyTestEvent({...signed,...patch},settings),/testhändelse/);
  const reordered={...signed,event:Object.fromEntries(Object.entries(event).reverse())};
  assert.deepEqual(verifyTestEvent(reordered,settings),event,'JSONB key order cannot invalidate a persisted retry.');
});

/** Small SQL-backed PostgREST client double; it executes the actual migrations and RPCs. */
function sqlClient(db) {
  return {
    rpc:async(name,args)=>{
      try {
        const entries=Object.entries(args),values=entries.map(([,value])=>value&&typeof value==='object'?JSON.stringify(value):value);
        const params=entries.map(([key,value],i)=>`${key}=>$${i+1}${value&&typeof value==='object'?'::jsonb':''}`).join(',');
        const row=(await db.query(`select public.${name}(${params}) as value`,values)).rows[0];return {data:row.value,error:null};
      } catch(error) {return {data:null,error};}
    },
    from(table) {
      let verb='select',columns='*',changes,conflict,filters=[];
      const builder={
        select(value='*'){columns=value;return builder;},eq(key,value){filters.push([key,value]);return builder;},
        upsert(value,options){verb='insert';changes=value;conflict=options.onConflict;return builder;},
        update(value){verb='update';changes=value;return builder;},
        async single(){const result=await execute();return result.error?result:{data:result.data[0]||null,error:result.data.length?null:Error('No row')};},
        then(resolve,reject){return execute().then(resolve,reject);}
      };
      async function execute() {
        try {
          const values=[],where=filters.length?' where '+filters.map(([key,value])=>{values.push(value);return `${key}=$${values.length}`;}).join(' and '):'';
          let sql;
          if(verb==='select') sql=`select ${columns} from public.${table}${where}`;
          else if(verb==='update') {
            const assignments=Object.entries(changes).map(([key,value])=>{values.push(value);return `${key}=$${values.length}`;});
            sql=`update public.${table} set ${assignments.join(',')}${where} returning *`;
          } else {
            const entries=Object.entries(changes);sql=`insert into public.${table}(${entries.map(([key])=>key).join(',')}) values(${entries.map(([,value])=>{values.push(value);return '$'+values.length;}).join(',')}) on conflict(${conflict}) do nothing returning *`;
          }
          return {data:JSON.parse(JSON.stringify((await db.query(sql,values)).rows)),error:null};
        } catch(error){return {data:null,error};}
      }
      return builder;
    }
  };
}

test('test adapter runs all four methods through real SQL, repeated failures, durable replays, refund and isolation failure',async()=>{
  const {PGlite}=await import('@electric-sql/pglite'),db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);alter table storage.objects enable row level security;`);
    const directory=new URL('../supabase/migrations/',import.meta.url);
    for(const file of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(file,directory),'utf8').replace('create extension if not exists pgcrypto;',''));
    await db.exec(readFileSync(new URL('../test-support/payments/schema.sql',import.meta.url),'utf8'));
    await db.query('insert into public.test_environment_guard(isolation_id,secret_hash) values($1,$2)',[marker.isolation_id,marker.secret_hash]);
    await db.exec('grant usage on schema public to service_role;grant all on all tables in schema public to service_role;set role service_role;');
    const client=sqlClient(db),settings=testEnvironmentSettings(env);
    const validate=()=>assertTestIsolation(async()=>(await db.query('select isolation_id,secret_hash from public.test_environment_guard')).rows[0],env).then(()=>{});
    const rpc=async(name,args)=>{const result=await client.rpc(name,args);if(result.error)throw result.error;return result.data;};
    let deliveries=0;const dispatched=[];
    const dispatch=async payload=>{for(const event of [verifyTestEvent(payload,settings)]){await rpc('apply_catering_payment_event',{p_event:event});deliveries++;}dispatched.push(structuredClone(payload));};
    const provider=new TestPaymentProvider(client,validate,settings,dispatch);
    assert.deepEqual(await provider.availableMethods(),['swish','card','apple_pay','google_pay']);
    const dish=randomUUID();await db.query("insert into public.dishes(id,title,price_ore,active) values($1,'TEST Ostrulle',4000,true)",[dish]);
    const create=method=>rpc('create_catering_order',{p_order:{id:randomUUID(),code:'CM-'+randomUUID().slice(0,10),tracking_hash:'a'.repeat(64),request_id:randomUUID(),request_hash:'b'.repeat(64),guests:5,occasion:'hemma',event_date:new Date(Date.now()+10*86400000).toISOString().slice(0,10),event_time:'12:00',fulfillment:'pickup',full_name:'Syntetisk Testkund',email:'customer@example.test',phone:'0700000000',payment_preference:method,subtotal_ore:48000,delivery_fee_ore:0},p_items:[{dish_id:dish,quantity:12}]});
    const store={reserve:(id,method,revision,amount)=>rpc('reserve_catering_payment',{p_order_id:id,p_provider:'local_test',p_method:method,p_revision:revision,p_amount_ore:amount,p_environment:'test'}),
      attach:async(attempt,payment)=>{await rpc('attach_catering_payment',{p_attempt_id:attempt.id,p_provider_payment_id:payment.id,p_checkout_url:payment.url,p_expires_at:payment.expires_at});},
      expire:async()=>assert.fail('Explicit local expiry has no ambiguous network operation.'),
      reserveRefund:id=>rpc('reserve_catering_refund',{p_order_id:id,p_environment:'test',p_provider:'local_test'}),
      attachRefund:async(attempt,id)=>{await rpc('attach_catering_refund',{p_refund_id:attempt.id,p_provider_refund_id:id});}};
    const first=await create('swish');await db.query("update public.orders set status='approved' where id=$1",[first.id]);
    assert.equal(await store.reserve(first.id,'swish',1,48000),null,'Normal migrations do not register the test adapter.');
    await db.query("insert into public.payment_provider_registry(provider,environment,checkout_base_url) values('local_test','test',$1)",[env.NEXT_PUBLIC_SITE_URL+'/__test/payment/']);
    for(const [index,method] of ['swish','apple_pay','google_pay','card'].entries()) {
      const order=index===0?first:await create(method);if(index)await db.query("update public.orders set status='approved' where id=$1",[order.id]);
      const input={orderId:order.id,method,revision:1,amount:48000,returnUrl:env.NEXT_PUBLIC_SITE_URL+'/order/private?token=synthetic'};
      const payment=await startPayment(store,provider,input);
      assert.match(payment.url,/^http:\/\/127\.0\.0\.1:43211\/__test\/payment\/lt_[a-f0-9]{64}$/);
      assert.equal((await startPayment(store,provider,input)).id,payment.id);
      const failedEvents=new Set();
      for(const outcome of ['decline','cancel','expire']) {
        for(let retry=0;retry<2;retry++) {
          await provider.simulate(payment.id,outcome);
          const envelope=dispatched.at(-1);
          assert.equal((await db.query('select payment_status from public.orders where id=$1',[order.id])).rows[0].payment_status,'failed',`${method}: ${outcome} ${retry+1} must record a new failure after reopening.`);
          assert.equal(failedEvents.has(envelope.event.event_id),false,'Each newly simulated failure has its own event identity.');
          failedEvents.add(envelope.event.event_id);
          const saved=(await db.query('select payload,delivered_at from public.test_payment_deliveries where event_id=$1',[envelope.event.event_id])).rows[0];
          assert.deepEqual(saved.payload,envelope,'A failure envelope is saved exactly as dispatched.');
          assert.ok(saved.delivered_at);
          assert.equal((await startPayment(store,provider,input)).id,payment.id);
          await dispatch(saved.payload);
          assert.equal((await db.query('select payment_status from public.orders where id=$1',[order.id])).rows[0].payment_status,'pending','Replaying the saved failure remains a duplicate after reopening.');
        }
      }
      assert.equal((await db.query("select count(*)::int as count from public.payment_provider_events where order_id=$1 and kind='failed'",[order.id])).rows[0].count,6);
      const restartedProvider=new TestPaymentProvider(client,validate,settings,dispatch);
      const beforeDelay=deliveries;
      await provider.simulate(payment.id,'delay');
      assert.equal(deliveries,beforeDelay,'Queued events must not update financial truth before verification.');
      assert.equal((await db.query('select payment_status from public.orders where id=$1',[order.id])).rows[0].payment_status,'pending');
      const queued=(await db.query('select d.payload,d.delivered_at from public.test_payment_deliveries d join public.test_payment_sessions s on s.delayed_event_id=d.event_id where s.id=$1',[payment.id])).rows[0];
      assert.equal(queued.delivered_at,null);
      await restartedProvider.simulate(payment.id,'deliver_delayed');const paidEnvelope=dispatched.at(-1);
      assert.deepEqual(paidEnvelope,queued.payload,'A restart delivers the exact saved signed event.');
      await restartedProvider.simulate(payment.id,'deliver_delayed');
      await restartedProvider.simulate(payment.id,'duplicate');
      assert.deepEqual(dispatched.at(-1),paidEnvelope,'Explicit duplicate delivery preserves the paid event and signature across provider instances.');
      const paid=(await db.query('select payment_status,total_ore,payment_provider from public.orders where id=$1',[order.id])).rows[0];
      assert.deepEqual(paid,{payment_status:'paid',total_ore:48000,payment_provider:'local_test'});
      assert.equal((await db.query("select count(*)::int as count from public.order_notifications where order_id=$1 and kind='paid'",[order.id])).rows[0].count,1);
      assert.equal((await db.query('select count(*)::int as count from public.payment_attempts where order_id=$1',[order.id])).rows[0].count,1);
      const refund=await store.reserveRefund(order.id);
      await refundPayment(store,provider,order.id);const refundEnvelope=dispatched.at(-1);
      assert.equal((await db.query('select payment_status from public.orders where id=$1',[order.id])).rows[0].payment_status,'refunded');
      await restartedProvider.refund(refund);
      assert.deepEqual(dispatched.at(-1),refundEnvelope,'A refund retry preserves its event and transaction identity.');
      assert.equal((await db.query("select count(*)::int as count from public.payment_provider_events where order_id=$1 and kind='paid'",[order.id])).rows[0].count,1);
      assert.equal((await db.query("select count(*)::int as count from public.payment_provider_events where order_id=$1 and kind='refunded'",[order.id])).rows[0].count,1);
      assert.equal((await refundPayment(store,provider,order.id)).status,'refunded');
    }
    assert.ok(deliveries>=24);
    await db.query("update public.test_environment_guard set secret_hash=$1",['00'.repeat(32)]);
    await assert.rejects(provider.availableMethods(),/isoleringsmarkör/);
    await assert.rejects(provider.simulate('lt_'+'a'.repeat(64),'success'),/isoleringsmarkör/);
    for(const role of ['anon','authenticated']) {
      await db.exec(`reset role;set role ${role}`);
      await assert.rejects(db.query('select * from public.test_environment_guard'),/permission denied/);
      await assert.rejects(db.query('select * from public.test_payment_sessions'),/permission denied/);
      await assert.rejects(db.query("select public.test_prepare_payment_delivery('unknown','success','event','{}'::jsonb)"),/permission denied/);
      await assert.rejects(db.query("insert into public.payment_provider_registry(provider,environment,checkout_base_url) values('rogue','test','https://evil.example/')"),/permission denied/);
    }
  } finally {await db.close();}
});
