// Riktig PostgreSQL + PostgREST + Next HTTP. Auth/Stripe/Resend är isolerade testtransporter.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHmac,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

if(process.env.YEHABIBI_TEST_BRIDGE) {
  // Laddas bara i testets egna Next-process. Produktionskoden har ingen testväxel.
  const original=globalThis.fetch;
  globalThis.fetch=(input,options)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    if(['api.stripe.com','api.resend.com'].includes(url.hostname)) {
      const target=new URL(`/__provider/${url.hostname}${url.pathname}${url.search}`,process.env.YEHABIBI_TEST_BRIDGE);
      return original(target,options);
    }
    return original(input,options);
  };
} else {
  await run();
}

async function run() {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const directory=path.join(root,'.tmp',`integration-${randomUUID()}`);
  fs.mkdirSync(directory,{recursive:true});
  const pgBin=process.env.PG_BIN||(process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'/usr/lib/postgresql/18/bin');
  const executable=name=>path.join(pgBin,name+(process.platform==='win32'?'.exe':''));
  const postgrest=process.env.POSTGREST_BIN||path.join(root,'.tmp/v41-tools/postgrest'+(process.platform==='win32'?'.exe':''));
  for(const tool of [executable('initdb'),executable('pg_ctl'),executable('psql'),postgrest]) assert.ok(fs.existsSync(tool),`Installera testverktyget: ${tool}`);
  const env={...process.env,PATH:`${pgBin}${path.delimiter}${process.env.PATH}`};
  const pgData=path.join(directory,'pgdata');
  const processes=[];
  let bridge,pgStarted=false,stopKeeping;
  const logs=[];
  const port=async()=>{const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;};
  const command=(file,args,input)=>{
    const result=spawnSync(file,args,{env,input,encoding:'utf8',windowsHide:true,
      ...(path.basename(file).startsWith('pg_ctl')?{stdio:'ignore'}:{})});
    assert.equal(result.status,0,`${path.basename(file)}: ${result.stderr||result.stdout||result.error}`);
    return (result.stdout||'').trim();
  };
  const sql=text=>command(executable('psql'),['-h','127.0.0.1','-p',String(pgPort),'-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],text);
  const background=(file,args,extraEnv={},cwd=root)=>{
    const child=spawn(file,args,{cwd,env:{...env,...extraEnv},windowsHide:true,stdio:['ignore','pipe','pipe']});
    const log=fs.createWriteStream(path.join(directory,`process-${processes.length}.log`));
    child.stdout.pipe(log);child.stderr.pipe(log);processes.push(child);logs.push(log);return child;
  };
  const wait=async url=>{
    for(let attempt=0;attempt<180;attempt++) {
      try {const response=await fetch(url);if(response.ok)return;} catch {}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    throw new Error(`Testservern startade inte: ${url}. Loggar: ${directory}`);
  };
  const pgPort=await port(),restPort=await port(),bridgePort=await port(),webPort=await port();
  const origin=`http://127.0.0.1:${webPort}`,bridgeUrl=`http://127.0.0.1:${bridgePort}`;
  const jwtSecret='isolated-local-fixture-jwt-secret-minimum-32-characters';
  const webhookSecret='whsec_isolated_fixture_not_a_real_account';
  const ownerEmail='owner@example.test';
  const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const jwt=claims=>{
    const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
    const body=`${encode({alg:'HS256',typ:'JWT'})}.${encode({exp:Math.floor(Date.now()/1000)+3600,...claims})}`;
    return `${body}.${createHmac('sha256',jwtSecret).update(body).digest('base64url')}`;
  };
  const service=jwt({role:'service_role'}),anon=jwt({role:'anon'}),admin=jwt({role:'authenticated',sub:userId,email:ownerEmail});
  const user={id:userId,aud:'authenticated',role:'authenticated',email:ownerEmail,email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const session={access_token:admin,refresh_token:'isolated-fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
  const cookie=`sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const mails=new Map(),sessions=new Map(),sessionKeys=new Map();
  let failEmails=0;
  const json=(response,status,data)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(data));};
  try {
    command(executable('initdb'),['-D',pgData,'-U','postgres','--auth=trust','--no-locale','-E','UTF8']);
    command(executable('pg_ctl'),['-D',pgData,'-l',path.join(directory,'postgres.log'),'-o',`-p ${pgPort} -h 127.0.0.1 -c shared_buffers=16MB -c max_connections=40`,'-w','start']);pgStarted=true;
    sql(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);alter table storage.objects enable row level security;`);
    for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(name=>name.endsWith('.sql')).sort()) sql(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
    const dishA='44444444-4444-4444-8444-000000000001',dishB='44444444-4444-4444-8444-000000000002',zone='55555555-5555-4555-8555-555555555555';
    sql(`grant usage on schema public to anon,authenticated,service_role;grant all on all tables in schema public to service_role;
      insert into auth.users(id) values('${userId}');
      insert into public.dishes(id,title,price_ore,portion_label,active,suggested_per_person) values('${dishA}','Testostrullar',2500,'styck',true,2),('${dishB}','Testhummus',9000,'fat',true,0.3);
      insert into public.menus(slug,title,included,price_ore,min_people,active) values('testpaket','Testpaket',array['Testostrullar','Testhummus'],25000,6,true);
      update public.delivery_zones set active=false;
      insert into public.delivery_zones(id,name,postal_prefixes,fee_ore,active) values('${zone}','Isolerad testzon',array['721'],10000,true);`);
    background(postgrest,[],{PGRST_DB_URI:`postgresql://postgres@127.0.0.1:${pgPort}/postgres`,PGRST_DB_ANON_ROLE:'anon',PGRST_DB_SCHEMAS:'public',PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(restPort),PGRST_JWT_SECRET:jwtSecret});
    await wait(`http://127.0.0.1:${restPort}/`);
    bridge=http.createServer(async(request,response)=>{
      try {
        const url=new URL(request.url,bridgeUrl);
        const chunks=[];for await(const chunk of request)chunks.push(chunk);const body=Buffer.concat(chunks);
        if(url.pathname.startsWith('/rest/v1')) {
          const headers={...request.headers};delete headers.host;delete headers['content-length'];
          const result=await fetch(`http://127.0.0.1:${restPort}${url.pathname.slice(8)}${url.search}`,{method:request.method,headers,...(body.length?{body}:{} )});
          response.writeHead(result.status,Object.fromEntries([...result.headers].filter(([key])=>!['content-encoding','transfer-encoding','content-length'].includes(key))));response.end(Buffer.from(await result.arrayBuffer()));return;
        }
        if(url.pathname==='/auth/v1/user') {
          return request.headers.authorization===`Bearer ${admin}`?json(response,200,user):json(response,401,{message:'Invalid fixture session'});
        }
        if(url.pathname==='/__test/admin-login') {response.writeHead(302,{'Set-Cookie':`${cookie}; Path=/; HttpOnly; SameSite=Lax`,Location:`${origin}/admin/orders`});response.end();return;}
        if(url.pathname==='/__test/stop') {json(response,200,{stopping:true});setImmediate(()=>stopKeeping?.());return;}
        if(url.pathname.startsWith('/__provider/api.resend.com')) {
          if(failEmails-->0)return json(response,503,{name:'application_error',message:'Synthetic delivery failure'});
          const key=request.headers['idempotency-key'];if(!mails.has(key))mails.set(key,{id:randomUUID(),...JSON.parse(body)});
          return json(response,200,{id:mails.get(key).id});
        }
        if(url.pathname.startsWith('/__provider/api.stripe.com/v1/checkout/sessions')) {
          if(request.method==='GET')return json(response,200,sessions.get(url.pathname.split('/').pop()));
          const key=request.headers['idempotency-key'];if(sessionKeys.has(key))return json(response,200,sessions.get(sessionKeys.get(key)));
          const values=new URLSearchParams(body.toString());
          const fixture={id:`cs_fixture_${randomUUID().replaceAll('-','')}`,object:'checkout.session',status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/isolated-fixture',currency:'sek',amount_total:Number(values.get('line_items[0][price_data][unit_amount]')),client_reference_id:values.get('client_reference_id'),metadata:{order_id:values.get('metadata[order_id]'),quote_revision:values.get('metadata[quote_revision]')}};
          assert.ok(values.get('allowed_payment_method_types[0]'));assert.equal(values.has('payment_method_types[0]'),false);
          sessions.set(fixture.id,fixture);sessionKeys.set(key,fixture.id);return json(response,200,fixture);
        }
        if(url.pathname==='/__provider/api.stripe.com/v1/refunds')return json(response,200,{id:'re_isolated_fixture',object:'refund',status:'pending'});
        if(url.pathname==='/__test/status')return json(response,200,{mails:[...mails.values()],sessions:[...sessions.values()]});
        json(response,404,{error:'Unknown isolated test transport'});
      } catch(error){json(response,500,{error:error.message});}
    });
    await new Promise(resolve=>bridge.listen(bridgePort,'127.0.0.1',resolve));
    background(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(webPort)],{
      NODE_OPTIONS:`--import=${import.meta.url}`,YEHABIBI_TEST_BRIDGE:bridgeUrl,NEXT_TELEMETRY_DISABLED:'1',
      NEXT_PUBLIC_SITE_URL:origin,NEXT_PUBLIC_SUPABASE_URL:bridgeUrl,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,
      ORDERS_ENABLED:'true',PAYMENTS_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_isolated_fixture',STRIPE_WEBHOOK_SECRET:webhookSecret,STRIPE_SWISH_ENABLED:'false',STRIPE_LIVE_ENABLED:'false',
      RESEND_API_KEY:'re_isolated_fixture',EMAIL_FROM:'Yehabibi Test <orders@example.test>',OWNER_NOTIFICATION_EMAIL:ownerEmail,ADMIN_EMAILS:ownerEmail,
      ORDER_LINK_SECRET:'isolated-order-link-secret-minimum-32-characters',ORDER_RATE_LIMIT_SECRET:'isolated-order-rate-secret-minimum-32-characters',OWNER_PUSH_ENABLED:'false',CUSTOMER_PUSH_ENABLED:'false'
    },path.join(root,'apps/web'));
    await wait(`${origin}/api/health`);
    const call=async(url,method='GET',value,auth=false)=>{const response=await fetch(`${origin}${url}`,{method,headers:{'Content-Type':'application/json',...(auth?{Cookie:cookie}:{} )},...(value?{body:JSON.stringify(value)}:{})});return {status:response.status,data:await response.json()};};
    const event=async(type,session,id=`evt_${randomUUID()}`)=>{
      const Stripe=(await import('stripe')).default;const payload=JSON.stringify({id,object:'event',type,livemode:false,data:{object:session}});
      const signature=Stripe.webhooks.generateTestHeaderString({payload,secret:webhookSecret});
      const response=await fetch(`${origin}/api/stripe/webhook`,{method:'POST',headers:{'stripe-signature':signature},body:payload});assert.equal(response.status,200,await response.text());return id;
    };
    const connection={origin,adminLogin:`${bridgeUrl}/__test/admin-login`,stop:`${bridgeUrl}/__test/stop`,database:sql('select version()'),directory};
    fs.writeFileSync(path.join(directory,'connection.json'),JSON.stringify(connection,null,2));
    process.stdout.write(`LOCAL TEST READY ${JSON.stringify(connection)}\n`);
    const catalog=await call('/api/catalog');assert.equal(catalog.status,200);assert.equal(catalog.data.demo,false);assert.equal(catalog.data.orders_enabled,true);
    const zonesBeforeSettings=sql('select count(*) from public.delivery_zones');
    const savedSettings=await call('/api/admin/settings','PATCH',{...catalog.data.settings,contact_phone:'0700000000'},true);
    assert.equal(savedSettings.status,200,JSON.stringify(savedSettings));assert.equal(sql(`select active from public.delivery_zones where id='${zone}'`),'t');
    assert.equal(sql('select count(*) from public.delivery_zones'),zonesBeforeSettings);
    assert.equal((await call('/api/admin/catalog','POST',{kind:'dishes',archive:true,id:dishA})).status,401);
    const draftDish=await call('/api/admin/catalog','POST',{kind:'dishes',value:{title:'Isolerad testrätt',description:'Syntetisk testdata',allergens:[],price_ore:1234,portion_label:'portion',image_url:'/images/mezze.webp',active:false,sort_order:50,category:'kalla_meze'}},true);
    assert.equal(draftDish.status,201,JSON.stringify(draftDish));assert.equal(sql(`select price_ore from public.dishes where id='${draftDish.data.item.id}'`),'1234');
    const draftMenu=await call('/api/admin/menus','POST',{title:'Isolerat testpaket',description:'',included:['Testostrullar'],allergens:[],price_ore:25000,min_people:6,image_url:'/images/mezze.webp',active:false,sort_order:50},true);
    assert.equal(draftMenu.status,201,JSON.stringify(draftMenu));
    const date=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
    const input={request_id:randomUUID(),items:[{dish_id:dishA,quantity:12},{dish_id:dishB,quantity:2}],guests:6,occasion:'hemma',event_date:date,event_time:'17:30',fulfillment:'delivery',address:'Testgatan 1',postal_code:'721 30',city:'Teststad',full_name:'Syntetisk Testkund',email:'customer@example.test',phone:'0700000000',notes:'Syntetisk testdata',payment_preference:'card',terms_accepted:true,total_ore:1,payment_status:'paid'};
    failEmails=1;
    const requests=await Promise.all([call('/api/orders','POST',input),call('/api/orders','POST',input)]);
    assert.ok(requests.every(result=>[200,201].includes(result.status)),JSON.stringify(requests));
    const receipt=requests[0].data;assert.equal(receipt.code,requests[1].data.code);
    const orderId=sql(`select id from public.orders where code='${receipt.code}'`);
    assert.equal(sql('select count(*) from public.orders'),'1');assert.equal(sql('select count(*) from public.order_items'),'2');
    const orderPath=`/api/orders/${receipt.code}?token=${receipt.token}`;
    assert.equal((await call(`/api/orders/${receipt.code}?token=${'0'.repeat(64)}`)).status,404);
    const order=(await call(orderPath)).data.order;assert.equal(order.total_ore,58000);assert.equal(order.payment_status,'unpaid');
    const noticesBefore=sql('select count(*) from public.order_notifications');
    sql(`begin;update public.orders set status='reviewing' where id='${orderId}';rollback;`);
    assert.equal(sql('select count(*) from public.order_notifications'),noticesBefore);
    assert.equal((await call('/api/orders','POST',{...input,notes:'changed'})).status,409);
    assert.equal((await call('/api/admin/orders/'+orderId,'PATCH',{action:'resend_notifications'},true)).status,200);
    const ownerMail=[...mails.values()].find(mail=>mail.to.includes(ownerEmail));assert.match(ownerMail.html,/Testgatan 1/);assert.match(ownerMail.html,/12 × Testostrullar/);
    const proposal=await call('/api/admin/orders/'+orderId,'PATCH',{action:'request_changes',admin_note:'Syntetiskt prisförslag',proposed_total_ore:60000},true);assert.equal(proposal.status,200,JSON.stringify(proposal));
    assert.equal((await call(orderPath,'PATCH',{action:'accept_changes',revision:99})).status,409);
    failEmails=1; // Länkutskicket fördröjs tills betalningen redan har blivit verifierad.
    const accepted=await call(orderPath,'PATCH',{action:'accept_changes',revision:proposal.data.order.proposal.revision});assert.equal(accepted.status,200,JSON.stringify(accepted));assert.ok(accepted.data.order.checkout_url);
    const sessionId=sql(`select stripe_checkout_session_id from public.orders where id='${orderId}'`);const checkout=sessions.get(sessionId);assert.ok(checkout);
    const paid={...checkout,status:'complete',payment_status:'paid',payment_intent:'pi_isolated_fixture'};sessions.set(sessionId,paid);
    const eventId=`evt_${randomUUID()}`;
    await Promise.all([event('checkout.session.completed',paid,eventId),event('checkout.session.completed',paid,eventId)]);
    await event('checkout.session.async_payment_succeeded',paid);
    assert.equal((await call(orderPath)).data.order.payment_status,'paid');
    assert.equal(sql(`select count(*) from public.order_notifications where order_id='${orderId}' and kind='paid'`),'1');
    const deferred=[...mails].filter(([key])=>key.startsWith(orderId)&&(/:approved:|:payment_available:/.test(key)));
    assert.equal(deferred.length,0);assert.equal(sql(`select count(*) from public.order_notifications where order_id='${orderId}' and superseded_at is not null`),'2');
    for(const action of ['preparing','dispatched','complete']) assert.equal((await call('/api/admin/orders/'+orderId,'PATCH',{action},true)).status,200);
    assert.equal((await call(orderPath)).data.order.status,'completed');
    assert.equal((await call('/api/admin/orders/'+orderId,'PATCH',{action:'refund'},true)).status,200);
    await event('charge.refunded',{object:'charge',payment_intent:'pi_isolated_fixture',refunded:true});
    assert.equal((await call(orderPath)).data.order.payment_status,'refunded');
    const cash=await call('/api/orders','POST',{...input,request_id:randomUUID(),email:'cash@example.test',fulfillment:'pickup',payment_preference:'cash'});assert.equal(cash.status,201);
    const cashId=sql(`select id from public.orders where code='${cash.data.code}'`);const beforeSessions=sessions.size;
    assert.equal((await call('/api/admin/orders/'+cashId,'PATCH',{action:'approve'},true)).status,200);assert.equal(sessions.size,beforeSessions);
    assert.equal(sql(`select payment_status from public.orders where id='${cashId}'`),'unpaid');
    assert.equal((await call('/api/admin/orders/'+cashId,'PATCH',{action:'complete'},true)).status,409);
    assert.equal((await call('/api/admin/orders/'+cashId,'PATCH',{action:'cash_paid'},true)).status,200);
    assert.equal(sql(`select payment_status from public.orders where id='${cashId}'`),'paid');
    sql('truncate public.order_rate_limits');
    const packageOrder=await call('/api/orders','POST',{...input,request_id:randomUUID(),items:undefined,menu_id:sql("select id from public.menus where slug='testpaket'"),fulfillment:'pickup',payment_preference:'cash',email:'package@example.test'});
    assert.equal(packageOrder.status,201,JSON.stringify(packageOrder));
    const packageId=sql(`select id from public.orders where code='${packageOrder.data.code}'`);
    const packageProposal=await call('/api/admin/orders/'+packageId,'PATCH',{action:'request_changes',admin_note:'Syntetisk paketjustering',proposed_total_ore:165000},true);
    assert.equal(packageProposal.status,200,JSON.stringify(packageProposal));
    const packagePath=`/api/orders/${packageOrder.data.code}?token=${packageOrder.data.token}`;
    const packageAccepts=await Promise.all([call(packagePath,'PATCH',{action:'accept_changes',revision:packageProposal.data.order.proposal.revision}),call(packagePath,'PATCH',{action:'accept_changes',revision:packageProposal.data.order.proposal.revision})]);
    assert.ok(packageAccepts.every(result=>result.status===200),JSON.stringify(packageAccepts));
    assert.equal(sql(`select jsonb_array_length(quote_history) from public.orders where id='${packageId}'`),'1');
    const packageMail=[...mails].find(([key])=>key.startsWith(`${packageId}:approved:`))[1].html.replace(/\s/g,' ');
    assert.ok(packageMail.includes('6 × Testpaket (250 kr/person) = 1 500 kr'),packageMail);
    assert.ok(packageMail.includes('godkänd prisjustering 150 kr'),packageMail);assert.ok(packageMail.includes('Testostrullar, Testhummus'),packageMail);
    const rowsBeforeFailure=sql('select count(*) from public.orders'),queueBeforeFailure=sql('select count(*) from public.order_notifications');
    sql(`create function public.fail_test_line() returns trigger language plpgsql as $$begin raise exception 'Isolated atomicity test';end;$$;create trigger fail_test_line before insert on public.order_items for each row execute function public.fail_test_line();`);
    assert.equal((await call('/api/orders','POST',{...input,request_id:randomUUID(),email:'rollback@example.test'})).status,409);
    sql('drop trigger fail_test_line on public.order_items;drop function public.fail_test_line();');
    assert.equal(sql('select count(*) from public.orders'),rowsBeforeFailure);assert.equal(sql('select count(*) from public.order_notifications'),queueBeforeFailure);
    sql('truncate public.order_rate_limits');
    assert.equal((await call('/api/orders','POST',{...input,request_id:randomUUID(),postal_code:'99999'})).status,400);
    const expiring=await call('/api/orders','POST',{...input,request_id:randomUUID(),email:'retry@example.test'});assert.equal(expiring.status,201);
    const expiringId=sql(`select id from public.orders where code='${expiring.data.code}'`);
    assert.equal((await call('/api/admin/orders/'+expiringId,'PATCH',{action:'approve'},true)).status,200);
    const expiredId=sql(`select stripe_checkout_session_id from public.orders where id='${expiringId}'`);
    sessions.get(expiredId).status='expired';
    const expiredEvent=await event('checkout.session.expired',sessions.get(expiredId));
    assert.equal(sql(`select payment_status from public.orders where id='${expiringId}'`),'failed');
    assert.equal(sql(`select count(*) from public.order_notifications where order_id='${expiringId}' and kind='failed'`),'1');
    assert.equal((await call('/api/admin/orders/'+expiringId,'PATCH',{action:'payment_link'},true)).status,200);
    assert.notEqual(sql(`select stripe_checkout_session_id from public.orders where id='${expiringId}'`),expiredId);
    await event('checkout.session.expired',sessions.get(expiredId),expiredEvent);
    assert.equal(sql(`select payment_status from public.orders where id='${expiringId}'`),'pending');
    const denied=await fetch(`${bridgeUrl}/rest/v1/orders`,{headers:{Authorization:`Bearer ${anon}`,apikey:anon}});assert.ok([401,403].includes(denied.status));
    const deniedAuthenticated=await fetch(`${bridgeUrl}/rest/v1/orders`,{headers:{Authorization:`Bearer ${admin}`,apikey:anon}});assert.equal(deniedAuthenticated.status,403);
    process.stdout.write(`LOCAL INTEGRATION PASSED ${JSON.stringify({orders:Number(sql('select count(*) from public.orders')),mailDeliveries:mails.size,externalAuth:false,externalStripe:false,externalEmail:false})}\n`);
    if(process.argv.includes('--keep')) await new Promise(resolve=>{stopKeeping=resolve;process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
  } finally {
    for(const child of processes.reverse()){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGTERM');}
    if(bridge)await new Promise(resolve=>bridge.close(resolve));
    for(const log of logs)log.end();
    if(pgStarted)command(executable('pg_ctl'),['-D',pgData,'-m','fast','-w','stop']);
    // Loggar och det isolerade klustret behålls under ignorerade .tmp för felsökning.
  }
}
