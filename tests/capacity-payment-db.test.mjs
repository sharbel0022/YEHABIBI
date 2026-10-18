import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';

test('capacity and verified payment share an atomic lifecycle without losing financial truth',async t=>{
  const {PGlite}=await import('@electric-sql/pglite'),db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);alter table storage.objects enable row level security;`);
    const directory=new URL('../supabase/migrations/',import.meta.url);
    for(const file of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(file,directory),'utf8').replace('create extension if not exists pgcrypto;',''));
    const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0].saved;
    const menu=randomUUID();
    await db.query("insert into public.menus(id,slug,title,price_ore,package_portions,min_people,active,direct_order_enabled,kitchen_units,preparation_minutes) values($1,'test-lifecycle','TEST femportionerspaket',12900,5,5,true,true,2,20)",[menu]);
    const hours=Array.from({length:7},(_,weekday)=>({weekday,closed:false,opens_at:'00:00',closes_at:'23:59',cutoff_at:'23:59',pickup_from:'00:00',pickup_until:'23:59',delivery_from:'00:00',delivery_until:'23:59'}));
    await db.exec("update public.business_settings set pickup_enabled=true,pickup_address='TEST adress'");
    await db.query("update public.direct_order_settings set enabled=true,auto_approve=true,capacity_per_slot=100,max_days_ahead=3,weekly_hours=$1::jsonb",[JSON.stringify(hours)]);
    const read=id=>one('select to_jsonb(o) saved from public.orders o where id=$1',[id]);
    const quote=()=>one('select public.get_direct_availability($1::jsonb) saved',[JSON.stringify({menu_id:menu,quantity:1,fulfillment:'pickup'})]);
    let serial=0;
    const create=async(slot)=>{
      const available=await quote(),chosen=slot||available.slots.find(item=>Date.parse(item.starts_at)>Date.now()+86400000)?.starts_at;
      assert.ok(chosen,'Need a future server slot');
      return one('select public.create_direct_order($1::jsonb) saved',[JSON.stringify({id:randomUUID(),request_id:randomUUID(),request_hash:'a'.repeat(64),code:'CM-'+randomUUID().replaceAll('-','').slice(0,10).toUpperCase(),tracking_hash:'b'.repeat(64),menu_id:menu,quantity:1,fulfillment:'pickup',scheduled_at:chosen,expected_total_ore:12900,full_name:'Syntetisk Kund',email:'lifecycle@example.test',phone:'0700000000',payment_preference:'card'})]);
    };
    const reserve=o=>one("select public.reserve_catering_payment($1,'adyen','card',1,12900) saved",[o.id]);
    const event=(a,patch={})=>({provider:'adyen',environment:'test',event_id:createHash('sha256').update(String(++serial)).digest('hex'),event_code:'AUTHORISATION',kind:'paid',success:true,reference:a.provider_reference,transaction_reference:'AUTH_'+a.id,original_reference:null,amount_ore:12900,currency:'SEK',...patch});
    const apply=e=>one('select public.apply_catering_payment_event($1::jsonb) saved',[JSON.stringify(e)]);
    const expire=o=>db.query("update public.orders set hold_expires_at=now()-interval '1 minute' where id=$1",[o.id]);
    const release=()=>one('select public.release_expired_capacity_holds() saved');

    await t.test('unattempted expiry releases inventory and cannot open an obsolete checkout',async()=>{
      const o=await create();assert.equal(o.total_ore,12900,'Five portions still cost one package price');
      await expire(o);await release();assert.equal((await read(o.id)).capacity_status,'released');assert.equal(await reserve(o),null);
      assert.equal((await db.query('select count(*)::int n from public.payment_attempts where order_id=$1',[o.id])).rows[0].n,0);
    });
    await t.test('durable creating attempt pins capacity beyond the hold TTL; duplicate late callbacks do not undo confirmation',async()=>{
      const o=await create(),a=await reserve(o);assert.equal(a.status,'creating');await expire(o);await release();assert.equal((await read(o.id)).capacity_status,'held');
      const paid=event(a);await apply(paid);assert.equal((await read(o.id)).capacity_status,'confirmed');
      await db.query("update public.orders set preparation_starts_at=now()-interval '1 minute' where id=$1",[o.id]);
      await apply(paid);assert.equal((await read(o.id)).capacity_status,'confirmed');assert.equal((await read(o.id)).payment_review_required,false);
    });
    await t.test('verified refusal releases; explicit retry reacquires safely and reuses the same payment identity',async()=>{
      const o=await create(),a=await reserve(o);const failed=event(a,{kind:'failed',success:false});await apply(failed);
      assert.equal((await read(o.id)).capacity_status,'released');const again=await reserve(o);assert.equal(again.id,a.id);assert.equal(again.status,'creating');
      await apply(failed);assert.equal((await read(o.id)).payment_status,'pending','Duplicate old refusal cannot release a new retry');
      assert.equal((await read(o.id)).capacity_status,'held');await apply(event(a));assert.equal((await read(o.id)).capacity_status,'confirmed');
    });
    await t.test('late paid after released capacity remains paid, needs review, and can be verifiably refunded',async()=>{
      const o=await create(),a=await reserve(o);await apply(event(a,{kind:'failed',success:false}));
      await apply(event(a));let fresh=await read(o.id);assert.equal(fresh.payment_status,'paid');assert.equal(fresh.capacity_status,'review');assert.equal(fresh.payment_review_reason,'capacity_unavailable_after_payment');
      assert.equal(await reserve(o),null);const r=await one('select public.reserve_catering_refund($1) saved',[o.id]);assert.ok(r);
      await apply(event(a,{event_code:'REFUND',kind:'refunded',reference:r.provider_reference,original_reference:r.transaction_reference,transaction_reference:'REF_'+r.id}));
      fresh=await read(o.id);assert.equal(fresh.payment_status,'refunded');assert.equal(fresh.capacity_status,'released');assert.equal(fresh.payment_review_required,false);
    });
    await t.test('a still pending payment arriving after frozen preparation start enters the exception flow',async()=>{
      const o=await create(),a=await reserve(o);
      await db.query("update public.orders set preparation_starts_at=now()-interval '1 minute' where id=$1",[o.id]);await apply(event(a));
      assert.equal((await read(o.id)).payment_status,'paid');assert.equal((await read(o.id)).capacity_status,'review');
    });
    await t.test('late verified money after cancellation preserves cancellation and enters review',async()=>{
      const o=await create(),a=await reserve(o);await apply(event(a,{kind:'failed',success:false}));
      await db.query("update public.orders set status='cancelled' where id=$1",[o.id]);
      await apply(event(a));const fresh=await read(o.id);
      assert.equal(fresh.status,'cancelled');assert.equal(fresh.payment_status,'paid');assert.equal(fresh.capacity_status,'review');
      assert.equal(fresh.payment_review_reason,'capacity_unavailable_after_payment');
      await apply(event(a));const repeated=await read(o.id);
      assert.equal(repeated.status,'cancelled');assert.equal(repeated.payment_status,'paid');assert.equal(repeated.capacity_status,'review');
      assert.ok(await one('select public.reserve_catering_refund($1) saved',[o.id]));
    });
    await t.test('unmanaged historical cancelled orders retain the original authorisation guard',async()=>{
      const o=await create(),a=await reserve(o);await apply(event(a,{kind:'failed',success:false}));
      await db.query("update public.orders set capacity_status=null,status='cancelled' where id=$1",[o.id]);
      await assert.rejects(apply(event(a)),/Order not approved/);
      assert.equal((await read(o.id)).payment_status,'failed');
    });
    await t.test('duplicate paid cannot erase a later financial dispute or unlock an unsafe refund',async()=>{
      const o=await create(),a=await reserve(o);await apply(event(a,{kind:'failed',success:false}));await apply(event(a));
      assert.equal((await read(o.id)).capacity_status,'review');
      await apply(event(a,{event_code:'CHARGEBACK',kind:'review',original_reference:'AUTH_'+a.id,transaction_reference:'CB_'+a.id}));
      assert.equal((await read(o.id)).payment_review_reason,'CHARGEBACK');
      await apply(event(a));const fresh=await read(o.id);
      assert.equal(fresh.payment_review_reason,'CHARGEBACK');assert.equal(fresh.payment_status,'paid');assert.equal(fresh.capacity_status,'review');
      assert.equal(await one('select public.reserve_catering_refund($1) saved',[o.id]),null);
    });
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from public.capacity_reservations'),/permission denied/);
      await assert.rejects(db.query('select public.release_expired_capacity_holds()'),/permission denied/);
      await db.exec('reset role');
    }
  } finally {await db.close();}
});
