import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';

test('V4.3 payment SQL: reservations, exact references, corrections, refunds, cash and private permissions',async t=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);alter table storage.objects enable row level security;`);
    const directory=new URL('../supabase/migrations/',import.meta.url);
    for(const file of readdirSync(directory).filter(file=>file.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(file,directory),'utf8').replace('create extension if not exists pgcrypto;',''));
    const adminId=randomUUID();await db.query('insert into auth.users values($1)',[adminId]);
    await db.exec('grant usage on schema public to service_role;grant all on all tables in schema public to service_role;set role service_role;');
    const dishId=randomUUID();await db.query("insert into public.dishes(id,title,price_ore,active) values($1,'Riktig rätt',2500,true)",[dishId]);
    const one=async(sql,args)=>(await db.query(sql,args)).rows[0].saved;
    const order=async(preference='card')=>one('select public.create_catering_order($1::jsonb,$2::jsonb) as saved',[
      JSON.stringify({id:randomUUID(),code:'CM-'+randomUUID().slice(0,10),tracking_hash:'a'.repeat(64),request_id:randomUUID(),request_hash:'b'.repeat(64),guests:5,occasion:'hemma',event_date:new Date(Date.now()+10*86400000).toISOString().slice(0,10),event_time:'12:00',fulfillment:'pickup',full_name:'Test Kund',email:'test@example.se',phone:'0701234567',notes:'',payment_preference:preference,subtotal_ore:5000,delivery_fee_ore:0}),
      JSON.stringify([{dish_id:dishId,quantity:2}])]);
    const reserve=(o,method='card',revision=1,amount=5000)=>one('select public.reserve_catering_payment($1,$2,$3,$4,$5) as saved',[o.id,'adyen',method,revision,amount]);
    const attach=(a,id='PL_'+a.id.replaceAll('-',''))=>one('select public.attach_catering_payment($1,$2,$3,$4) as saved',[a.id,id,'https://test.adyen.link/'+id,new Date(Date.now()+86400000).toISOString()]);
    const read=id=>one('select to_jsonb(o) as saved from public.orders o where id=$1',[id]);
    let serial=0;
    const event=(a,overrides={})=>({provider:'adyen',event_id:createHash('sha256').update(String(++serial)).digest('hex'),event_code:'AUTHORISATION',kind:'paid',success:true,reference:a.provider_reference,transaction_reference:'AUTH_'+a.id,original_reference:null,amount_ore:a.amount_ore,currency:'SEK',...overrides});
    const apply=e=>one('select public.apply_catering_payment_event($1::jsonb) as saved',[JSON.stringify(e)]);
    const approve=o=>db.query("update public.orders set status='approved' where id=$1",[o.id]);
    let o,a;
    await t.test('price proposal preserves legacy provider references and original priced lines',async()=>{
      const historic=await order();
      await db.query("update public.orders set stripe_checkout_session_id='cs_historical',stripe_payment_intent_id='pi_historical' where id=$1",[historic.id]);
      const proposal=await one('select public.propose_catering_change($1,$2,$3,$4) as saved',[historic.id,1,6500,'Ändrat gästantal enligt kunden']);
      assert.equal(proposal.stripe_checkout_session_id,'cs_historical');assert.equal(proposal.stripe_payment_intent_id,'pi_historical');
      assert.equal(proposal.total_ore,5000);assert.equal(proposal.proposal.total_ore,6500);
      assert.equal((await db.query('select total_ore from public.order_items where order_id=$1',[historic.id])).rows[0].total_ore,5000);
    });
    await t.test('explicit unpaid requests require business setting and money methods require approval/revision',async()=>{
      await assert.rejects(order('unpaid'),/Unpaid requests disabled/);
      await one('select public.update_catering_settings($1::jsonb) as saved',[JSON.stringify({allow_unpaid_requests:true})]);
      const unpaid=await order('unpaid');assert.equal(unpaid.payment_status,'unpaid');
      assert.equal((await db.query('select allow_unpaid_requests from public.business_settings')).rows[0].allow_unpaid_requests,true);
      o=await order();assert.equal(await reserve(o),null);await approve(o);
      assert.equal(await reserve(o,'card',2),null);assert.equal(await reserve(o,'card',1,1),null);
      a=await reserve(o);assert.equal(a.amount_ore,5000);assert.equal(a.currency,'SEK');assert.equal(a.status,'creating');
      assert.equal((await read(o.id)).payment_status,'pending');assert.equal((await read(o.id)).payment_method,'card');
      assert.equal(await reserve(o,'swish'),null);assert.equal((await reserve(o)).id,a.id);
      const concurrent=await Promise.all(Array.from({length:8},()=>reserve(o)));
      assert.ok(concurrent.every(row=>row.id===a.id));
      assert.equal((await db.query('select count(*)::int as count from public.payment_attempts where order_id=$1',[o.id])).rows[0].count,1);
    });
    await t.test('callback can precede link attachment; stale attachment cannot undo paid',async()=>{
      const paid=event(a);
      assert.equal(await apply(paid),o.id);
      assert.equal((await attach(a)).payment_status,'paid');
      assert.equal((await read(o.id)).checkout_url,null);
      assert.equal((await read(o.id)).payment_transaction_reference,paid.transaction_reference);
      assert.equal(await apply(paid),o.id);
      assert.equal(await apply(event(a)),o.id);
      assert.equal(await apply(event(a,{kind:'failed',success:false})),o.id);
      assert.equal((await read(o.id)).payment_status,'paid');
      assert.equal((await db.query("select count(*)::int as count from public.order_notifications where order_id=$1 and kind='paid'",[o.id])).rows[0].count,1);
      assert.equal(await reserve(o),null);
    });
    await t.test('exact SEK amount, signed unique reference and transaction/revision binding reject mismatches atomically',async()=>{
      const before=(await db.query('select count(*)::int as count from public.payment_provider_events')).rows[0].count;
      for(const overrides of [{amount_ore:1},{currency:'EUR'},{reference:'unknown'},{event_code:'CAPTURE',original_reference:'other'},{transaction_reference:'SECOND_PAYMENT'}]) await assert.rejects(apply(event(a,overrides)),/mismatch|match|second payment|Invalid payment/);
      assert.equal((await db.query('select count(*)::int as count from public.payment_provider_events')).rows[0].count,before);
      await assert.rejects(apply(event(a,{event_code:'REFUND',kind:'paid'})),/Invalid event kind/);
      const other=await order();await approve(other);const attempt=await reserve(other);
      await db.query('update public.orders set quote_revision=2,accepted_revision=2 where id=$1',[other.id]);
      await assert.rejects(apply(event(attempt)),/revision mismatch/);
    });
    await t.test('full refund reservation stays pending; signed full result confirms once',async()=>{
      const refund=await one('select public.reserve_catering_refund($1) as saved',[o.id]);
      assert.equal(refund.amount_ore,5000);assert.equal(refund.status,'creating');
      assert.equal((await read(o.id)).payment_status,'paid');assert.equal((await read(o.id)).payment_refund_status,'pending');
      const again=await one('select public.reserve_catering_refund($1) as saved',[o.id]);assert.equal(again.id,refund.id);assert.equal(again.idempotency_key,refund.idempotency_key);
      await one('select public.attach_catering_refund($1,$2) as saved',[refund.id,'REF_fixture']);
      assert.equal((await read(o.id)).payment_status,'paid');
      const payload={event_code:'REFUND',kind:'refunded',reference:refund.provider_reference,original_reference:refund.transaction_reference,transaction_reference:'REF_fixture'};
      const confirmed=event(a,payload);assert.equal(await apply(confirmed),o.id);assert.equal(await apply(confirmed),o.id);
      assert.equal((await read(o.id)).payment_status,'refunded');assert.equal((await read(o.id)).payment_refund_status,'confirmed');
      assert.equal((await db.query("select count(*)::int as count from public.order_notifications where order_id=$1 and kind='refunded'",[o.id])).rows[0].count,1);
      await apply(event(a));assert.equal((await read(o.id)).payment_status,'refunded');
      await apply(event(a,{...payload,event_code:'REFUND_FAILED',kind:'review'}));
      const reviewed=await read(o.id);assert.equal(reviewed.payment_review_required,true);assert.equal(reviewed.payment_refund_status,'needs_review');
      assert.equal(await one('select public.reserve_catering_refund($1) as saved',[o.id]),null);
      // A delayed successful refund callback cannot erase a later provider failure/reversal.
      await apply(event(a,payload));assert.equal((await read(o.id)).payment_refund_status,'needs_review');
    });
    await t.test('authenticated dashboard refunds and partial disputes quarantine known payments without claiming a full refund',async()=>{
      for(const eventCode of ['REFUND','REFUND_FAILED','REFUNDED_REVERSED','CHARGEBACK']) {
        const external=await order();await approve(external);const attempt=await reserve(external);await apply(event(attempt));
        const payload=event(attempt,{event_code:eventCode,kind:eventCode==='REFUND'?'refunded':'review',
          original_reference:'AUTH_'+attempt.id,transaction_reference:'EXTERNAL_'+attempt.id,
          reference:'merchant-dashboard-reference',amount_ore:2500});
        assert.equal(await apply(payload),external.id);assert.equal(await apply(payload),external.id);
        const fresh=await read(external.id);assert.equal(fresh.payment_status,'paid');assert.equal(fresh.payment_review_required,true);
        assert.equal(fresh.payment_review_reason,'unmatched_'+eventCode);
        assert.equal(await reserve(external),null);assert.equal(await one('select public.reserve_catering_refund($1) as saved',[external.id]),null);
        const audit=(await db.query('select amount_ore from public.payment_provider_events where event_id=$1',[payload.event_id])).rows[0];assert.equal(audit.amount_ore,2500);
        assert.equal((await db.query("select count(*)::int as count from public.order_notifications where order_id=$1 and kind='payment_review'",[external.id])).rows[0].count,1);
      }
      const partial=await order();await approve(partial);const attempt=await reserve(partial);await apply(event(attempt));
      const refund=await one('select public.reserve_catering_refund($1) as saved',[partial.id]);
      const payload=event(attempt,{event_code:'REFUND',kind:'refunded',reference:refund.provider_reference,
        original_reference:refund.transaction_reference,transaction_reference:'PARTIAL_'+attempt.id,amount_ore:2500});
      await apply(payload);assert.equal((await read(partial.id)).payment_status,'paid');
      assert.equal((await read(partial.id)).payment_refund_status,'needs_review');
      assert.equal((await db.query('select provider_refund_id from public.payment_refunds where id=$1',[refund.id])).rows[0].provider_refund_id,null);
    });
    await t.test('capture failure is visible review requiring reconciliation and blocks retries/refunds',async()=>{
      const paid=await order();await approve(paid);const attempt=await reserve(paid);await apply(event(attempt));
      await apply(event(attempt,{event_code:'CAPTURE_FAILED',kind:'review',original_reference:'AUTH_'+attempt.id,transaction_reference:'CAPTURE_failed'}));
      const fresh=await read(paid.id);assert.equal(fresh.payment_status,'paid');assert.equal(fresh.payment_review_required,true);assert.equal(fresh.payment_review_reason,'CAPTURE_FAILED');
      assert.equal(await reserve(paid),null);assert.equal(await one('select public.reserve_catering_refund($1) as saved',[paid.id]),null);
      assert.equal((await db.query("select count(*)::int as count from public.order_notifications where order_id=$1 and kind='payment_review'",[paid.id])).rows[0].count,1);
    });
    await t.test('expired links cannot spawn another charge; authenticated late success resolves only expiry ambiguity',async()=>{
      const expired=await order();await approve(expired);const attempt=await reserve(expired);await attach(attempt);
      const fresh=await one('select public.expire_catering_payment($1) as saved',[attempt.id]);
      assert.equal(fresh.payment_review_required,true);assert.equal(fresh.checkout_url,null);assert.equal(await reserve(expired),null);
      await apply(event(attempt));const paid=await read(expired.id);assert.equal(paid.payment_status,'paid');assert.equal(paid.payment_review_required,false);
    });
    await t.test('cash requires pickup, approved order, authenticated admin audit and no external attempt',async()=>{
      const cash=await order('cash');const receive=()=>one('select public.record_catering_cash_payment($1,$2) as saved',[cash.id,adminId]);
      assert.equal(cash.payment_status,'unpaid');assert.equal(await receive(),null);await approve(cash);
      assert.equal(await one('select public.record_catering_cash_payment($1,$2) as saved',[cash.id,null]),null);
      const received=await receive();assert.equal(received.payment_status,'paid');assert.equal(received.cash_received_by,adminId);assert.ok(received.cash_received_at);
      assert.equal((await receive()).cash_received_at,received.cash_received_at);
      assert.equal(await one('select public.record_catering_cash_payment($1,$2) as saved',[o.id,adminId]),null);
    });
    await t.test('events, payment status and notification queue roll back together',async()=>{
      const atomic=await order();await approve(atomic);const attempt=await reserve(atomic);const payload=event(attempt);
      await db.exec('begin');await apply(payload);await db.exec('rollback');
      assert.equal((await read(atomic.id)).payment_status,'pending');
      assert.equal((await db.query('select count(*)::int as count from public.payment_provider_events where event_id=$1',[payload.event_id])).rows[0].count,0);
      assert.equal((await db.query("select count(*)::int as count from public.order_notifications where order_id=$1 and kind='paid'",[atomic.id])).rows[0].count,0);
    });
    await t.test('legacy online RPCs revoked, new tables RLS/private, new functions invoker/service-only',async()=>{
      await assert.rejects(one('select public.apply_stripe_event($1,$2,$3,$4,$5) as saved',['old','paid',o.id,'old','old']),/permission denied/);
      await assert.rejects(one('select public.attach_catering_checkout($1,$2,$3,$4,$5,$6) as saved',[o.id,'approved','unpaid',null,'old','https://old.example']),/permission denied/);
      const policies=(await db.query("select relrowsecurity from pg_class where relname in ('payment_attempts','payment_provider_events','payment_refunds')")).rows;
      assert.equal(policies.length,3);assert.ok(policies.every(row=>row.relrowsecurity));
      const functions=(await db.query("select prosecdef from pg_proc where proname in ('reserve_catering_payment','attach_catering_payment','apply_catering_payment_event','reserve_catering_refund','attach_catering_refund','record_catering_cash_payment')")).rows;
      assert.equal(functions.length,6);assert.ok(functions.every(row=>!row.prosecdef));
      for(const role of ['anon','authenticated']) {
        await db.exec(`reset role;set role ${role}`);
        for(const table of ['payment_attempts','payment_provider_events','payment_refunds','orders']) await assert.rejects(db.query(`select * from public.${table}`),/permission denied/);
        await assert.rejects(reserve(o),/permission denied/);
        await assert.rejects(apply(event(a)),/permission denied/);
        await assert.rejects(one('select public.record_catering_cash_payment($1,$2) as saved',[o.id,adminId]),/permission denied/);
      }
    });
  } finally {await db.close();}
});
