import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {adminActionSchema,customerActionSchema,newOrderSchema,canTransition,eventDateBounds,menuSchema} from '../packages/shared/index.ts';
import {resolveCheckout} from '../apps/web/src/lib/checkout.ts';

test('V4: prisförslag kräver förklaring, kundacceptans kräver rätt revision',()=>{
  assert.equal(adminActionSchema.safeParse({action:'request_changes',proposed_total_ore:30000}).success,false);
  assert.equal(adminActionSchema.safeParse({action:'request_changes',admin_note:'Ny offert',proposed_total_ore:-1}).success,false);
  assert.equal(adminActionSchema.safeParse({action:'request_changes',admin_note:'Ny offert',proposed_total_ore:30000}).success,true);
  assert.equal(customerActionSchema.safeParse({action:'accept_changes',revision:2}).success,true);
  assert.equal(customerActionSchema.safeParse({action:'accept_changes',revision:1,total_ore:1}).success,false);
  assert.equal(customerActionSchema.safeParse({action:'register_push',push_token:'not-a-token'}).success,false);
  const base={items:[{dish_id:randomUUID(),quantity:2}],guests:5,occasion:'hemma',event_date:'2026-12-10',event_time:'12:00',fulfillment:'pickup',full_name:'Test Kund',email:'test@example.se',phone:'0701234567',payment_preference:'cash',terms_accepted:true};
  const request_id=randomUUID();
  assert.equal(newOrderSchema.parse({...base,request_id}).request_id,request_id);
  assert.equal(newOrderSchema.safeParse({...base,request_id:'reused'}).success,false);
});

test('V4: ägaren kan granska, men får aldrig kringgå kundens prisgodkännande',()=>{
  assert.equal(canTransition('new','review','unpaid','card'),true);
  assert.equal(canTransition('reviewing','approve','unpaid','card'),true);
  assert.equal(canTransition('changes_requested','approve','unpaid','card'),false);
  assert.equal(canTransition('approved','request_changes','pending','card'),false);
  assert.equal(canTransition('preparing','dispatched','unpaid','card'),false);
  assert.equal(canTransition('preparing','dispatched','paid','card'),true);
  assert.equal(canTransition('dispatched','complete','paid','card'),true);
  assert.equal(canTransition('approved','cancel','pending','card'),false);
  assert.equal(canTransition('reviewing','cancel','unpaid','cash'),true);
});

test('V4.1: gemensamma datumbounds och godkända relativa menybilder',()=>{
  assert.deepEqual(eventDateBounds(2,new Date('2026-10-17T22:30:00Z')),{min:'2026-10-20',max:'2027-10-18'});
  const menu={title:'Testmeny',description:'',included:[],allergens:[],price_ore:25000,min_people:6,active:false,sort_order:1};
  assert.equal(menuSchema.safeParse({...menu,image_url:'/images/mezze.webp'}).success,true);
  assert.equal(menuSchema.safeParse({...menu,image_url:'javascript:alert(1)'}).success,false);
});

test('V4: Stripe-sessionens återförsöksnyckel hör till godkänd prisrevision',async()=>{
  const keys=[];
  const order={id:randomUUID(),total_ore:30000,stripe_checkout_session_id:null,quote_revision:2};
  const gateway={retrieve:async()=>assert.fail('Ingen gammal session'),create:async(_,options)=>{
    keys.push(options.idempotencyKey);
    return {id:'cs_v4',status:'open',url:'https://checkout.stripe.com/v4',amount_total:order.total_ore,currency:'sek',client_reference_id:order.id,metadata:{order_id:order.id}};
  }};
  await resolveCheckout(order,gateway,{});
  await resolveCheckout(order,gateway,{});
  await resolveCheckout({...order,quote_revision:3},gateway,{});
  assert.equal(keys[0],keys[1]);
  assert.notEqual(keys[1],keys[2]);
});

test('V4: verifierad misslyckad asynkron betalning får en ny session; väntande betalning blockeras',async()=>{
  const order={id:randomUUID(),total_ore:30000,stripe_checkout_session_id:'cs_failed',payment_status:'failed'};
  let created=0;
  const gateway={retrieve:async()=>({id:'cs_failed',status:'complete'}),create:async()=>{
    created++;
    return {id:'cs_retry',status:'open',url:'https://checkout.stripe.com/retry',amount_total:order.total_ore,currency:'sek',client_reference_id:order.id,metadata:{order_id:order.id}};
  }};
  assert.equal((await resolveCheckout(order,gateway,{})).id,'cs_retry');
  for(const payment_status of ['pending','paid','unpaid','refunded']) await assert.rejects(resolveCheckout({...order,payment_status},gateway,{}),/behandlas redan/);
  assert.equal(created,1);
});

test('V4 SQL: återförsök, prisacceptans, webhookkö och privat åtkomst',async t=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text); alter table storage.objects enable row level security;`);
    const directory=new URL('../supabase/migrations/',import.meta.url);
    for(const file of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()) {
      await db.exec(readFileSync(new URL(file,directory),'utf8').replace('create extension if not exists pgcrypto;',''));
    }
    await db.exec('grant usage on schema public to service_role; grant all on all tables in schema public to service_role; set role service_role;');
    const dishId=randomUUID();
    await db.query("insert into public.dishes(id,title,price_ore,active) values($1,'Hummus',2500,true)",[dishId]);
    const items=[{dish_id:dishId,quantity:2}];
    const payload={id:randomUUID(),code:'CM-1234567890',tracking_hash:'a'.repeat(64),request_id:randomUUID(),request_hash:'b'.repeat(64),guests:5,occasion:'hemma',
      event_date:new Date(Date.now()+10*86400000).toISOString().slice(0,10),event_time:'12:00',fulfillment:'pickup',full_name:'Test Kund',email:'test@example.se',phone:'0701234567',notes:'',payment_preference:'card',subtotal_ore:5000,delivery_fee_ore:0};
    const call=async(sql,args)=>(await db.query(sql,args)).rows[0].saved;
    const create=async input=>call('select public.create_catering_order($1::jsonb,$2::jsonb) as saved',[JSON.stringify(input),JSON.stringify(items)]);
    let order;
    await t.test('samma återförsöksnyckel ger exakt en order; ändrad förfrågan avvisas',async()=>{
      order=await create(payload);
      const replay=await create({...payload,id:randomUUID(),code:'CM-0987654321',subtotal_ore:1});
      assert.equal(replay.id,order.id);assert.equal(replay._created,false);assert.equal(order._created,true);
      assert.equal((await db.query('select count(*)::int as count from public.orders')).rows[0].count,1);
      await assert.rejects(create({...payload,request_hash:'c'.repeat(64)}),/already used/);
      assert.equal(order.status,'new');assert.equal(order.payment_status,'unpaid');
    });
    const propose=(revision,total=6500)=>call('select public.propose_catering_change($1,$2,$3,$4) as saved',[order.id,revision,total,'Större portioner enligt överenskommelse.']);
    const accept=revision=>call('select public.accept_catering_change($1,$2) as saved',[order.id,revision]);
    const attach=()=>call('select public.attach_catering_checkout($1,$2,$3,$4,$5,$6) as saved',[order.id,'approved','unpaid',null,'cs_v4','https://checkout.stripe.com/v4']);
    await t.test('ändringsförslag ändrar inte pris eller rader före uttrycklig kundacceptans',async()=>{
      const proposal=await propose(1);
      assert.equal(proposal.total_ore,5000);assert.equal(proposal.proposal.total_ore,6500);
      assert.equal(proposal.proposal.price_adjustment_ore,1500);assert.equal(proposal.quote_revision,2);
      assert.equal(await accept(3),null);assert.equal(await propose(1),null);assert.equal(await attach(),null);
      const revised=await propose(2,7000);
      assert.equal(revised.proposal.revision,3);assert.equal(await accept(2),null);
      const approved=await accept(3);
      assert.equal(approved.status,'approved');assert.equal(approved._accepted,true);assert.equal(approved.payment_status,'unpaid');
      assert.equal(approved.total_ore,7000);assert.equal(approved.price_adjustment_ore,2000);assert.equal(approved.proposal,null);
      assert.equal((await accept(3))._accepted,false);
      assert.equal(approved.quote_history.length,2);
      const line=(await db.query('select unit_price_ore,total_ore from public.order_items where order_id=$1',[order.id])).rows[0];
      assert.equal(line.unit_price_ore,2500);assert.equal(line.total_ore,5000);
      assert.equal((await attach()).payment_status,'pending');
    });
    const event=(id,kind,session='cs_v4',intent='pi_v4')=>call('select public.apply_stripe_event($1,$2,$3,$4,$5) as saved',[id,kind,order.id,session,intent]);
    await t.test('webhook stämmer av rätt session och skapar bara en notifiering per betalläge',async()=>{
      await assert.rejects(event('evt_wrong','paid','cs_wrong'),/does not match/);
      await assert.rejects(event('evt_null','paid',null,null),/does not match/);
      assert.equal(await event('evt_paid','paid'),true);
      assert.equal(await event('evt_paid','paid'),false);
      assert.equal(await event('evt_paid_2','paid'),false);
      assert.equal(await event('evt_late_failure','failed'),false);
      assert.equal((await db.query('select payment_status from public.orders where id=$1',[order.id])).rows[0].payment_status,'paid');
      assert.equal((await db.query("select count(*)::int as count from public.order_notifications where kind='paid'")).rows[0].count,1);
      assert.equal(await event('evt_refund','refunded',null),true);
      assert.equal(await event('evt_refund','refunded',null),false);
      assert.equal((await db.query("select count(*)::int as count from public.order_notifications where kind in ('paid','refunded')")).rows[0].count,2);
      assert.equal((await db.query('select payment_status from public.orders where id=$1',[order.id])).rows[0].payment_status,'refunded');
    });
    await t.test('kontantorder förblir obetald och kan aldrig stämmas av genom Stripe',async()=>{
      const cash=await create({...payload,id:randomUUID(),code:'CM-1122334455',request_id:randomUUID(),payment_preference:'cash'});
      assert.equal(cash.payment_status,'unpaid');assert.equal(cash.checkout_url,null);
      await assert.rejects(db.query('select public.apply_stripe_event($1,$2,$3,$4,$5)',['evt_cash','paid',cash.id,null,null]),/does not match/);
    });
    await t.test('V4.1: inställningar bevarar nya zoners ID och aktivering',async()=>{
      const id=randomUUID();
      await db.query("insert into public.delivery_zones(id,name,postal_prefixes,fee_ore,active) values($1,'Modern zon',array['721'],10000,true)",[id]);
      await db.query("update public.delivery_zones set active=false where legacy_key='base'");
      await db.query('select public.update_catering_settings($1::jsonb)',[JSON.stringify({contact_phone:'0700000000',delivery_zones:[]})]);
      const zone=(await db.query('select id,active,fee_ore from public.delivery_zones where id=$1',[id])).rows[0];
      assert.equal(zone.id,id);assert.equal(zone.active,true);assert.equal(zone.fee_ore,10000);
      assert.equal((await db.query("select active from public.delivery_zones where legacy_key='base'")).rows[0].active,false);
      await db.query("update public.delivery_zones set active=true where legacy_key='base'");
      for(const enabled of [false,true]) {
        await db.query('select public.update_catering_settings($1::jsonb)',[JSON.stringify({delivery_enabled:enabled,delivery_zones:[]})]);
        assert.equal((await db.query("select active from public.delivery_zones where legacy_key='base'")).rows[0].active,true);
      }
    });
    await t.test('V4.1: köade besked bevarar snapshot; avstämd gammal webhook är idempotent',async()=>{
      const queued=(await db.query("select payload from public.order_notifications where order_id=$1 and kind='new'",[order.id])).rows[0].payload;
      assert.equal(queued.total_ore,5000);assert.equal(queued.status,'new');
      await db.query("update public.orders set stripe_checkout_session_id='cs_later' where id=$1",[order.id]);
      assert.equal(await event('evt_paid','paid','cs_v4'),false);
      const before=Number((await db.query('select count(*) as count from public.order_notifications')).rows[0].count);
      await db.exec('begin');
      await db.query("update public.orders set status='preparing' where id=$1",[order.id]);
      await db.exec('rollback');
      assert.equal(Number((await db.query('select count(*) as count from public.order_notifications')).rows[0].count),before);
    });
    await t.test('RLS, funktionsbehörighet och tokenvalidering skyddar order och notifieringar',async()=>{
      await assert.rejects(db.query('insert into public.order_push_tokens(order_id,token) values($1,$2)',[order.id,'bad']),/check constraint/);
      const register=token=>call('select public.register_catering_push($1,$2) as saved',[order.id,token]);
      for(let i=0;i<5;i++) assert.equal(await register(`ExpoPushToken[valid_test_device_${i}]`),true);
      assert.equal(await register('ExpoPushToken[valid_test_device_0]'),true);
      assert.equal(await register('ExpoPushToken[valid_test_device_6]'),false);
      assert.equal(await register('bad'),false);
      const functions=(await db.query("select proname,prosecdef from pg_proc where proname in ('create_catering_order','propose_catering_change','accept_catering_change','apply_stripe_event')")).rows;
      assert.equal(functions.length,4);assert.ok(functions.every(fn=>!fn.prosecdef));
      const rls=(await db.query("select relrowsecurity from pg_class where relname in ('order_push_tokens','order_notifications')")).rows;
      assert.equal(rls.length,2);assert.ok(rls.every(row=>row.relrowsecurity));
      for(const role of ['anon','authenticated']) {
        await db.exec(`reset role; set role ${role}`);
        for(const table of ['orders','order_items','order_push_tokens','order_notifications']) await assert.rejects(db.query(`select * from public.${table}`),/permission denied/);
        await assert.rejects(accept(3),/permission denied/);
        await assert.rejects(propose(3),/permission denied/);
        await assert.rejects(register('ExpoPushToken[valid_test_device_0]'),/permission denied/);
      }
    });
  } finally { await db.close(); }
});
