import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { calcDishTotal, findDeliveryZone, canTransition, newOrderSchema, campaignSchema, zoneSchema } from '../packages/shared/index.ts';


const dishId = '44444444-4444-4444-8444-000000000001';
const otherDishId = '44444444-4444-4444-8444-000000000002';
const menuId = '11111111-1111-4111-8111-111111111111';
const zoneId = '55555555-5555-4555-8555-555555555555';
const dishes = [{id:dishId,title:'Hummus',price_ore:2500,active:true},{id:otherDishId,title:'Falafel',price_ore:4000,active:true}];
const zones = [{id:zoneId,name:'Västerås',postal_prefixes:['721','722'],fee_ore:9900,active:true}];
const selections = [{dish_id:dishId,quantity:2},{dish_id:otherDishId,quantity:3}];

test('egna maträtter: styckpris, radpris, leverans och pris per person',()=>{
  const totals = calcDishTotal(selections,dishes,5,'delivery',9900);
  assert.equal(totals.subtotal_ore,17000);
  assert.equal(totals.total_ore,26900);
  assert.equal(totals.price_per_person_ore,5380);
  assert.deepEqual(totals.lines.map(line=>line.total_ore),[5000,12000]);
  assert.equal(calcDishTotal(selections,dishes,5,'pickup',9900).delivery_fee_ore,0);
});
test('fiktiv catering för fem: 12×25 + 2×90 + 8×65 + 100 leverans = 1100 kr',()=>{
  const sample=[{id:dishId,title:'Testostrullar',price_ore:2500,active:true},{id:otherDishId,title:'Testhummus',price_ore:9000,active:true},{id:menuId,title:'Testkafta',price_ore:6500,active:true}];
  const choices=sample.map((dish,index)=>({dish_id:dish.id,quantity:[12,2,8][index]}));
  const total=calcDishTotal(choices,sample,5,'delivery',10000);
  assert.deepEqual(total.lines.map(line=>line.total_ore),[30000,18000,52000]);
  assert.equal(total.subtotal_ore,100000);assert.equal(total.delivery_fee_ore,10000);
  assert.equal(total.total_ore,110000);assert.equal(total.price_per_person_ore,22000);
  assert.equal(calcDishTotal(choices,sample,5,'pickup',10000).price_per_person_ore,20000);
});
test('egna maträtter avvisar dubbla rader, dolda rätter, saknat pris och fel antal',()=>{
  assert.throws(()=>calcDishTotal([...selections,selections[0]],dishes,5,'pickup',0));
  assert.throws(()=>calcDishTotal(selections,[{...dishes[0],active:false},dishes[1]],5,'pickup',0));
  assert.throws(()=>calcDishTotal(selections,[{...dishes[0],price_ore:0},dishes[1]],5,'pickup',0));
  for(const quantity of [0,-1,0.5,1001,Infinity]) assert.throws(()=>calcDishTotal([{dish_id:dishId,quantity}],dishes,5,'pickup',0));
});
test('leveranszon måste vara aktiv och matcha ett riktigt svenskt postnummer',()=>{
  assert.equal(findDeliveryZone(zones,'721 30',zoneId)?.fee_ore,9900);
  assert.equal(findDeliveryZone(zones,'72330',zoneId),null);
  assert.equal(findDeliveryZone(zones,'721',zoneId),null);
  assert.equal(findDeliveryZone([{...zones[0],active:false}],'72130',zoneId),null);
  assert.equal(findDeliveryZone(zones,'72130',menuId),null);
  assert.equal(zoneSchema.safeParse({...zones[0],postal_prefixes:['72%']}).success,false);
});
test('order väljer paket ELLER egna rätter; klientbelopp används inte',()=>{
  const base = {guests:5,occasion:'hemma',event_date:'2026-12-10',event_time:'12:00',fulfillment:'pickup',full_name:'Test Kund',email:'kund@example.se',phone:'0701234567',payment_preference:'cash',terms_accepted:true};
  assert.equal(newOrderSchema.safeParse(base).success,false);
  assert.equal(newOrderSchema.safeParse({...base,menu_id:menuId,items:selections}).success,false);
  assert.equal(newOrderSchema.safeParse({...base,items:[...selections,selections[0]]}).success,false);
  const parsed = newOrderSchema.parse({...base,items:selections,total_ore:1,payment_status:'paid'});
  assert.equal('total_ore' in parsed,false);
  assert.equal('payment_status' in parsed,false);
  assert.deepEqual(newOrderSchema.parse({...base,menu_id:null,items:[{item_id:dishId,quantity:2}]}).items,[{dish_id:dishId,quantity:2}]);
  assert.equal(newOrderSchema.safeParse({...base,items:[{item_id:dishId,quantity:2},{dish_id:dishId,quantity:3}]}).success,false);
  assert.equal(newOrderSchema.safeParse({...base,items:[{item_id:dishId,quantity:101}]}).success,false);
});
test('förberedelse kräver godkännande och obetalda kortorder kan inte slutföras',()=>{
  assert.equal(canTransition('new','preparing','paid','card'),false);
  assert.equal(canTransition('approved','preparing','unpaid','card'),false);
  assert.equal(canTransition('approved','preparing','paid','card'),true);
  assert.equal(canTransition('approved','preparing','unpaid','cash'),true);
  assert.equal(canTransition('preparing','complete','unpaid','cash'),false);
  assert.equal(canTransition('preparing','cash_paid','unpaid','cash'),true);
  assert.equal(canTransition('preparing','cash_paid','unpaid','card'),false);
  assert.equal(canTransition('preparing','complete','paid','card'),true);
  assert.equal(canTransition('rejected','ready','paid','card'),false);
});
test('kampanjperiod valideras',()=>{
  const campaign = {title:'Julcatering',description:'',media_url:null,starts_at:'2026-12-01T00:00:00Z',ends_at:'2026-12-24T00:00:00Z',menu_ids:[menuId],active:true};
  assert.equal(campaignSchema.safeParse(campaign).success,true);
  assert.equal(campaignSchema.safeParse({...campaign,ends_at:campaign.starts_at}).success,false);
});

// V4.3 ersätter de gamla Stripe-checkouttesten. Provideroberoende återförsök,
// signerade händelser och statuskontroll provas i payments.test.mjs/payment-db.test.mjs.

// PostgreSQL/WASM är endast ett utvecklingsberoende. Verklig Supabase Auth/Storage
// och fjärrmiljön måste dessutom verifieras separat före publicering.
test('SQL: atomär order, databaspriser, leveranszon, obetald status och service-role-behörighet',async()=>{
  const {PGlite} = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    // Supabase hanterar dessa roller/scheman i skarp miljö. Här ersätts endast plattformsskalet.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text); alter table storage.objects enable row level security;`);
    const v1 = readFileSync(new URL('../supabase/migrations/0001_cedar_mezze.sql',import.meta.url),'utf8').replace('create extension if not exists pgcrypto;','');
    await db.exec(v1);
    await db.exec(readFileSync(new URL('../supabase/migrations/0002_cedar_mezze_v2.sql',import.meta.url),'utf8'));
    const legacyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const removedId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const legacyOrderId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const snapshot = [
      {item_id:legacyId,title:'Historisk kafta',quantity:3,unit_label:'spett',unit_price_ore:2000,line_total_ore:6000},
      {item_id:removedId,title:'Senare borttagen rätt',quantity:1,unit_label:'fat',unit_price_ore:4000,line_total_ore:4000}
    ];
    await db.query("insert into public.menu_items(id,title,category,unit_label,unit_price_ore,suggested_per_person,active) values($1,'V2-kafta','grill','spett',9000,1.5,true)",[legacyId]);
    await db.query(`insert into public.orders(id,code,tracking_hash,menu_title,price_per_person_ore,guests,occasion,event_date,event_time,fulfillment,full_name,email,phone,subtotal_ore,total_ore,payment_preference,items_snapshot)
      values($1,'CM-ABCDEF1234',$2,'Gammal egen meny',2000,5,'hemma','2026-12-10','12:00','pickup','Test Kund','test@example.se','0701234567',10000,10000,'cash',$3)`,[legacyOrderId,'a'.repeat(64),JSON.stringify(snapshot)]);
    await db.query(`update public.business_settings set delivery_fee_ore=14900,delivery_zones=$1,campaign_title='Jul V2',campaign_description='Sparad kampanj',campaign_enabled=true,campaign_start_date='2026-12-01',campaign_end_date='2026-12-31' where id=1`,[JSON.stringify([{name:'Västerås',postal_prefix:'72',fee_ore:9900},{name:'Centrum',postal_prefix:'722',fee_ore:4900}])]);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261017121516_v3_catalog_and_orders.sql',import.meta.url),'utf8'));
    const migrated = (await db.query('select id,title,price_ore,portion_label,category,suggested_per_person from public.dishes where id=$1',[legacyId])).rows[0];
    assert.equal(migrated.id,legacyId);assert.equal(migrated.price_ore,9000);assert.equal(migrated.portion_label,'spett');assert.equal(migrated.category,'grill');assert.equal(Number(migrated.suggested_per_person),1.5);
    assert.deepEqual((await db.query('select items_snapshot from public.orders where id=$1',[legacyOrderId])).rows[0].items_snapshot,snapshot);
    const history = (await db.query('select dish_id,item_id,unit_price_ore,total_ore from public.order_items where order_id=$1 order by total_ore desc',[legacyOrderId])).rows;
    assert.equal(history.length,2);assert.equal(history[0].unit_price_ore,2000);assert.equal(history[0].total_ore,6000);
    assert.equal(history[1].dish_id,null);assert.equal(history[1].item_id,removedId);
    const importedZones = (await db.query('select id,name,postal_prefixes,fee_ore,active from public.delivery_zones')).rows;
    assert.equal(findDeliveryZone(importedZones,'722 12').fee_ore,4900);
    assert.equal(findDeliveryZone(importedZones,'723 12').fee_ore,9900);
    assert.equal(findDeliveryZone(importedZones,'831 00').fee_ore,14900);
    assert.equal((await db.query("select title from public.campaigns where legacy_key='settings'")).rows[0].title,'Jul V2');
    await db.exec(`grant usage on schema public to service_role; grant all on all tables in schema public to service_role;
      insert into public.dishes(id,slug,title,price_ore,active) values ('${dishId}','hummus','Hummus',2500,true),('${otherDishId}','falafel','Falafel',4000,true);
      insert into public.menus(id,slug,title,price_ore,min_people,active) values ('${menuId}','mezze','Mezze',27900,10,true);
      insert into public.delivery_zones(id,name,postal_prefixes,fee_ore,active) values ('${zoneId}','Västerås',array['721'],9900,true);`);
    const date = new Date(Date.now()+10*86400000).toISOString().slice(0,10);
    const payload = (extra={}) => ({id:randomUUID(),code:`CM-${randomUUID().slice(0,8)}`,tracking_hash:'a'.repeat(64),guests:5,occasion:'hemma',event_date:date,event_time:'12:00',fulfillment:'delivery',address:'Testvägen 1',postal_code:'721 30',city:'Västerås',full_name:'Test Kund',email:'test@example.se',phone:'0701234567',notes:'',payment_preference:'card',delivery_zone_id:zoneId,subtotal_ore:17000,delivery_fee_ore:9900,...extra});
    const create = async (order,items=selections) => (await db.query('select public.create_catering_order($1::jsonb,$2::jsonb) as saved',[JSON.stringify(order),JSON.stringify(items)])).rows[0].saved;
    const count = async () => Number((await db.query('select count(*) as count from public.orders')).rows[0].count);
    await db.exec('set role service_role');
    // V2:s uppdateringsbara vy skriver samma tabell som V3/Expo.
    await db.query('update public.menu_items set unit_price_ore=9500,unit_label=$2 where id=$1',[legacyId,'stort spett']);
    assert.equal((await db.query('select price_ore from public.dishes where id=$1',[legacyId])).rows[0].price_ore,9500);
    const compatibilityInsert = (await db.query("insert into public.menu_items(title,category,unit_label,unit_price_ore) values('Ny V2-rätt','dessert','bit',3500) returning id")).rows[0].id;
    assert.equal((await db.query('select portion_label from public.dishes where id=$1',[compatibilityInsert])).rows[0].portion_label,'bit');
    const saved = await create(payload({total_ore:1,payment_status:'paid',status:'approved'}));
    assert.equal(saved.total_ore,26900);assert.equal(saved.status,'new');assert.equal(saved.payment_status,'unpaid');
    const lines = (await db.query('select title,quantity,total_ore from public.order_items where order_id=$1 order by title',[saved.id])).rows;
    assert.deepEqual(lines.map(line=>line.total_ore),[12000,5000]);
    const before = await count();
    await assert.rejects(create(payload({subtotal_ore:1})),/Price changed/);
    await assert.rejects(create(payload({postal_code:'99999'})),/outside delivery zone/);
    await assert.rejects(create(payload({payment_preference:'cash'})),/Cash requires pickup/);
    await assert.rejects(create(payload(),[selections[0],selections[0]]),/Duplicate/);
    await assert.rejects(create(payload({guests:4})),/minimum guests/);
    assert.equal(await count(),before);
    const cash = await create(payload({menu_id:menuId,guests:10,fulfillment:'pickup',payment_preference:'cash',subtotal_ore:279000,delivery_fee_ore:0}),[]);
    assert.equal(cash.total_ore,279000);assert.equal(cash.delivery_fee_ore,0);assert.equal(cash.payment_status,'unpaid');
    await assert.rejects(db.query('select public.apply_stripe_event($1,$2,$3,$4,$5)',['evt_unrelated','paid',cash.id,'cs_wrong',null]),/does not match/);
    const cashAfter = (await db.query('select payment_status from public.orders where id=$1',[cash.id])).rows[0];
    assert.equal(cashAfter.payment_status,'unpaid');
    await db.query("update public.orders set status='approved',payment_status='pending',stripe_checkout_session_id='cs_test_verified' where id=$1",[saved.id]);
    const paidArgs = ['evt_paid_once','paid',saved.id,'cs_test_verified','pi_test_verified'];
    assert.equal((await db.query('select public.apply_stripe_event($1,$2,$3,$4,$5) as applied',paidArgs)).rows[0].applied,true);
    assert.equal((await db.query('select public.apply_stripe_event($1,$2,$3,$4,$5) as applied',paidArgs)).rows[0].applied,false);
    await db.query('select public.apply_stripe_event($1,$2,$3,$4,$5)',['evt_late_failure','failed',saved.id,'cs_test_verified',null]);
    assert.equal((await db.query('select payment_status from public.orders where id=$1',[saved.id])).rows[0].payment_status,'paid');
    const attach = async (expectedSession='cs_test_verified') => (await db.query('select public.attach_catering_checkout($1,$2,$3,$4,$5,$6) as saved',[saved.id,'approved','pending',expectedSession,'cs_new','https://checkout.stripe.com/new'])).rows[0].saved;
    assert.equal(await attach(),null); // Ett betalt webhookresultat får inte skrivas över.
    assert.equal((await db.query('select payment_status from public.orders where id=$1',[saved.id])).rows[0].payment_status,'paid');
    await db.query("update public.orders set payment_status='pending',stripe_checkout_session_id='cs_current' where id=$1",[saved.id]);
    assert.equal(await attach(),null); // En nyare session får inte skrivas över från gammal snapshot.
    assert.equal((await db.query('select stripe_checkout_session_id from public.orders where id=$1',[saved.id])).rows[0].stripe_checkout_session_id,'cs_current');
    assert.equal((await attach('cs_current')).stripe_checkout_session_id,'cs_new');
    // Framtvingat fel EFTER order-INSERT måste rulla tillbaka även ordern.
    await db.exec(`reset role; create function public.test_line_failure() returns trigger language plpgsql as $$ begin raise exception 'Simulated line failure'; end; $$;
      create trigger test_line_failure before insert on public.order_items for each row execute function public.test_line_failure(); set role service_role;`);
    const beforeFailure = await count();
    await assert.rejects(create(payload()),/Simulated line failure/);
    assert.equal(await count(),beforeFailure);
    await db.exec('reset role; drop trigger test_line_failure on public.order_items; drop function public.test_line_failure();');
    // Gamla inställnings-API:t uppdaterar nu normaliserade zoner/kampanjer atomärt.
    const extraCampaign = (await db.query("insert into public.campaigns(title,starts_at,ends_at) values('Ny V3-kampanj','2026-01-01','2027-01-01') returning id")).rows[0].id;
    await db.exec('set role service_role');
    await db.query('select public.update_catering_settings($1::jsonb)',[JSON.stringify({delivery_fee_ore:7900,delivery_zones:[{name:'Ny zon',postal_prefix:'721',fee_ore:1900}],campaign_title:'Ändrad V2-kampanj'})]);
    assert.equal((await db.query("select fee_ore from public.delivery_zones where legacy_key='base'")).rows[0].fee_ore,7900);
    assert.equal((await db.query("select fee_ore from public.delivery_zones where legacy_key='prefix:721' and active")).rows[0].fee_ore,1900);
    assert.equal((await db.query("select active from public.delivery_zones where legacy_key='prefix:722'")).rows[0].active,false);
    assert.equal((await db.query("select title from public.campaigns where legacy_key='settings'")).rows[0].title,'Ändrad V2-kampanj');
    assert.equal((await db.query('select title from public.campaigns where id=$1',[extraCampaign])).rows[0].title,'Ny V3-kampanj');
    await assert.rejects(db.query('select public.update_catering_settings($1::jsonb)',[JSON.stringify({contact_phone:'must rollback',delivery_zones:[{name:'Bad',postal_prefix:'%',fee_ore:1}]})]),/check constraint/);
    assert.equal((await db.query('select contact_phone from public.business_settings where id=1')).rows[0].contact_phone,'');
    await db.exec('reset role');
    const security = (await db.query("select prosecdef from pg_proc where proname='create_catering_order'")).rows[0];
    assert.equal(security.prosecdef,false);
    assert.ok((await db.query("select reloptions from pg_class where relname='menu_items'")).rows[0].reloptions.includes('security_invoker=true'));
    const rls = (await db.query("select relname,relrowsecurity from pg_class where relname in ('dishes','campaigns','delivery_zones','orders','order_items','owner_push_tokens')")).rows;
    assert.equal(rls.length,6);assert.ok(rls.every(row=>row.relrowsecurity));
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.orders'),/permission denied/);
    await assert.rejects(db.query('select * from public.menu_items'),/permission denied/);
    await assert.rejects(create(payload()),/permission denied/);
  } finally { await db.close(); }
});
