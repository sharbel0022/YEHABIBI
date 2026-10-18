import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

test('V4.4 PostgreSQL scheduling uses Stockholm instants and atomic package reservations',async t=>{
  const {PGlite}=await import('@electric-sql/pglite'); const db=new PGlite();
  const menuId=randomUUID(),zoneId=randomUUID();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);alter table storage.objects enable row level security;`);
    const directory=new URL('../supabase/migrations/',import.meta.url);
    for(const file of readdirSync(directory).filter(file=>file.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(file,directory),'utf8').replace('create extension if not exists pgcrypto;',''));
    const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0].saved;
    const initial=await one('select to_jsonb(s) saved from public.direct_order_settings s');
    assert.equal(initial.enabled,false);assert.equal(initial.weekly_hours.length,7);assert.ok(initial.weekly_hours.every(day=>day.closed));
    await db.exec("grant usage on schema public to service_role;grant all on all tables in schema public to service_role;set role service_role;update public.business_settings set pickup_address='Endast testadress',pickup_enabled=true,delivery_enabled=true,allow_unpaid_requests=true;");
    await db.query("insert into public.menus(id,slug,title,price_ore,min_people,active,direct_order_enabled,package_portions,preparation_minutes,extra_preparation_minutes,extra_preparation_every) values($1,'testpaket','TEST paket',12900,10,true,true,2,20,10,3)",[menuId]);
    await db.query("insert into public.delivery_zones(id,name,postal_prefixes,fee_ore,active,direct_enabled,travel_minutes) values($1,'TEST zon',array['721'],5000,true,true,25)",[zoneId]);
    const hours=(overrides={})=>Array.from({length:7},(_,weekday)=>({weekday,closed:false,opens_at:'10:00',closes_at:'22:00',cutoff_at:'21:45',pickup_from:'10:00',pickup_until:'22:00',delivery_from:'10:30',delivery_until:'22:00',...overrides}));
    const configure=async(overrides={})=>{
      const settings={enabled:true,paused:false,auto_approve:true,interval_minutes:15,min_advance_minutes:5,capacity_per_slot:4,capacity_buffer_minutes:0,max_days_ahead:2,weekly_hours:hours(),special_hours:[],blocked_slots:[],...overrides};
      await db.query('update public.direct_order_settings set enabled=$1,paused=$2,auto_approve=$3,interval_minutes=$4,min_advance_minutes=$5,capacity_per_slot=$6,capacity_buffer_minutes=$7,max_days_ahead=$8,weekly_hours=$9::jsonb,special_hours=$10::jsonb,blocked_slots=$11::jsonb where id=1',
        [settings.enabled,settings.paused,settings.auto_approve,settings.interval_minutes,settings.min_advance_minutes,settings.capacity_per_slot,settings.capacity_buffer_minutes,settings.max_days_ahead,JSON.stringify(settings.weekly_hours),JSON.stringify(settings.special_hours),JSON.stringify(settings.blocked_slots)]);
    };
    const availability=(now,input={})=>one('select public.get_direct_availability($1::jsonb,$2::timestamptz) saved',[JSON.stringify({menu_id:menuId,quantity:1,fulfillment:'pickup',...input}),now]);
    const liveAvailability=()=>one('select public.get_direct_availability($1::jsonb) saved',[JSON.stringify({menu_id:menuId,quantity:1,fulfillment:'pickup'})]);
    const request=(slot,overrides={})=>({id:randomUUID(),code:'CM-'+randomUUID().slice(0,12),tracking_hash:'a'.repeat(64),request_id:randomUUID(),request_hash:'b'.repeat(64),menu_id:menuId,quantity:1,fulfillment:'pickup',scheduled_at:slot,expected_total_ore:12900,full_name:'Test Kund',email:'test@example.test',phone:'0700000000',payment_preference:'card',...overrides});
    const create=input=>one('select public.create_direct_order($1::jsonb) saved',[JSON.stringify(input)]);
    await t.test('same-day package prep, quantity increments, minimum notice, buffers and interval ceiling',async()=>{
      await configure(); const quote=await availability('2026-10-18T10:07:00Z',{quantity:4});
      assert.equal(quote.preparation_minutes,30);assert.equal(quote.total_ore,51600);
      assert.equal(Date.parse(quote.slots[0].starts_at),Date.parse('2026-10-18T10:45:00Z'));assert.equal(quote.slots[0].event_time,'12:45');
      await configure({min_advance_minutes:90,capacity_buffer_minutes:10});
      assert.equal((await availability('2026-10-18T10:07:00Z')).slots[0].event_time,'13:45');
    });
    await t.test('late kitchen cutoff, closed weekdays, special closed dates and explicit blocked intervals',async()=>{
      await configure(); let quote=await availability('2026-10-18T19:40:00Z');
      assert.equal(quote.slots[0].event_date,'2026-10-19');assert.equal(quote.slots[0].event_time,'10:30');
      await configure({weekly_hours:hours({closed:true})});assert.deepEqual((await availability('2026-10-18T10:00:00Z')).slots,[]);
      await configure({special_hours:[{...hours()[0],date:'2026-10-18',closed:true}],blocked_slots:[{starts_at:'2026-10-19T08:00:00Z',ends_at:'2026-10-19T09:00:00Z'}]});
      quote=await availability('2026-10-18T10:00:00Z');assert.equal(quote.slots[0].event_time,'11:00');assert.equal(quote.slots[0].event_date,'2026-10-19');
    });
    await t.test('delivery requires a configured active zone and known transport duration',async()=>{
      await configure();let quote=await availability('2026-10-18T10:07:00Z',{fulfillment:'delivery',postal_code:'721 00'});
      assert.equal(quote.enabled,true);assert.equal(quote.delivery_fee_ore,5000);assert.equal(quote.total_ore,17900);assert.equal(quote.slots[0].event_time,'13:00');
      assert.equal((await availability('2026-10-18T10:07:00Z',{fulfillment:'delivery',postal_code:'99999'})).enabled,false);
      await db.query('update public.delivery_zones set travel_minutes=null where id=$1',[zoneId]);
      assert.equal((await availability('2026-10-18T10:07:00Z',{fulfillment:'delivery',postal_code:'72100'})).enabled,false);
      await db.query('update public.delivery_zones set travel_minutes=25 where id=$1',[zoneId]);
    });
    await t.test('spring DST omits nonexistent times; fall DST preserves both instants and offset labels',async()=>{
      await configure({weekly_hours:hours({opens_at:'00:00',closes_at:'06:00',cutoff_at:'05:59',pickup_from:'00:00',pickup_until:'06:00'}),min_advance_minutes:0});
      let quote=await availability('2026-03-28T23:00:00Z');let sameDay=quote.slots.filter(slot=>slot.event_date==='2026-03-29');
      assert.ok(sameDay.length>0);assert.ok(sameDay.every(slot=>!slot.event_time.startsWith('02:')));
      assert.ok(sameDay.some(slot=>slot.event_time==='03:00' && Date.parse(slot.starts_at)===Date.parse('2026-03-29T01:00:00Z')));
      quote=await availability('2026-10-24T22:00:00Z');const repeated=quote.slots.filter(slot=>slot.event_date==='2026-10-25' && slot.event_time==='02:30');
      assert.equal(repeated.length,2);assert.notEqual(repeated[0].starts_at,repeated[1].starts_at);assert.match(repeated[0].label,/CEST \+02:00/);assert.match(repeated[1].label,/CET \+01:00/);
    });
    await t.test('midnight overnight carry advances correctly and fully closed dates suppress carry',async()=>{
      const overnight=hours({opens_at:'22:00',closes_at:'02:00',cutoff_at:'01:45',pickup_from:'22:00',pickup_until:'02:00'});
      await configure({weekly_hours:overnight});let quote=await availability('2026-10-18T21:50:00Z');
      assert.equal(quote.slots[0].event_date,'2026-10-19');assert.equal(quote.slots[0].event_time,'00:15');
      await configure({weekly_hours:overnight,special_hours:[{...overnight[0],date:'2026-10-19',closed:true}]});
      quote=await availability('2026-10-18T21:50:00Z');assert.ok(quote.slots.every(slot=>slot.event_date!=='2026-10-19'));
      await configure({weekly_hours:overnight,special_hours:[{...hours()[0],date:'2026-10-19',opens_at:'10:00',closes_at:'12:00',cutoff_at:'11:45',pickup_from:'10:00',pickup_until:'12:00'}]});
      quote=await availability('2026-10-18T21:50:00Z');assert.equal(quote.slots[0].event_time,'10:30');assert.equal(quote.slots[0].event_date,'2026-10-19');
    });
    await t.test('fall boundaries keep continuous real time between earliest opening and final cutoff',async()=>{
      await configure({weekly_hours:hours({opens_at:'00:00',closes_at:'04:00',cutoff_at:'02:30',pickup_from:'00:00',pickup_until:'04:00'}),min_advance_minutes:0});
      let quote=await availability('2026-10-24T22:00:00Z');
      assert.ok(quote.slots.some(slot=>Date.parse(slot.starts_at)===Date.parse('2026-10-25T00:45:00Z')),'First 02:45 precedes final 02:30 cutoff');
      assert.ok(quote.slots.some(slot=>Date.parse(slot.starts_at)===Date.parse('2026-10-25T01:30:00Z')));
      assert.ok(!quote.slots.some(slot=>slot.event_date==='2026-10-25' && Date.parse(slot.starts_at)>Date.parse('2026-10-25T01:30:00Z')));
      await configure({weekly_hours:hours({opens_at:'02:30',closes_at:'04:00',cutoff_at:'04:00',pickup_from:'02:30',pickup_until:'04:00'}),min_advance_minutes:0});
      quote=await availability('2026-10-24T22:00:00Z');
      assert.ok(quote.slots.some(slot=>Date.parse(slot.starts_at)===Date.parse('2026-10-25T01:00:00Z')),'Second 02:00 occurs after first 02:30 opening');
    });
    await t.test('paused kitchen and 500-slot cap preserve the earliest chronological options',async()=>{
      await configure({paused:true});assert.equal((await availability('2026-10-18T10:00:00Z')).enabled,false);
      await configure({interval_minutes:5,max_days_ahead:10,weekly_hours:hours({opens_at:'00:00',closes_at:'23:59',cutoff_at:'23:59',pickup_from:'00:00',pickup_until:'23:59'})});
      const quote=await availability('2026-10-18T10:00:00Z');assert.equal(quote.slots.length,500);assert.equal(quote.slots[0].event_date,'2026-10-18');
      assert.ok(quote.slots.every((slot,index)=>index===0 || Date.parse(slot.starts_at)>Date.parse(quote.slots[index-1].starts_at)));
    });
    const allDay=hours({opens_at:'00:00',closes_at:'23:59',cutoff_at:'23:59',pickup_from:'00:00',pickup_until:'23:59'});
    await t.test('save rechecks price, prep, pause and slot freshness atomically',async()=>{
      await configure({weekly_hours:allDay});const quote=await liveAvailability(),slot=quote.slots[0].starts_at;
      await db.query('update public.menus set price_ore=14900 where id=$1',[menuId]);await assert.rejects(create(request(slot)),/Price changed/);
      await db.query('update public.menus set price_ore=12900,preparation_minutes=1440 where id=$1',[menuId]);await assert.rejects(create(request(slot)),/Slot unavailable/);
      await db.query('update public.menus set preparation_minutes=20 where id=$1',[menuId]);
      await configure({weekly_hours:allDay,paused:true});await assert.rejects(create(request(slot)),/Slot unavailable/);
      await configure({weekly_hours:allDay});await assert.rejects(create(request('2020-01-01T10:00:00Z')),/Slot unavailable/);
      assert.equal((await db.query("select count(*)::int n from public.orders where order_type='direct'")).rows[0].n,0);
    });
    await t.test('last capacity accepts one concurrent order; idempotent retry keeps its slot and snapshots',async()=>{
      await configure({weekly_hours:allDay,capacity_per_slot:1});const quote=await liveAvailability(),slot=quote.slots[0].starts_at;
      const inputs=Array.from({length:6},()=>request(slot));const results=await Promise.allSettled(inputs.map(create));
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.ok(results.filter(result=>result.status==='rejected').every(result=>/Slot unavailable/.test(String(result.reason))));
      const index=results.findIndex(result=>result.status==='fulfilled'),saved=results[index].value;
      assert.equal(saved.status,'approved');assert.equal(saved.payment_status,'unpaid');assert.equal(saved.order_type,'direct');assert.equal(saved.guests,2);
      assert.equal((await create(inputs[index])).id,saved.id);assert.equal((await create(inputs[index]))._created,false);
      const line=(await db.query('select quantity,unit_label,total_ore from public.order_items where order_id=$1',[saved.id])).rows[0];assert.deepEqual(line,{quantity:1,unit_label:'paket',total_ore:12900});
      assert.ok(!(await liveAvailability()).slots.some(option=>option.starts_at===slot));
      await db.query("update public.orders set status='cancelled' where id=$1",[saved.id]);assert.ok((await liveAvailability()).slots.some(option=>option.starts_at===slot));
      // Simulate each fold reservation in turn: overlapping intervals must behave symmetrically.
      await configure({weekly_hours:hours({opens_at:'00:00',closes_at:'04:00',cutoff_at:'04:00',pickup_from:'00:00',pickup_until:'04:00'}),interval_minutes:120,capacity_per_slot:1});
      for(const booked of ['2026-10-25T00:00:00Z','2026-10-25T01:00:00Z']) {
        await db.query("update public.orders set status='approved',scheduled_at=$2,slot_interval_minutes=120 where id=$1",[saved.id,booked]);
        await db.query("update public.capacity_reservations set state='confirmed',starts_at=$2::timestamptz-interval '120 minutes',ends_at=$2::timestamptz where order_id=$1 and resource='kitchen'",[saved.id,booked]);
        const folded=await availability('2026-10-24T22:00:00Z');
        assert.ok(folded.slots.every(option=>!['2026-10-25T00:00:00.000Z','2026-10-25T01:00:00.000Z'].includes(new Date(option.starts_at).toISOString())));
      }
    });
    await t.test('RLS and service-only invoker functions keep scheduling private',async()=>{
      assert.equal((await db.query("select relrowsecurity from pg_class where relname='direct_order_settings'")).rows[0].relrowsecurity,true);
      assert.ok((await db.query("select prosecdef from pg_proc where proname in ('create_direct_order','get_direct_availability')")).rows.every(row=>!row.prosecdef));
      for(const role of ['anon','authenticated']){await db.exec(`reset role;set role ${role}`);await assert.rejects(db.query('select * from public.direct_order_settings'),/permission denied/);await assert.rejects(availability('2026-10-18T10:00:00Z'),/permission denied/);}
    });
  } finally {await db.close();}
});
