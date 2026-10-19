import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';

test('durable jobs, kitchen alarms and verified inbox use the real database invariants',async t=>{
  const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);alter table storage.objects enable row level security;`);
    const directory=new URL('../supabase/migrations/',import.meta.url);
    for(const file of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(file,directory),'utf8').replace('create extension if not exists pgcrypto;',''));
    const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.saved;
    const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
    const menu=randomUUID();
    await db.query(`insert into public.menus(id,slug,title,price_ore,package_portions,min_people,active,direct_order_enabled,kitchen_units,preparation_minutes)
      values($1,'background-test','TEST paket',12900,5,5,true,true,2,20)`,[menu]);
    const hours=Array.from({length:7},(_,weekday)=>({weekday,closed:false,opens_at:'00:00',closes_at:'23:59',cutoff_at:'23:59',pickup_from:'00:00',pickup_until:'23:59',delivery_from:'00:00',delivery_until:'23:59'}));
    await db.exec("update public.business_settings set pickup_enabled=true,pickup_address='TEST';update public.direct_order_settings set enabled=true,auto_approve=true,capacity_per_slot=100,max_days_ahead=3");
    await db.query('update public.direct_order_settings set weekly_hours=$1::jsonb',[JSON.stringify(hours)]);
    const input={menu_id:menu,quantity:1,fulfillment:'pickup'};
    const quote=()=>one('select public.get_direct_availability($1::jsonb) saved',[JSON.stringify(input)]);
    const create=async(slot)=>{
      const q=await quote();const chosen=slot||q.slots.find(s=>Date.parse(s.starts_at)>Date.now()+86400000)?.starts_at;assert.ok(chosen);
      return one('select public.create_direct_order($1::jsonb) saved',[JSON.stringify({...input,id:randomUUID(),request_id:randomUUID(),request_hash:'a'.repeat(64),code:'CM-'+randomUUID().replaceAll('-','').slice(0,10).toUpperCase(),tracking_hash:'b'.repeat(64),scheduled_at:chosen,expected_total_ore:12900,full_name:'Syntetisk Kund',email:'jobs@example.test',phone:'0700000000',payment_preference:'card'})]);
    };
    const reserve=o=>one("select public.reserve_catering_payment($1,'adyen','card',1,12900,'test','TEST_MERCHANT') saved",[o.id]);
    let serial=0;
    const event=(a,patch={})=>({provider:'adyen',environment:'test',merchant_account:'TEST_MERCHANT',event_id:createHash('sha256').update(String(++serial)).digest('hex'),event_code:'AUTHORISATION',kind:'paid',success:true,reference:a.provider_reference,transaction_reference:'AUTH_'+a.id,original_reference:null,amount_ore:12900,currency:'SEK',...patch});
    const enqueue=e=>one('select public.enqueue_catering_payment_events($1::jsonb) saved',[JSON.stringify([e])]);
    const claim=(worker,limit=20,lease=60,now=new Date().toISOString())=>rows('select * from public.claim_background_jobs($1,$2,$3,$4)',[worker,limit,lease,now]);
    const execute=(job,now=new Date().toISOString())=>one('select public.execute_database_job($1,$2,$3) saved',[job.id,job.lease_token,now]);
    const read=id=>one('select to_jsonb(o) saved from public.orders o where id=$1',[id]);
    const clearJobs=()=>db.exec("delete from public.payment_event_inbox;delete from public.background_jobs;update public.order_notifications set delivered_at=now(),owner_delivered_at=now(),customer_delivered_at=now(),lease_token=null,lease_expires_at=null");

    await t.test('B: concurrent claims are disjoint; payment and inbox complete atomically once',async()=>{
      const o=await create(),a=await reserve(o),e=event(a);assert.equal(a.merchant_account,'TEST_MERCHANT');
      assert.equal(await enqueue(e),1);assert.equal(await enqueue(e),0);
      assert.equal((await read(o.id)).payment_status,'pending','HTTP receipt persists evidence without business processing');
      const [left,right]=await Promise.all([claim('left'),claim('right')]);assert.equal(left.length+right.length,1);
      const job=[...left,...right][0];assert.equal(await execute(job),true);assert.equal(await execute(job),false);
      assert.equal((await read(o.id)).payment_status,'paid');
      assert.equal(await one('select count(*)::int saved from public.payment_provider_events where event_id=$1',[e.event_id]),1);
      assert.equal(await one('select processed_at is not null saved from public.payment_event_inbox where event_id=$1',[e.event_id]),true);
      await clearJobs();
    });
    await t.test('E: merchant/environment/amount and conflicting duplicates are rejected before ACK',async()=>{
      const o=await create(),a=await reserve(o),e=event(a);
      for(const patch of [{merchant_account:'OTHER'},{environment:'live'},{amount_ore:12901},{currency:'EUR'}])await assert.rejects(enqueue({...e,...patch}),/identity or amount mismatch|Invalid payment event/);
      assert.equal(await one('select count(*)::int saved from public.payment_event_inbox'),0);
      await assert.rejects(one('select public.enqueue_catering_payment_events($1::jsonb) saved',[JSON.stringify([e,{...event(a),merchant_account:'OTHER'}])]),/identity or amount mismatch/);
      assert.equal(await one('select count(*)::int saved from public.payment_event_inbox'),0,'The whole batch rolls back if any identity fails');
      assert.equal(await enqueue({...e,checkout_url:'https://private.example.test/session',tracking_token:'private'}),1);
      await assert.rejects(enqueue({...e,success:false,kind:'failed'}),/Conflicting duplicate/);
      assert.equal(await one("select payload ? 'tracking_token' or payload ? 'checkout_url' saved from public.payment_event_inbox where event_id=$1",[e.event_id]),false);
      const legacy=await create();const old=await one("select public.reserve_catering_payment($1,'adyen','card',1,12900) saved",[legacy.id]);
      await assert.rejects(enqueue(event(old)),/identity or amount mismatch/);
      await clearJobs();
    });
    await t.test('an out-of-order signed capture is durable while awaiting its authorisation',async()=>{
      const o=await create(),a=await reserve(o),auth=event(a),capture=event(a,{event_code:'CAPTURE',transaction_reference:'CAP_'+a.id,original_reference:'AUTH_'+a.id});
      assert.equal(await one('select public.enqueue_catering_payment_events($1::jsonb) saved',[JSON.stringify([capture,auth])]),2);
      const jobs=await claim('out-of-order');
      const captureJob=jobs.find(j=>j.payload.event_id===capture.event_id),authJob=jobs.find(j=>j.payload.event_id===auth.event_id);
      await assert.rejects(execute(captureJob),/Payment transaction mismatch/);
      assert.equal(await one('select processed_at is null saved from public.payment_event_inbox where event_id=$1',[capture.event_id]),true);
      assert.equal(await execute(authJob),true);assert.equal(await execute(captureJob),true);assert.equal((await read(o.id)).payment_status,'paid');
      await clearJobs();
    });
    await t.test('C: a crashed worker lease is reclaimed; the stale owner cannot mutate or finish',async()=>{
      const o=await create(),a=await reserve(o);await enqueue(event(a));
      const now=Date.now();const first=(await claim('crashed',1,5,new Date(now).toISOString()))[0];
      assert.equal((await claim('early',1,5,new Date(now+4000).toISOString())).length,0);
      const recovered=(await claim('recovered',1,60,new Date(now+6000).toISOString()))[0];assert.equal(recovered.id,first.id);assert.notEqual(recovered.lease_token,first.lease_token);
      assert.equal(await execute(first,new Date(now+6000).toISOString()),false);
      assert.equal(await execute(recovered,new Date(now+6000).toISOString()),true);assert.equal((await read(o.id)).payment_status,'paid');
      await clearJobs();
    });
    await t.test('A: scheduled watchdog queues reminders, escalation and future preparation without browser traffic',async()=>{
      const o=await create(),a=await reserve(o);await enqueue(event(a));await execute((await claim('payment'))[0]);await clearJobs();
      const now=new Date();await db.query("update public.orders set confirmed_at=$2::timestamptz-interval '3 minutes',preparation_starts_at=$2::timestamptz+interval '10 minutes' where id=$1",[o.id,now.toISOString()]);
      await db.exec('update public.direct_order_settings set watchdog_enabled=true,reminder_minutes=2,escalation_minutes=5,notification_backup_approved=true');
      const schedule=when=>one('select public.enqueue_background_maintenance($1) saved',[when]);
      assert.equal(await schedule(now.toISOString()),2);assert.equal(await schedule(now.toISOString()),0);
      await db.exec("set time zone 'Europe/Stockholm'");assert.equal(await schedule(now.toISOString()),0,'The same minute is deduplicated across worker session timezones');
      await db.exec("set time zone 'UTC'");
      for(const j of await claim('scheduled',20,60,now.toISOString()))await execute(j,now.toISOString());
      await db.exec("set time zone 'Europe/Stockholm'");await one('select public.run_kitchen_watchdog($1) saved',[now.toISOString()]);await db.exec("set time zone 'UTC'");
      const kinds=await rows("select kind from public.order_notifications where order_id=$1 and kind like '%reminder'",[o.id]);assert.deepEqual(kinds.map(k=>k.kind).sort(),['kitchen_reminder','preparation_reminder']);
      const later=new Date(now.getTime()+180000).toISOString();await schedule(later);for(const j of await claim('scheduled-again',20,60,later))await execute(j,later);
      assert.equal(await one("select count(*)::int saved from public.order_notifications where order_id=$1 and kind='kitchen_escalation'",[o.id]),1);
      assert.equal(await one("select (payload->>'backup_requested')::boolean saved from public.order_notifications where order_id=$1 and kind='kitchen_escalation'",[o.id]),true);
      await one('select public.run_kitchen_watchdog($1) saved',[later]);
      assert.equal(await one("select count(*)::int saved from public.order_notifications where order_id=$1 and kind='kitchen_escalation'",[o.id]),1);
      await db.exec('update public.direct_order_settings set watchdog_enabled=false');await clearJobs();
    });
    await t.test('outbox keeps partial delivery, reclaims crashes, respects Retry-After and exposes dead letters',async()=>{
      const o=await create();const now=Date.now();
      const notification=(await rows('select * from public.claim_catering_notifications($1,1,5,$2,$3)',['mail-a',new Date(now).toISOString(),o.id]))[0];assert.ok(notification.first_attempt_at);
      assert.equal(await one('select public.complete_catering_notification($1,$2,true,false,false,$3) saved',[notification.event_key,notification.lease_token,new Date(now).toISOString()]),true);
      let fresh=await one('select to_jsonb(n) saved from public.order_notifications n where event_key=$1',[notification.event_key]);assert.ok(fresh.customer_delivered_at);assert.equal(fresh.delivered_at,null);assert.equal(fresh.lease_token,notification.lease_token);
      const recovered=(await rows('select * from public.claim_catering_notifications($1,1,60,$2,$3)',['mail-b',new Date(now+6000).toISOString(),o.id]))[0];assert.ok(recovered.customer_delivered_at);
      assert.equal(await one('select public.complete_catering_notification($1,$2,true,true,false,$3) saved',[notification.event_key,notification.lease_token,new Date(now+6000).toISOString()]),false);
      assert.equal(await one('select public.fail_catering_notification($1,$2,$3,120,$4) saved',[recovered.event_key,recovered.lease_token,'synthetic retry',new Date(now+6000).toISOString()]),true);
      assert.equal((await rows('select * from public.claim_catering_notifications($1,1,60,$2,$3)',['mail-c',new Date(now+125000).toISOString(),o.id])).length,0);
      const last=(await rows('select * from public.claim_catering_notifications($1,1,60,$2,$3)',['mail-c',new Date(now+127000).toISOString(),o.id]))[0];
      await db.query("update public.order_notifications set attempts=8 where event_key=$1",[last.event_key]);await one('select public.fail_catering_notification($1,$2,$3,null,$4) saved',[last.event_key,last.lease_token,'synthetic dead letter',new Date(now+127000).toISOString()]);
      fresh=await one('select to_jsonb(n) saved from public.order_notifications n where event_key=$1',[last.event_key]);assert.ok(fresh.dead_at);assert.ok(fresh.customer_delivered_at);
      await clearJobs();
    });
    await t.test('F: missing webhook creates a fenced reconciliation job without charging or releasing capacity',async()=>{
      const o=await create(),a=await reserve(o);await db.query("update public.payment_attempts set reconciliation_next_check_at=now()-interval '1 minute' where id=$1",[a.id]);
      await one('select public.enqueue_background_maintenance() saved');const job=(await claim('reconciler')).find(j=>j.kind==='reconciliation');assert.ok(job);
      assert.equal(await one('select public.finish_payment_reconciliation_job($1,$2,$3,true,null) saved',[job.id,randomUUID(),'unsupported_status_poll']),false);
      assert.equal(await one('select public.finish_payment_reconciliation_job($1,$2,$3,true,null) saved',[job.id,job.lease_token,'manual_provider_report_required']),true);
      const fresh=await read(o.id);assert.equal(fresh.payment_status,'pending');assert.equal(fresh.capacity_status,'held');assert.equal(fresh.payment_review_required,true);
      assert.equal(await one('select count(*)::int saved from public.payment_attempts where order_id=$1',[o.id]),1);
      assert.equal(await one('select reconciliation_manual_review saved from public.payment_attempts where id=$1',[a.id]),true);
      await clearJobs();
    });
    await t.test('I/J: configured stale or unavailable reception gates only new purchases; old evidence still applies',async()=>{
      const o=await create(),a=await reserve(o),alarm=await create(),alarmAttempt=await reserve(alarm);
      await enqueue(event(alarmAttempt));await execute((await claim('alarm-payment'))[0]);await clearJobs();
      await db.exec('update public.direct_order_settings set job_health_required=true,notification_reception_available=false');assert.equal((await quote()).enabled,false);
      await one('select public.enqueue_background_maintenance() saved');for(const j of await claim('health'))if(j.kind!=='reconciliation')await execute(j);
      await db.exec('update public.direct_order_settings set notification_reception_available=true');assert.equal((await quote()).enabled,true);
      await db.query("insert into public.order_notifications(event_key,order_id,kind,payload,dead_at) values($1,$2,'kitchen_escalation','{}',now())",['dead-health-'+alarm.id,alarm.id]);
      assert.equal((await quote()).enabled,false,'A failed owner alarm gates new purchases even with a recent heartbeat');
      await db.query('update public.orders set acknowledged_at=now() where id=$1',[alarm.id]);
      assert.equal((await quote()).enabled,true,'Human acknowledgement resolves the failed alarm immediately');
      await one('select public.run_kitchen_watchdog() saved');
      assert.equal(await one('select superseded_at is not null saved from public.order_notifications where event_key=$1',['dead-health-'+alarm.id]),true);
      assert.equal((await one('select public.background_job_health() saved')).dead_notifications,0);
      await db.exec("update public.background_jobs set completed_at=now()-interval '10 minutes' where kind='kitchen_watchdog'");assert.equal((await quote()).enabled,false);
      await db.exec("update public.payment_provider_registry set active=false where provider='adyen' and environment='test'");assert.equal(await reserve(await read(o.id)),null);
      await enqueue(event(a));for(const j of await claim('old-payment'))if(j.kind==='payment_event')await execute(j);assert.equal((await read(o.id)).payment_status,'paid');
      await db.exec('update public.direct_order_settings set job_health_required=false');assert.equal((await quote()).enabled,true);
      await db.exec("update public.payment_provider_registry set active=true where provider='adyen' and environment='test'");await clearJobs();
    });
    await t.test('partial signed adverse events stay durable and quarantined without claiming a full refund',async()=>{
      for(const code of ['REFUND','CHARGEBACK']) {
        const o=await create(),a=await reserve(o);await enqueue(event(a));for(const j of await claim('authorise-partial'))await execute(j);
        const partial=event(a,{event_code:code,kind:code==='REFUND'?'refunded':'review',reference:'external-dashboard-ref',original_reference:'AUTH_'+a.id,transaction_reference:'PARTIAL_'+a.id,amount_ore:2500});
        assert.equal(await enqueue(partial),1);assert.equal(await enqueue(partial),0);for(const j of await claim('partial-evidence'))await execute(j);
        const fresh=await read(o.id);assert.equal(fresh.payment_status,'paid');assert.equal(fresh.payment_review_required,true);assert.equal(fresh.payment_review_reason,'unmatched_'+code);
        assert.equal(await one('select amount_ore saved from public.payment_provider_events where event_id=$1',[partial.event_id]),2500);
        assert.equal(await one('select (payload->>\'amount_ore\')::integer saved from public.payment_event_inbox where event_id=$1',[partial.event_id]),2500);
      }
      await clearJobs();
    });
    await t.test('H/K: late payment cannot steal another hold or erase a later chargeback quarantine',async()=>{
      await db.exec('update public.direct_order_settings set capacity_per_slot=2');const q=await quote();const slot=q.slots.at(-1)?.starts_at;assert.ok(slot);
      const late=await create(slot),a=await reserve(late);const refused=event(a,{kind:'failed',success:false});await enqueue(refused);for(const j of await claim('refusal'))await execute(j);
      const other=await create(slot);const otherReservations=await rows('select * from public.capacity_reservations where order_id=$1',[other.id]);
      const paid=event(a);await enqueue(paid);for(const j of await claim('late'))await execute(j);let fresh=await read(late.id);assert.equal(fresh.payment_status,'paid');assert.equal(fresh.capacity_status,'review');
      assert.deepEqual(await rows('select * from public.capacity_reservations where order_id=$1',[other.id]),otherReservations);
      await enqueue(event(a,{event_code:'CHARGEBACK',kind:'review',original_reference:'AUTH_'+a.id,transaction_reference:'CB_'+a.id}));for(const j of await claim('dispute'))await execute(j);
      await enqueue(event(a));for(const j of await claim('old-paid'))await execute(j);fresh=await read(late.id);assert.equal(fresh.payment_review_required,true);assert.equal(fresh.payment_review_reason,'CHARGEBACK');
    });
    await t.test('new queues and privileged job RPCs deny anon/authenticated',async()=>{
      for(const role of ['anon','authenticated']) {
        await db.exec(`set role ${role}`);
        for(const sql of ['select * from public.background_jobs','select * from public.payment_event_inbox',"select public.claim_background_jobs('intruder')",'select public.enqueue_background_maintenance()',"select public.claim_catering_notifications('intruder')",'select public.background_job_health()'])await assert.rejects(db.query(sql),/permission denied/);
        await db.exec('reset role');
      }
    });
  } finally {await db.close();}
});
