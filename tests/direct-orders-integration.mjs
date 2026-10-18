// Real Next.js HTTP -> PostgREST -> PostgreSQL -> isolated signed payment simulator.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startTestEnvironment,testPackageId} from '../test-support/local/environment.mjs';

const isolated=await startTestEnvironment();const checks=[];let serial=0,networkSerial=0;
const call=async(route,method='GET',body,admin=false,headers={})=>{
  const response=await fetch(new URL(route,isolated.origin),{method,headers:{'Content-Type':'application/json',...(admin?{Cookie:isolated.adminCookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual'});
  const data=await response.json().catch(()=>null);return {status:response.status,data};
};
const availability=(input={})=>call('/api/availability','POST',{menu_id:testPackageId,quantity:1,fulfillment:'pickup',...input});
const input=(quote,overrides={})=>({request_id:randomUUID(),menu_id:testPackageId,quantity:1,fulfillment:'pickup',scheduled_at:quote.slots[0].starts_at,expected_total_ore:quote.total_ore,
  full_name:'Syntetisk Paketkund',email:`direct${++serial}@example.test`,phone:'0700000000',notes:'Enbart isolerad testdata',address:'',postal_code:'',city:'',payment_preference:'card',terms_accepted:true,...overrides});
const send=body=>call('/api/orders/direct','POST',body,false,{'x-forwarded-for':`127.0.10.${++networkSerial}`});
const getOrder=async receipt=>(await call(`/api/orders/${receipt.code}?token=${receipt.token}`)).data.order;
const row=receipt=>isolated.rows(`select * from public.orders where code='${receipt.code}'`)[0];
try {
  const catalog=await call('/api/catalog');assert.equal(catalog.status,200);assert.equal(catalog.data.test_mode,true);assert.equal(catalog.data.direct_orders_enabled,true);
  const menu=catalog.data.menus.find(menu=>menu.id===testPackageId);assert.equal(menu.direct_order_enabled,true);assert.equal(menu.package_portions,2);
  assert.equal((await call('/api/admin/scheduling')).status,401);const settingsResponse=await call('/api/admin/scheduling','GET',undefined,true);assert.equal(settingsResponse.status,200);
  const settings=settingsResponse.data.scheduling;
  let quote=(await availability()).data;assert.equal(quote.enabled,true);assert.equal(quote.total_ore,12900);assert.ok(quote.slots.length>0);assert.equal(quote.pickup_address,'Testgatan 1, Teststad');
  assert.ok(Date.parse(quote.slots[0].starts_at)>Date.parse(quote.server_now));assert.match(quote.slots[0].starts_at,/Z$/);
  checks.push('Server clock, configured address and synthetic package quote');
  const forged=await availability({p_now:'2020-01-01T00:00:00Z',server_now:'2020-01-01T00:00:00Z'});assert.ok(Date.parse(forged.data.server_now)>Date.parse('2026-01-01T00:00:00Z'));
  for(const method of ['swish','apple_pay','google_pay','card']) {
    quote=(await availability()).data;const body=input(quote,{payment_preference:method});
    const [created,retry]=await Promise.all([send(body),send(body)]);assert.ok([200,201].includes(created.status),created.data?.error);assert.ok([200,201].includes(retry.status),retry.data?.error);assert.equal(created.data.code,retry.data.code);
    const receipt=created.data,order=await getOrder(receipt);assert.equal(order.order_type,'direct');assert.equal(order.package_quantity,1);assert.equal(order.status,'approved');assert.equal(order.payment_status,'unpaid');assert.equal(order.total_ore,12900);assert.equal(order.items[0].unit_label,'paket');
    const mail=[...isolated.mails.values()].find(mail=>mail.subject.includes(receipt.code));assert.ok(mail);assert.match(mail.html,/1 paket · 2 portioner/);assert.match(mail.html,/mottagen och godkänd/);
    assert.equal(isolated.rows(`select count(*)::int n from public.orders where request_id='${body.request_id}'`)[0].n,1);
    const pay=await call('/api/payments/create','POST',{code:receipt.code,token:receipt.token,payment_method:method});assert.equal(pay.status,200,pay.data?.error);assert.equal(pay.data.test_mode,true);
    const url=new URL(pay.data.checkout_url,isolated.origin);assert.equal(url.origin,isolated.origin);assert.match(url.pathname,/^\/__test\/payment\//);
    assert.ok([200,303].includes((await call(`${url.pathname}/simulate`,'POST',{action:'success'},false,{Origin:isolated.origin})).status));
    assert.equal((await getOrder(receipt)).payment_status,'paid');checks.push(`Direct ${method}: idempotent reservation + simulated payment`);
  }
  quote=(await availability({quantity:4})).data;assert.equal(quote.subtotal_ore,51600);assert.equal(quote.preparation_minutes,25);
  const delivery=(await availability({fulfillment:'delivery',postal_code:'721 00'})).data;assert.equal(delivery.enabled,true);assert.equal(delivery.delivery_fee_ore,10000);assert.equal(delivery.total_ore,22900);
  const outside=(await availability({fulfillment:'delivery',postal_code:'99999'})).data;assert.equal(outside.enabled,false);assert.match(outside.reason,/hämtning/i);
  const deliveryOrder=await send(input(delivery,{fulfillment:'delivery',postal_code:'72100',address:'Syntetiska testgatan 8',city:'Teststad',delivery_zone_id:delivery.delivery_zone_id}));assert.equal(deliveryOrder.status,201,deliveryOrder.data?.error);assert.equal(row(deliveryOrder.data).delivery_fee_ore,10000);
  checks.push('Quantity price/prep and configured delivery zone/fee/travel');
  quote=(await availability()).data;const stale=input(quote);isolated.sql(`update public.menus set price_ore=13900 where id='${testPackageId}';`);assert.equal((await send(stale)).status,409);isolated.sql(`update public.menus set price_ore=12900 where id='${testPackageId}';`);
  assert.equal((await send(input(quote,{scheduled_at:'2020-01-01T12:00:00Z'}))).status,409);
  const paused=await call('/api/admin/scheduling','PATCH',{...settings,paused:true},true);assert.equal(paused.status,200);assert.equal((await availability()).data.enabled,false);assert.equal((await send(input(quote))).status,409);
  await call('/api/admin/scheduling','PATCH',settings,true);checks.push('Stale price, stale time and paused kitchen rechecked on save');
  quote=(await availability()).data;const blocked={starts_at:quote.slots[0].starts_at,ends_at:new Date(Date.parse(quote.slots[0].starts_at)+15*60000).toISOString()};
  await call('/api/admin/scheduling','PATCH',{...settings,blocked_slots:[blocked]},true);assert.ok(!(await availability()).data.slots.some(slot=>slot.starts_at===blocked.starts_at));
  await call('/api/admin/scheduling','PATCH',{...settings,capacity_per_slot:1},true);quote=(await availability()).data;
  const concurrent=Array.from({length:8},()=>input(quote));const raced=await Promise.all(concurrent.map(send));assert.equal(raced.filter(result=>result.status===201).length,1,JSON.stringify(raced.map(result=>result.status)));assert.equal(raced.filter(result=>result.status===409).length,7);
  assert.ok(!(await availability()).data.slots.some(slot=>slot.starts_at===quote.slots[0].starts_at));checks.push('Real concurrent PostgreSQL requests cannot oversell final capacity');
  const catering={request_id:randomUUID(),menu_id:testPackageId,guests:5,occasion:'hemma',event_date:new Date(Date.now()+10*86400000).toISOString().slice(0,10),event_time:'17:00',fulfillment:'pickup',full_name:'Syntetisk Cateringkund',email:'catering-regression@example.test',phone:'0700000000',notes:'Befintligt cateringflöde',payment_preference:'card',terms_accepted:true};
  const cater=await call('/api/orders','POST',catering,false,{'x-forwarded-for':'127.0.11.1'});assert.equal(cater.status,201,cater.data?.error);const old=await getOrder(cater.data);assert.equal(old.order_type,'catering');assert.equal(old.status,'new');assert.equal(old.total_ore,64500);checks.push('Catering retains per-person price and manual review');
  assert.equal((await call('/api/availability','POST',{menu_id:testPackageId,quantity:1,fulfillment:'pickup'},false,{Origin:'https://untrusted.example'})).status,403);
  console.log(`V4.4 direct HTTP/PostgreSQL integration: ${checks.length} checks passed\n${checks.map(check=>'  ✓ '+check).join('\n')}`);
} finally {await isolated.stop();}
