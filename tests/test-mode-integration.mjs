// Real HTTP/PostgREST/PostgreSQL with the private simulator overlay. No provider network.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanProcessEnvironment, repositoryRoot, startTestEnvironment, testDishes,testPackageId } from '../test-support/local/environment.mjs';

const isolated = await startTestEnvironment();
// This script creates many independent catering examples in one shared future interval.
isolated.sql('update public.direct_order_settings set capacity_per_slot=1000,delivery_capacity_per_slot=1000;update public.delivery_zones set capacity_per_slot=1000;');
const packed={packages:true,extras:true,sauces_bread:true,allergen_labels:true,order_number:true};
let created = 0;
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
const call = async (route, method = 'GET', body, admin = false, extra = {}) => {
  const response = await fetch(new URL(route, isolated.origin), { method,
    headers: { 'Content-Type': 'application/json', ...(admin ? { Cookie: isolated.adminCookie } : {}), ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual' });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = null; }
  return { status: response.status, data, text };
};
const status = receipt => call(`/api/orders/${receipt.code}?token=${receipt.token}`).then(result => result.data.order || result.data);
const row = receipt => isolated.rows(`select * from public.orders where code='${receipt.code}'`)[0];
const action = async (receipt, value) => {
  const result = await call(`/api/admin/orders/${row(receipt).id}`, 'PATCH', value, true);
  assert.equal(result.status, 200, `Admin ${value.action}: ${result.data?.error || result.status}`); return result;
};
const create = async (preference = 'swish', overrides = {}) => {
  created++;
  const input = { request_id: randomUUID(), items: [{ dish_id: testDishes[0].id, quantity: 12 }, { dish_id: testDishes[1].id, quantity: 2 }],
    guests: 5, occasion: 'hemma', event_date: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10), event_time: '17:30', fulfillment: 'pickup',
    full_name: `Syntetisk Kund ${created}`, email: `customer${created}@example.test`, phone: '0700000000', notes: 'Endast lokal testdata', payment_preference: preference, terms_accepted: true, ...overrides };
  const headers = { 'x-forwarded-for': `127.0.1.${created}` };
  const responses = await Promise.all([call('/api/orders', 'POST', input, false, headers), call('/api/orders', 'POST', input, false, headers)]);
  assert.ok(responses.every(result => [200, 201].includes(result.status)), `Order ${created}: ${responses.map(item => item.data?.error || item.status).join(',')}`);
  const receipt = responses[0].data;
  assert.equal(receipt.code, responses[1].data.code, 'Concurrent retry reuses order');
  assert.equal(isolated.rows(`select count(*)::int as n from public.orders where request_id='${input.request_id}'`)[0].n, 1);
  assert.equal(row(receipt).total_ore, 48000);
  assert.equal(row(receipt).status, 'new'); assert.equal(row(receipt).payment_status, 'unpaid');
  return receipt;
};
const checkout = async (receipt, method) => {
  const result = await call('/api/payments/create', 'POST', { code: receipt.code, token: receipt.token, payment_method: method });
  assert.equal(result.status, 200, `Checkout ${method}: ${result.data?.error || result.status}`);
  assert.equal(result.data.test_mode, true);
  const url = new URL(result.data.checkout_url, isolated.origin);
  assert.equal(url.origin, isolated.origin); assert.match(url.pathname, /^\/__test\/payment\//);
  return url.pathname;
};
const simulate = async (sessionPath, simulation) => {
  const result = await call(`${sessionPath}/simulate`, 'POST', { action: simulation }, false, { Origin: isolated.origin });
  assert.ok([200, 303].includes(result.status), `Simulation ${simulation}: ${result.data?.error || result.status}`);
  await isolated.waitFor(()=>isolated.rows("select count(*)::int n from public.background_jobs where kind='payment_event' and status<>'completed'")[0].n===0);
  return result;
};
try {
  const types = spawnSync(process.execPath, [path.join(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--noEmit'], { cwd: isolated.web, env: cleanProcessEnvironment(), encoding: 'utf8', windowsHide: true });
  assert.equal(types.status, 0, `Isolated overlay typecheck: ${types.stdout || types.stderr}`); checks.push('Isolated overlay and simulator typecheck');
  const clean = cleanProcessEnvironment();
  check('No production credentials inherited', !Object.keys(clean).some(key => /ADYEN|SUPABASE|RESEND|PAYMENT|EXPO_PUBLIC/.test(key)));
  check('No env files copied', !fs.readdirSync(isolated.web).some(name => name === '.env' || name.startsWith('.env.')));
  check('Real Adyen remains off', isolated.webEnv.PAYMENTS_ENABLED === 'false' && isolated.webEnv.PAYMENTS_LIVE_APPROVED === 'false' && !isolated.webEnv.ADYEN_API_KEY);
  const catalog = await call('/api/catalog');
  assert.equal(catalog.status, 200); assert.equal(catalog.data.test_mode, true); assert.equal(catalog.data.demo, false); assert.equal(catalog.data.orders_enabled, true);
  check('Five exact database menu prices', JSON.stringify(catalog.data.dishes.map(dish => dish.price_ore).sort((a, b) => a - b)) === JSON.stringify([2000, 2500, 3500, 6500, 9000]));
  check('Separate local database attestation', isolated.rows('select isolation_id from public.test_environment_guard')[0].isolation_id === isolated.isolationId);
  check('Unauthenticated admin rejected', (await call('/api/admin/orders/not-authorized', 'PATCH', { action: 'approve' })).status === 401);
  const inboxResponse = await fetch(isolated.inbox); assert.equal(inboxResponse.status, 401);
  const loginBad = await fetch(isolated.adminLogin, { method: 'POST', body: new URLSearchParams({ password: 'wrong' }), redirect: 'manual' }); assert.equal(loginBad.status, 401);
  const login = await fetch(isolated.adminLogin, { method: 'POST', body: new URLSearchParams({ password: isolated.adminPassword }), redirect: 'manual' }); assert.equal(login.status, 303); assert.ok(login.headers.get('set-cookie')?.includes('HttpOnly'));
  checks.push('Password login and private inbox authorization');
  for (const method of ['swish', 'apple_pay', 'google_pay', 'card']) {
    const receipt = await create(method);
    const premature = await call('/api/payments/create', 'POST', { code: receipt.code, token: receipt.token, payment_method: method }); assert.equal(premature.status, 409);
    await action(receipt, { action: 'approve' }); assert.equal(row(receipt).provider_payment_id, null);
    const path = await checkout(receipt, method);
    const repeated = await checkout(receipt, method); assert.equal(repeated, path);
    await simulate(path, 'success'); assert.equal(row(receipt).payment_status, 'paid');
    await simulate(path, 'duplicate'); assert.equal(row(receipt).payment_status, 'paid');
    assert.equal((await call(`/api/admin/orders/${row(receipt).id}`,'PATCH',{action:'ready'},true)).status,409,'Saved packing is required before handing over food');
    await action(receipt,{action:'acknowledge'});assert.equal(row(receipt).acknowledged_by,isolated.userId);
    await action(receipt,{action:'packing',packing_checklist:packed});assert.ok(row(receipt).packed_at);
    for (const [command, expected] of [['preparing', 'preparing'], ['ready', 'ready'], ['complete', 'completed']]) {
      await action(receipt, { action: command }); assert.equal((await status(receipt)).status, expected);
    }
    assert.equal(isolated.rows(`select count(*)::int as n from public.payment_attempts where order_id='${row(receipt).id}'`)[0].n, 1);
    checks.push(`480 kr / ${method} / duplicate / all fulfillment statuses`);
  }
  const decline = await create('swish'); await action(decline, { action: 'approve' }); const declinedPath = await checkout(decline, 'swish');
  await simulate(declinedPath, 'decline'); assert.equal(row(decline).payment_status, 'failed');
  assert.equal(await checkout(decline, 'swish'), declinedPath);
  await simulate(declinedPath, 'decline'); assert.equal(row(decline).payment_status, 'failed', 'A second declined retry must not remain pending');
  assert.equal(await checkout(decline, 'swish'), declinedPath); await simulate(declinedPath, 'success'); assert.equal(row(decline).payment_status, 'paid');
  checks.push('Repeated declines and retries reuse immutable attempt');
  const cancelled = await create('card'); await action(cancelled, { action: 'approve' }); const cancelledPath = await checkout(cancelled, 'card');
  await simulate(cancelledPath, 'cancel'); assert.notEqual(row(cancelled).payment_status, 'paid');
  await simulate(cancelledPath, 'success'); assert.equal(row(cancelled).payment_status, 'paid'); checks.push('Cancel cannot mark paid; retry can succeed');
  const expired = await create('card'); await action(expired, { action: 'approve' }); const expiredPath = await checkout(expired, 'card');
  await simulate(expiredPath, 'expire'); assert.notEqual(row(expired).payment_status, 'paid');
  // A signed terminal simulator failure is conclusive; reopen only the SAME local capability.
  assert.equal(await checkout(expired, 'card'), expiredPath);
  await simulate(expiredPath, 'success'); assert.equal(row(expired).payment_status, 'paid');
  assert.equal(isolated.rows(`select count(*)::int as n from public.payment_attempts where order_id='${row(expired).id}'`)[0].n, 1);
  checks.push('Verified simulated expiry retries the same capability without a second attempt');
  const refunded = await create('google_pay'); await action(refunded, { action: 'approve' }); const refundPath = await checkout(refunded, 'google_pay');
  await simulate(refundPath, 'success'); await action(refunded, { action: 'refund' });
  await isolated.waitFor(()=>row(refunded).payment_status==='refunded');
  assert.equal(row(refunded).payment_status, 'refunded'); assert.equal(row(refunded).payment_refund_status, 'confirmed'); checks.push('Refund confirmed through signed provider event');
  await action(refunded,{action:'cancel'});assert.equal(row(refunded).status,'cancelled');checks.push('Paid cancellation follows verified refund');
  const cash = await create('cash'); await action(cash, { action: 'approve' }); assert.equal(row(cash).payment_status, 'unpaid');
  assert.equal((await call(`/api/admin/orders/${row(cash).id}`, 'PATCH', { action: 'cash_paid' })).status, 401);
  await action(cash, { action: 'cash_paid' }); assert.equal(row(cash).payment_status, 'paid'); assert.equal(row(cash).cash_received_by, isolated.userId); checks.push('Cash only authorized admin receipt');
  const revised = await create('apple_pay'); await action(revised, { action: 'request_changes', proposed_total_ore: 50000, admin_note: 'Syntetiskt pristillägg att godkänna' });
  assert.equal(row(revised).total_ore, 48000);
  const beforeAccept = await call('/api/payments/create', 'POST', { code: revised.code, token: revised.token, payment_method: 'apple_pay' }); assert.equal(beforeAccept.status, 409);
  const accepted = await call(`/api/orders/${revised.code}?token=${revised.token}`, 'PATCH', { action: 'accept_changes', revision: row(revised).quote_revision }); assert.equal(accepted.status, 200, accepted.data?.error);
  assert.equal(row(revised).total_ore, 50000); const revisedPath = await checkout(revised, 'apple_pay'); await simulate(revisedPath, 'success'); assert.equal(row(revised).payment_status, 'paid'); checks.push('Price revision requires customer acceptance');
  const pushOrder = await create('unpaid');
  const registered = await call(`/api/orders/${pushOrder.code}?token=${pushOrder.token}`, 'PATCH', { action: 'register_push', push_token: 'ExpoPushToken[isolated_customer_test_device]' }); assert.equal(registered.status, 200);
  await action(pushOrder, { action: 'approve' });
  // Actual kitchen controls, private printing, weighted manual holds and missed-order recovery.
  assert.equal((await call('/api/admin/kitchen')).status,401);assert.equal((await call('/api/admin/capacity')).status,401);
  const settings=(await call('/api/admin/scheduling','GET',undefined,true)).data.scheduling;
  assert.equal((await call('/api/admin/scheduling','PATCH',{action:'pause'},true)).status,200);
  assert.equal((await call('/api/availability','POST',{menu_id:testPackageId,quantity:1,fulfillment:'pickup'})).data.enabled,false);
  await call('/api/admin/scheduling','PATCH',{action:'resume'},true);
  await call('/api/admin/scheduling','PATCH',{action:'delay',minutes:15},true);
  assert.equal((await call('/api/admin/scheduling','GET',undefined,true)).data.scheduling.capacity_buffer_minutes,settings.capacity_buffer_minutes+15);
  await call('/api/admin/scheduling','PATCH',settings,true);
  const sold=await call(`/api/admin/menus/${testPackageId}`,'PATCH',{action:'availability',availability_state:'sold_out'},true);assert.equal(sold.status,200,sold.data?.error);
  assert.equal((await call('/api/availability','POST',{menu_id:testPackageId,quantity:1,fulfillment:'pickup'})).data.enabled,false);
  await call(`/api/admin/menus/${testPackageId}`,'PATCH',{action:'availability',availability_state:'available'},true);
  let quote=(await call('/api/availability','POST',{menu_id:testPackageId,quantity:1,fulfillment:'pickup'})).data;
  const chosen=quote.slots[0];
  const manual=await call('/api/admin/capacity','POST',{resource:'kitchen',starts_at:chosen.preparation_starts_at,ends_at:chosen.starts_at,units:1000,reason:'Syntetisk telefonbeställning'},true);assert.equal(manual.status,201,manual.data?.error);
  assert.equal((await call('/api/admin/capacity','POST',{resource:'kitchen',starts_at:chosen.preparation_starts_at,ends_at:chosen.starts_at,units:1,reason:'Syntetisk överbelastning'},true)).status,409);
  assert.equal((await call('/api/admin/capacity','POST',{action:'release',id:manual.data.hold.id},true)).status,200);
  quote=(await call('/api/availability','POST',{menu_id:testPackageId,quantity:1,fulfillment:'pickup'})).data;
  const direct=await call('/api/orders/direct','POST',{request_id:randomUUID(),menu_id:testPackageId,quantity:1,fulfillment:'pickup',scheduled_at:quote.slots[0].starts_at,expected_total_ore:quote.total_ore,full_name:'Syntetisk Kökskund',email:'kitchen@example.test',phone:'0700000000',address:'',postal_code:'',city:'',notes:'Endast kökstest',payment_preference:'card',terms_accepted:true},false,{'x-forwarded-for':'127.0.2.1'});assert.equal(direct.status,201,direct.data?.error);
  const directPath=await checkout(direct.data,'card');await simulate(directPath,'success');
  isolated.sql(`update public.direct_order_settings set watchdog_enabled=true,acknowledgement_minutes=1,auto_pause_unacknowledged=true;update public.orders set confirmed_at=clock_timestamp()-interval '2 minutes' where id='${row(direct.data).id}'`);
  const watch=await call('/api/admin/kitchen','GET',undefined,true);assert.equal(watch.status,200,watch.data?.error);assert.equal(watch.data.paused,true);assert.ok(watch.data.alerts.some(item=>item.code===direct.data.code));
  await action(direct.data,{action:'acknowledge'});assert.equal((await call('/api/admin/kitchen','GET',undefined,true)).data.alerts.length,0);
  assert.equal((await call('/api/admin/kitchen','GET',undefined,true)).data.paused,true,'Acknowledgement never silently resumes the kitchen');
  await call('/api/admin/scheduling','PATCH',settings,true);
  await action(direct.data,{action:'issue',kitchen_issue:'delivery_delayed',kitchen_note:'Intern syntetisk anteckning'});
  assert.equal(row(direct.data).kitchen_issue,'delivery_delayed');assert.ok(!JSON.stringify(await status(direct.data)).includes('Intern syntetisk anteckning'));
  const print=await call(`/admin/orders/${row(direct.data).id}/print`,'GET',undefined,true);assert.equal(print.status,200);assert.ok(print.text.includes(direct.data.code));assert.ok(!print.text.includes(direct.data.token));
  assert.ok((await call(`/admin/orders/${row(direct.data).id}/print`)).text.includes('Logga in'));
  const problemView=await call('/admin/orders?view=problem','GET',undefined,true);assert.equal(problemView.status,200);assert.ok(problemView.text.includes(direct.data.code));
  checks.push('Kitchen pause/delay/sold-out, manual capacity, watchdog acknowledgement, private issues/print and problem view');
  const inbox = await fetch(isolated.inbox, { headers: { Cookie: isolated.adminCookie } }).then(response => response.json());
  check('Email captured locally', inbox.emails.length > 0);
  check('Owner and customer push captured locally', inbox.pushes.some(item => item.to?.includes('owner')) && inbox.pushes.some(item => item.to?.includes('customer')));
  check('Private order token redacted in inbox', !JSON.stringify(inbox).includes(pushOrder.token) && !/token=[a-f\d]{64}/i.test(JSON.stringify(inbox)));
  const validGuard = isolated.rows('select secret_hash from public.test_environment_guard')[0].secret_hash;
  isolated.sql("update public.test_environment_guard set secret_hash=repeat('0',64)");
  const closed = await call('/api/catalog'); assert.ok(closed.status >= 400 || !closed.data.payment_methods.includes('swish')); checks.push('Tampered database marker fails closed');
  isolated.sql(`update public.test_environment_guard set secret_hash='${validGuard}'`);
  check('No legacy Stripe references created', isolated.rows('select count(*)::int as n from public.orders where stripe_checkout_session_id is not null or stripe_payment_intent_id is not null')[0].n === 0);
  process.stdout.write(`ISOLATED TEST MODE PASSED ${JSON.stringify({ checks: checks.length, orders: created, capturedEmails: isolated.mails.size, capturedPushes: isolated.pushes.size, externalNetwork: false, realMoney: false })}\n`);
} finally {
  await isolated.stop();
}
