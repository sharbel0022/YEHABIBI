import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

async function database(beforeFoundation) {
  const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);alter table storage.objects enable row level security;`);
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const file of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()) {
    if(file.includes('complete_restaurant_capacity_catalog')) await beforeFoundation?.(db);
    await db.exec(readFileSync(new URL(file,directory),'utf8').replace('create extension if not exists pgcrypto;',''));
  }
  return db;
}

test('complete catalogue and shared weighted kitchen/delivery capacity',async t=>{
  const db=await database();const menu=randomUUID(),addon=randomUUID(),zone=randomUUID(),admin=randomUUID(),campaign=randomUUID();
  const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.saved;
  try {
    await db.query('insert into auth.users(id) values($1)',[admin]);
    await db.exec("grant usage on schema public to service_role;grant all on all tables in schema public to service_role;set role service_role;update public.business_settings set pickup_address='TEST adress',allow_unpaid_requests=true,min_advance_days=0,pickup_enabled=true,delivery_enabled=true,cash_enabled=true;");
    await db.query("insert into public.dishes(id,title,slug,price_ore,portion_label,active,direct_addon_enabled,kitchen_units,preparation_minutes) values($1,'TEST ostrulle','test-extra',2500,'styck',true,true,1,35)",[addon]);
    await db.query("insert into public.menus(id,slug,title,price_ore,catering_price_ore,min_people,active,direct_order_enabled,package_portions,preparation_minutes,kitchen_units,allowed_addon_ids,package_group,size_label) values($1,'test-complete','TEST familj',12900,4900,1,true,true,2,20,2,array[$2::uuid],'TEST familj','2 personer')",[menu,addon]);
    await db.query("insert into public.delivery_zones(id,name,postal_prefixes,fee_ore,active,direct_enabled,travel_minutes,capacity_per_slot,max_package_quantity,delivery_window_minutes) values($1,'TEST zon',array['721'],5000,true,true,20,1,2,30)",[zone]);
    const hours=Array.from({length:7},(_,weekday)=>({weekday,closed:false,opens_at:'00:00',closes_at:'23:59',cutoff_at:'23:59',pickup_from:'00:00',pickup_until:'23:59',delivery_from:'00:00',delivery_until:'23:59'}));
    await db.query('update public.direct_order_settings set enabled=true,auto_approve=true,weekly_hours=$1::jsonb,capacity_per_slot=100,delivery_capacity_per_slot=1,max_days_ahead=30,min_advance_minutes=5',[JSON.stringify(hours)]);
    const availability=(overrides={})=>one('select public.get_direct_availability($1::jsonb) saved',[JSON.stringify({menu_id:menu,quantity:1,fulfillment:'pickup',...overrides})]);
    const request=(quote,overrides={})=>({id:randomUUID(),code:'CM-'+randomUUID().slice(0,10),request_id:randomUUID(),request_hash:'b'.repeat(64),tracking_hash:'a'.repeat(64),menu_id:menu,quantity:1,fulfillment:'pickup',scheduled_at:quote.slots[0].starts_at,expected_total_ore:quote.total_ore,full_name:'Test Kund',email:'customer@example.test',phone:'0700000000',payment_preference:'card',...overrides});
    const create=input=>one('select public.create_direct_order($1::jsonb) saved',[JSON.stringify(input)]);
    const clear=()=>db.exec("update public.orders set status='cancelled' where order_type='direct';update public.capacity_reservations set state='released';update public.campaigns set active=false;");
    await t.test('package sizes and addons retain distinct integer prices/units and workload',async()=>{
      const quote=await availability({quantity:2,addons:[{dish_id:addon,quantity:3}]});
      assert.equal(quote.subtotal_ore,33300);assert.equal(quote.kitchen_units,7);assert.equal(quote.preparation_minutes,35);
      assert.ok(quote.slots.every(slot=>!Object.hasOwn(slot,'remaining_capacity')),'Weighted slots must not expose an inaccurate order-count limit');
      assert.equal(quote.lines[0].quantity,2);assert.equal(quote.lines[0].unit_label,'paket');assert.equal(quote.lines[1].unit_label,'styck');
      const input=request(quote,{quantity:2,addons:[{dish_id:addon,quantity:3}]});
      await db.query('update public.dishes set price_ore=2600 where id=$1',[addon]);await assert.rejects(create(input),/Price changed/);
      await db.query('update public.dishes set price_ore=2500 where id=$1',[addon]);const order=await create(input);
      assert.equal(order.capacity_status,'held');assert.equal(order.confirmed_at,null);assert.equal(order.total_ore,33300);
      assert.equal(order.items_snapshot.length,2);assert.equal(order.items_snapshot[1].quantity,3);
      await db.query('update public.dishes set price_ore=9999 where id=$1',[addon]);
      assert.equal((await db.query('select unit_price_ore from public.order_items where order_id=$1 and dish_id=$2',[order.id,addon])).rows[0].unit_price_ore,2500);
      await db.query('update public.dishes set price_ore=2500 where id=$1',[addon]);await clear();
    });
    await t.test('paused/sold out products and unconfigured addons cannot be purchased',async()=>{
      for(const state of ['paused','sold_out']){await db.query('update public.menus set availability_state=$2 where id=$1',[menu,state]);assert.equal((await availability()).enabled,false);}
      await db.query("update public.menus set availability_state='available' where id=$1",[menu]);
      assert.equal((await availability({addons:[{dish_id:randomUUID(),quantity:1}]})).enabled,false);
      await db.query('update public.dishes set active=false where id=$1',[addon]);assert.equal((await availability({addons:[{dish_id:addon,quantity:1}]})).enabled,false);
      await db.query('update public.dishes set active=true where id=$1',[addon]);
    });
    await t.test('weighted last kitchen units are atomic across quantities and addons',async()=>{
      await db.exec('update public.direct_order_settings set capacity_per_slot=7');
      const selection={quantity:2,addons:[{dish_id:addon,quantity:3}]},quote=await availability(selection);
      const raced=await Promise.allSettled(Array.from({length:5},()=>create(request(quote,selection))));assert.equal(raced.filter(result=>result.status==='fulfilled').length,1);
      assert.equal((await db.query("select sum(units)::int n from public.capacity_reservations where state='held' and resource='kitchen'")).rows[0].n,7);
      await clear();await db.exec('update public.direct_order_settings set capacity_per_slot=100');
    });
    await t.test('manual load blocks the same kitchen resource and release restores a slot',async()=>{
      await db.exec('update public.direct_order_settings set capacity_per_slot=2');const quote=await availability(),slot=quote.slots[0];
      const hold=await one('select public.create_manual_capacity_hold($1::jsonb,$2::uuid) saved',[JSON.stringify({resource:'kitchen',starts_at:slot.preparation_starts_at,ends_at:slot.starts_at,units:2,reason:'TEST telefonbeställning'}),admin]);
      assert.ok(!(await availability()).slots.some(candidate=>candidate.starts_at===slot.starts_at));await assert.rejects(create(request(quote)),/Slot unavailable/);
      assert.equal(await one('select public.release_manual_capacity_hold($1,$2) saved',[hold.id,admin]),true);assert.ok((await availability()).slots.some(candidate=>candidate.starts_at===slot.starts_at));
      await clear();await db.exec('update public.direct_order_settings set capacity_per_slot=100');
    });
    await t.test('verified failed reservations may be cancelled only after resource release',async()=>{
      const order=await create(request(await availability()));
      await db.query("update public.orders set payment_status='failed' where id=$1",[order.id]);
      assert.equal(await one('select public.transition_kitchen_order($1,$2,$3) saved',[order.id,'cancel',admin]),null);
      await one("select public.settle_order_capacity_payment($1,'failed') saved",[order.id]);
      const cancelled=await one('select public.transition_kitchen_order($1,$2,$3) saved',[order.id,'cancel',admin]);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.capacity_status,'released');await clear();
    });
    await t.test('catering retains per-person pricing and occupies the same weighted capacity after approval',async()=>{
      await db.exec('update public.direct_order_settings set capacity_per_slot=6');const quote=await availability();const slot=quote.slots.find(slot=>Date.parse(slot.starts_at)>Date.now()+86400000);
      const cater=await one('select public.create_catering_order($1::jsonb,$2::jsonb) saved',[JSON.stringify({id:randomUUID(),code:'CM-'+randomUUID().slice(0,10),request_id:randomUUID(),request_hash:'c'.repeat(64),tracking_hash:'a'.repeat(64),menu_id:menu,guests:6,occasion:'fest',event_date:slot.event_date,event_time:slot.event_time,fulfillment:'pickup',full_name:'Test Catering',email:'cater@example.test',phone:'0700000000',payment_preference:'card',subtotal_ore:29400,delivery_fee_ore:0}),JSON.stringify([])]);
      assert.equal(cater.total_ore,29400);assert.equal(cater.status,'new');assert.equal(cater.capacity_status,'released');
      const approved=await one('select public.transition_kitchen_order($1,$2,$3) saved',[cater.id,'approve',admin]);assert.equal(approved.capacity_status,'confirmed');assert.equal(approved.kitchen_units,6);
      assert.ok(!(await availability()).slots.some(candidate=>candidate.starts_at===slot.starts_at));
      await db.query("update public.orders set status='cancelled' where id=$1",[cater.id]);await clear();await db.exec('update public.direct_order_settings set capacity_per_slot=100');
      await db.query('update public.delivery_zones set travel_minutes=45 where id=$1',[zone]);
      const deliveryCater=await one('select public.create_catering_order($1::jsonb,$2::jsonb) saved',[JSON.stringify({id:randomUUID(),code:'CM-'+randomUUID().slice(0,10),request_id:randomUUID(),request_hash:'d'.repeat(64),tracking_hash:'a'.repeat(64),menu_id:menu,guests:6,occasion:'fest',event_date:slot.event_date,event_time:slot.event_time,fulfillment:'delivery',delivery_zone_id:zone,address:'TEST adress 1',postal_code:'72100',city:'Teststad',full_name:'Test Catering',email:'delivery-cater@example.test',phone:'0700000000',payment_preference:'card',subtotal_ore:29400,delivery_fee_ore:5000}),JSON.stringify([])]);
      await db.query('update public.delivery_zones set travel_minutes=90,delivery_window_minutes=60 where id=$1',[zone]);
      const approvedDelivery=await one('select public.transition_kitchen_order($1,$2,$3) saved',[deliveryCater.id,'approve',admin]);assert.equal(approvedDelivery.capacity_status,'confirmed');
      const window=(await db.query("select starts_at,ends_at from public.capacity_reservations where order_id=$1 and resource='kitchen'",[deliveryCater.id])).rows[0];
      assert.equal(Date.parse(window.ends_at)-Date.parse(window.starts_at),20*60000);assert.equal(Date.parse(approvedDelivery.scheduled_at)-Date.parse(window.ends_at),45*60000);
      await db.query("update public.orders set status='cancelled' where id=$1",[deliveryCater.id]);await db.query('update public.delivery_zones set travel_minutes=20,delivery_window_minutes=30 where id=$1',[zone]);await clear();
    });
    await t.test('delivery windows, per-zone/global capacity and large-order limits are configured',async()=>{
      const selection={fulfillment:'delivery',postal_code:'72100'},quote=await availability(selection);assert.equal(quote.delivery_window_minutes,30);
      assert.equal(Date.parse(quote.slots[0].ends_at)-Date.parse(quote.slots[0].starts_at),30*60000);
      assert.equal((await availability({...selection,quantity:3})).enabled,false);
      await create(request(quote,{...selection,delivery_zone_id:zone,address:'Testgatan 8',city:'Teststad'}));
      assert.ok(!(await availability(selection)).slots.some(slot=>slot.starts_at===quote.slots[0].starts_at));await clear();
    });
    await t.test('campaign inventory, cutoff and service dates are enforced even when campaign id is omitted',async()=>{
      const initial=await availability();const target=initial.slots[initial.slots.length-1];
      await db.query("insert into public.campaigns(id,title,starts_at,ends_at,menu_ids,active,fulfillment_dates,quantity_limit) values($1,'TEST säsong',clock_timestamp()-interval '1 day',clock_timestamp()+interval '30 days',array[$2::uuid],true,array[$3::date],2)",[campaign,menu,target.event_date]);
      const quote=await availability({quantity:2});assert.equal(quote.campaign_id,campaign);assert.ok(quote.slots.every(slot=>slot.event_date===target.event_date));
      const raced=await Promise.allSettled(Array.from({length:4},()=>create(request(quote,{quantity:2}))));assert.equal(raced.filter(result=>result.status==='fulfilled').length,1);
      assert.equal((await availability()).slots.length,0);const order=raced.find(result=>result.status==='fulfilled').value;
      await one("select public.settle_order_capacity_payment($1,'failed') saved",[order.id]);assert.ok((await availability()).slots.length>0);
      const fulfilled=await create(request(await availability({quantity:2}),{quantity:2}));
      await db.query("update public.orders set status='completed',payment_status='paid',capacity_status='confirmed' where id=$1",[fulfilled.id]);
      await one("select public.settle_order_capacity_payment($1,'refunded') saved",[fulfilled.id]);
      assert.equal((await availability()).slots.length,0,'Refunding fulfilled food must not restock campaign inventory');
      await db.query("update public.orders set status='cancelled' where id=$1",[fulfilled.id]);
      await db.query("update public.campaigns set order_cutoff_at=clock_timestamp()-interval '1 minute' where id=$1",[campaign]);assert.equal((await availability()).slots.length,0);
      await clear();
      // A service date beyond the old engine's first 500 candidates must still be reachable.
      const distant=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
      await db.query("update public.campaigns set active=true,order_cutoff_at=null,fulfillment_dates=array[$2::date] where id=$1",[campaign,distant]);
      assert.ok((await availability()).slots.some(slot=>slot.event_date===distant));await clear();
    });
    await t.test('private capacity APIs are invoker-only and inaccessible anonymously',async()=>{
      assert.equal((await db.query("select relrowsecurity from pg_class where relname='capacity_reservations'")).rows[0].relrowsecurity,true);
      assert.ok((await db.query("select prosecdef from pg_proc where proname in ('capacity_fits','reserve_order_capacity','transition_kitchen_order','create_manual_capacity_hold')")).rows.every(row=>!row.prosecdef));
      await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.capacity_reservations'),/permission denied/);await assert.rejects(availability(),/permission denied/);
    });
  }finally{await db.close();}
});

test('additive migration honours existing future obligations without repricing or rejecting overload',async()=>{
  const legacy=randomUUID(),past=randomUUID(),menu=randomUUID();const future='2030-01-02T12:00:00Z';
  const db=await database(async db=>{
    await db.query("insert into public.menus(id,slug,title,price_ore,active,direct_order_enabled,package_portions,preparation_minutes) values($1,'legacy-future','TEST befintlig',12900,true,true,2,20)",[menu]);
    for(const [id,scheduled] of [[legacy,future],[past,'2020-01-01T12:00:00Z']]) await db.query("insert into public.orders(id,code,tracking_hash,menu_id,menu_title,price_per_person_ore,guests,occasion,event_date,event_time,fulfillment,full_name,email,phone,subtotal_ore,total_ore,payment_preference,payment_status,status,order_type,package_quantity,scheduled_at,slot_interval_minutes) values($1,$2,$3,$4,'TEST befintlig',12900,2,'hemma',$5::timestamptz::date,'13:00','pickup','TEST kund','legacy@example.test','0700000000',12900,12900,'card','paid','approved','direct',1,$5,15)",[id,'CM-'+id.slice(0,10),'a'.repeat(64),menu,scheduled]);
  });
  try {
    const order=(await db.query('select * from public.orders where id=$1',[legacy])).rows[0];assert.equal(order.capacity_status,'confirmed');assert.equal(order.total_ore,12900);assert.equal(order.payment_status,'paid');assert.equal(order.status,'approved');assert.equal(Date.parse(order.scheduled_at),Date.parse(future));
    assert.equal((await db.query('select count(*)::int n from public.capacity_reservations where order_id=$1',[legacy])).rows[0].n,1);
    assert.equal((await db.query('select capacity_status from public.orders where id=$1',[past])).rows[0].capacity_status,null);
    await db.exec('update public.direct_order_settings set capacity_per_slot=1');
    assert.equal((await db.query("select public.capacity_fits('kitchen',null,$1::timestamptz-interval '10 minutes',$1::timestamptz,1) saved",[future])).rows[0].saved,false);
  }finally{await db.close();}
});
