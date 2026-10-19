// Real PostgreSQL + real scheduled process. No browser is launched or required.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startTestEnvironment,testPackageId} from '../test-support/local/environment.mjs';

const isolated=await startTestEnvironment();
const call=async(route,body,secret)=>{
  const response=await fetch(`${isolated.origin}${route}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(secret?{Authorization:`Bearer ${secret}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
};
try {
  assert.equal((await call('/api/internal/jobs')).status,401);
  assert.equal((await call('/api/internal/jobs',{},'not-the-server-secret')).status,401);
  assert.equal((await call('/api/admin/jobs')).status,401);
  const quote=(await call('/api/availability',{menu_id:testPackageId,quantity:1,fulfillment:'pickup'})).data;
  const created=await call('/api/orders/direct',{request_id:randomUUID(),menu_id:testPackageId,quantity:1,fulfillment:'pickup',scheduled_at:quote.slots[0].starts_at,
    expected_total_ore:quote.total_ore,full_name:'Syntetiskt köksprov',email:'scheduled@example.test',phone:'0700000000',notes:'Enbart lokalt schemaläggningsprov',
    address:'',postal_code:'',city:'',payment_preference:'cash',terms_accepted:true});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const order=isolated.rows(`select id from public.orders where code='${created.data.code}'`)[0];
  isolated.sql(`update public.orders set confirmed_at=clock_timestamp()-interval '3 minutes' where id='${order.id}';
    update public.direct_order_settings set watchdog_enabled=true,reminder_minutes=2,escalation_minutes=5;
    delete from public.background_jobs where kind='kitchen_watchdog' and status='completed';`);
  // From here to the assertion: no customer/admin HTTP requests. SQL only observes.
  await isolated.waitFor(()=>isolated.rows(`select count(*)::int n from public.order_notifications where order_id='${order.id}' and kind='kitchen_reminder'`)[0].n===1,30000);
  assert.equal(isolated.rows(`select acknowledged_at from public.orders where id='${order.id}'`)[0].acknowledged_at,null);
  // Kill-equivalent: abandon a short real lease; the independent process reclaims it.
  const crashId=randomUUID();
  isolated.sql(`insert into public.background_jobs(id,kind,payload,dedupe_key,status,lease_owner,lease_token,lease_expires_at,attempts)
    values('${crashId}','kitchen_watchdog','{}','crash-${crashId}','leased','crashed-worker','${randomUUID()}',clock_timestamp()+interval '5 seconds',1);`);
  await isolated.waitFor(()=>isolated.rows(`select status from public.background_jobs where id='${crashId}'`)[0].status==='completed',20000);
  assert.equal(isolated.rows(`select attempts from public.background_jobs where id='${crashId}'`)[0].attempts,2);
  assert.equal(isolated.rows(`select count(*)::int n from public.orders where id='${order.id}'`)[0].n,1);
  await Promise.all([isolated.tick(),isolated.tick()]);
  assert.equal(isolated.rows(`select count(*)::int n from public.order_notifications where order_id='${order.id}' and kind='kitchen_reminder'`)[0].n,1);
  const health=await call('/api/internal/jobs',null,isolated.webEnv.BACKGROUND_JOB_SECRET);
  assert.equal(health.status,200);assert.ok(health.data.last_watchdog_success_at);
  console.log('Background integration PASS: independent scheduling without browsers; reminder; abandoned lease recovery; concurrent ticks; authenticated health; order preserved.');
} finally {await isolated.stop();}
