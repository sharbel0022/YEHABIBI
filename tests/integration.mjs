// Riktig PostgreSQL + PostgREST + Next HTTP. Auth/Adyen/Resend är isolerade testtransporter.
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
    if(['checkout-test.adyen.com','api.resend.com'].includes(url.hostname)) {
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
    const pgLog=path.join(directory,'postgres.log');
    const diagnostics=result.status!==0&&path.basename(file).startsWith('pg_ctl')&&fs.existsSync(pgLog)?fs.readFileSync(pgLog,'utf8').slice(-8000):'';
    assert.equal(result.status,0,`${path.basename(file)}: ${result.stderr||result.stdout||result.error||''}\n${diagnostics}`);
    return (result.stdout||'').trim();
  };
  const sql=text=>command(executable('psql'),['-h','127.0.0.1','-p',String(pgPort),'-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],text);
  const background=(file,args,extraEnv={},cwd=root)=>{
    const child=spawn(file,args,{cwd,env:{...env,...extraEnv},windowsHide:true,stdio:['ignore','pipe','pipe']});
    const log=fs.createWriteStream(path.join(directory,`process-${logs.length}.log`));
    child.stdout.pipe(log);child.stderr.pipe(log);processes.push(child);logs.push(log);return child;
  };
  const stopProcess=async child=>{
    if(child.exitCode!==null||child.signalCode!==null)return;
    const exited=new Promise(resolve=>child.once('exit',resolve));
    if(process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});
    else child.kill('SIGTERM');
    await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,5000).unref())]);
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
  const webhookSecret='ab'.repeat(32);
  const merchantAccount='YehabibiFixture';
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
    command(executable('pg_ctl'),['-D',pgData,'-l',path.join(directory,'postgres.log'),'-o',`-p ${pgPort} -h 127.0.0.1 -c shared_buffers=16MB -c max_connections=40${process.platform==='win32'?'':' -c unix_socket_directories='}`,'-w','start']);pgStarted=true;
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
        if(url.pathname==='/__provider/checkout-test.adyen.com/v71/paymentMethods') {
          return json(response,200,{paymentMethods:[{type:'scheme',brands:['visa','mc']},{type:'swish'},{type:'applepay'},{type:'googlepay'}]});
        }
        if(url.pathname.startsWith('/__provider/checkout-test.adyen.com/v71/paymentLinks')) {
          if(request.method==='GET')return json(response,200,sessions.get(url.pathname.split('/').pop()));
          const key=request.headers['idempotency-key'];if(sessionKeys.has(key))return json(response,200,sessions.get(sessionKeys.get(key)));
          const values=JSON.parse(body);
          const fixture={id:`PL_${randomUUID().replaceAll('-','')}`,status:'active',url:'https://test.adyen.link/isolated-fixture',
            amount:values.amount,reference:values.reference,merchantAccount:values.merchantAccount,expiresAt:values.expiresAt};
          fixture.url=`https://test.adyen.link/${fixture.id}`;
          assert.ok(values.allowedPaymentMethods.length);assert.equal(values.reusable,false);
          assert.equal(values.amount.currency,'SEK');assert.equal(values.merchantAccount,merchantAccount);
          assert.ok(values.allowedPaymentMethods.every(method=>['visa','mc','swish','applepay','googlepay'].includes(method)));
          sessions.set(fixture.id,fixture);sessionKeys.set(key,fixture.id);return json(response,200,fixture);
        }
        if(/^\/__provider\/checkout-test\.adyen\.com\/v71\/payments\/[^/]+\/refunds$/.test(url.pathname)) {
          const values=JSON.parse(body),original=url.pathname.split('/').at(-2);
          return json(response,200,{pspReference:`REFUND_${original}`,paymentPspReference:original,merchantAccount,status:'received',reference:values.reference});
        }
        if(url.pathname==='/__test/status')return json(response,200,{mails:[...mails.values()],sessions:[...sessions.values()]});
        json(response,404,{error:'Unknown isolated test transport'});
      } catch(error){json(response,500,{error:error.message});}
    });
    await new Promise(resolve=>bridge.listen(bridgePort,'127.0.0.1',resolve));
    const startWeb=(payments='true')=>background(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(webPort)],{
      NODE_OPTIONS:`--import=${import.meta.url}`,YEHABIBI_TEST_BRIDGE:bridgeUrl,NEXT_TELEMETRY_DISABLED:'1',
      NEXT_PUBLIC_SITE_URL:'https://yehabibi.example.test',NEXT_PUBLIC_SUPABASE_URL:bridgeUrl,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,
      MOBILE_WEB_ORIGINS:origin,
      ORDERS_ENABLED:'true',PAYMENTS_ENABLED:payments,PAYMENT_PROVIDER:'adyen',ADYEN_ENVIRONMENT:'test',ADYEN_CAPTURE_MODE:'automatic',
      ADYEN_API_KEY:'isolated_fixture_not_a_real_key',ADYEN_MERCHANT_ACCOUNT:merchantAccount,ADYEN_HMAC_KEY:webhookSecret,ADYEN_ENABLED_METHODS:'swish,card,apple_pay,google_pay',
      RESEND_API_KEY:'re_isolated_fixture',EMAIL_FROM:'Yehabibi Test <orders@example.test>',OWNER_NOTIFICATION_EMAIL:ownerEmail,ADMIN_EMAILS:ownerEmail,
      ORDER_LINK_SECRET:'isolated-order-link-secret-minimum-32-characters',ORDER_RATE_LIMIT_SECRET:'isolated-order-rate-secret-minimum-32-characters',OWNER_PUSH_ENABLED:'false',CUSTOMER_PUSH_ENABLED:'false'
    },path.join(root,'apps/web'));
    let webProcess=startWeb();
    await wait(`${origin}/api/health`);
    const call=async(url,method='GET',value,auth=false,headers={})=>{const response=await fetch(`${origin}${url}`,{method,headers:{'Content-Type':'application/json',...(auth?{Cookie:cookie}:{} ),...headers},...(value?{body:JSON.stringify(value)}:{})});return {status:response.status,data:await response.json()};};
    const event=async(type,session,id,expectedStatus=200,overrides={})=>{
      const item={pspReference:type==='REFUND'?`REFUND_PSP_${session.id}`:`PSP_${session.id}`,originalReference:type==='REFUND'?`PSP_${session.id}`:'',
        merchantAccountCode:merchantAccount,merchantReference:session.reference,amount:session.amount,eventCode:type,success:'true',
        paymentMethod:'visa',...overrides};
      const canonical=[item.pspReference,item.originalReference,item.merchantAccountCode,item.merchantReference,item.amount.value,item.amount.currency,item.eventCode,item.success]
        .map(value=>String(value??'').replace(/\\/g,'\\\\').replace(/:/g,'\\:')).join(':');
      item.additionalData={hmacSignature:createHmac('sha256',Buffer.from(webhookSecret,'hex')).update(canonical).digest('base64')};
      const payload=JSON.stringify({live:'false',notificationItems:[{NotificationRequestItem:item}]});
      const response=await fetch(`${origin}/api/payments/webhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:payload});
      assert.equal(response.status,expectedStatus,await response.text());return id||item.pspReference;
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
    const accepted=await call(orderPath,'PATCH',{action:'accept_changes',revision:proposal.data.order.proposal.revision});assert.equal(accepted.status,200,JSON.stringify(accepted));assert.equal(accepted.data.order.checkout_url,null);
    failEmails=100; // Samtidiga återförsök får inte hinna leverera länken före avstämning.
    const paymentRequest={code:receipt.code,token:receipt.token,payment_method:'card'};
    assert.equal((await call('/api/payments/create','POST',{...paymentRequest,token:'0'.repeat(64)})).status,404);
    assert.equal((await call('/api/payments/create','POST',{...paymentRequest,amount_ore:1})).status,400);
    const initiated=await Promise.all([call('/api/payments/create','POST',paymentRequest),call('/api/payments/create','POST',paymentRequest)]);
    assert.ok(initiated.every(result=>result.status===200),JSON.stringify(initiated));
    assert.equal(initiated[0].data.checkout_url,initiated[1].data.checkout_url);assert.equal(sessions.size,1);
    const sessionId=sql(`select provider_payment_id from public.orders where id='${orderId}'`);const checkout=sessions.get(sessionId);assert.ok(checkout);
    const paid={...checkout,status:'completed'};sessions.set(sessionId,paid);
    // Även signerade händelser måste innehålla rätt belopp, valuta och session.
    await event('AUTHORISATION',{...paid,amount:{value:1,currency:'SEK'}},undefined,400);
    await event('AUTHORISATION',{...paid,amount:{...paid.amount,currency:'EUR'}},undefined,400);
    await event('AUTHORISATION',{...paid,reference:'unrelated-payment'},undefined,400);
    assert.equal((await call(`/api/payments/status?code=${receipt.code}&token=${receipt.token}`)).data.order.payment_status,'pending');
    assert.equal((await call(orderPath)).data.order.payment_status,'pending');
    failEmails=0;
    const eventId=`evt_${randomUUID()}`;
    await Promise.all([event('AUTHORISATION',paid,eventId),event('AUTHORISATION',paid,eventId)]);
    await event('AUTHORISATION',paid);
    assert.equal((await call(orderPath)).data.order.payment_status,'paid');
    assert.equal(sql(`select count(*) from public.order_notifications where order_id='${orderId}' and kind='paid'`),'1');
    const deferred=[...mails].filter(([key])=>key.startsWith(orderId)&&/:payment_available:/.test(key));
    assert.equal(deferred.length,0);assert.ok(Number(sql(`select count(*) from public.order_notifications where order_id='${orderId}' and superseded_at is not null`))>=1);
    for(const action of ['preparing','dispatched','complete']) assert.equal((await call('/api/admin/orders/'+orderId,'PATCH',{action},true)).status,200);
    assert.equal((await call(orderPath)).data.order.status,'completed');
    assert.equal((await call('/api/admin/orders/'+orderId,'PATCH',{action:'refund'},true)).status,200);
    await event('REFUND',paid);
    assert.equal((await call(orderPath)).data.order.payment_status,'refunded');
    const cash=await call('/api/orders','POST',{...input,request_id:randomUUID(),email:'cash@example.test',fulfillment:'pickup',payment_preference:'cash'});assert.equal(cash.status,201);
    const cashId=sql(`select id from public.orders where code='${cash.data.code}'`);const beforeSessions=sessions.size;
    assert.equal((await call('/api/admin/orders/'+cashId,'PATCH',{action:'approve'},true)).status,200);assert.equal(sessions.size,beforeSessions);
    assert.equal(sql(`select payment_status from public.orders where id='${cashId}'`),'unpaid');
    assert.equal((await call('/api/admin/orders/'+cashId,'PATCH',{action:'complete'},true)).status,409);
    assert.equal((await call('/api/admin/orders/'+cashId,'PATCH',{action:'cash_paid'},true)).status,200);
    assert.equal(sql(`select payment_status from public.orders where id='${cashId}'`),'paid');
    assert.equal(sql(`select cash_received_by from public.orders where id='${cashId}'`),userId);
    // Riktiga HTTP-routes/databas, men samtliga leverantörstransaktioner är uttryckligen simulerade.
    for(const method of ['swish','apple_pay','google_pay']) {
      sql('truncate public.order_rate_limits');
      const result=await call('/api/orders','POST',{...input,request_id:randomUUID(),email:`${method}@example.test`});
      assert.equal(result.status,201,JSON.stringify(result));
      const methodId=sql(`select id from public.orders where code='${result.data.code}'`);
      const methodRequest={code:result.data.code,token:result.data.token,payment_method:method};
      const methodPath=`/api/orders/${result.data.code}?token=${result.data.token}`;
      assert.equal((await call('/api/payments/create','POST',methodRequest)).status,409);
      const before=sessions.size;
      assert.equal((await call('/api/admin/orders/'+methodId,'PATCH',{action:'approve'},true)).status,200);
      assert.equal(sessions.size,before,'Godkännande får inte låsa kundens betalningsval.');
      assert.equal((await call('/api/admin/orders/'+methodId,'PATCH',{action:'payment_link'},true)).status,200);
      assert.equal(sessions.size,before,'Betalningsbegäran länkar till ordern utan extern session.');
      const started=await call('/api/payments/create','POST',methodRequest);assert.equal(started.status,200,JSON.stringify(started));
      assert.equal((await call('/api/admin/orders/'+methodId,'PATCH',{action:'cash_paid'},true)).status,409);
      const link=sessions.get(sql(`select provider_payment_id from public.orders where id='${methodId}'`));
      assert.equal(sql(`select payment_method from public.orders where id='${methodId}'`),method);
      await event('AUTHORISATION',link,undefined,200,{pspReference:`DECLINED_${link.id}`,success:'false'});
      assert.equal((await call(methodPath)).data.order.payment_status,'failed');
      const retry=await call('/api/payments/create','POST',methodRequest);assert.equal(retry.status,200,JSON.stringify(retry));
      assert.equal(sessions.size,before+1,'Nekat försök återanvänder samma betalningslänk.');
      await event('AUTHORISATION',link);
      assert.equal((await call(methodPath)).data.order.payment_status,'paid');
      if(method==='google_pay') {
        assert.equal((await call('/api/admin/orders/'+methodId,'PATCH',{action:'refund'},true)).status,200);
        assert.equal((await call(methodPath)).data.order.payment_status,'paid','API-kvittens är inte återbetalningsbevis.');
        assert.equal((await call('/api/admin/orders/'+methodId,'PATCH',{action:'preparing'},true)).status,409);
        await event('REFUND',link);
        assert.equal((await call(methodPath)).data.order.payment_status,'refunded');
      }
    }
    sql('truncate public.order_rate_limits');
    assert.equal((await call('/api/orders','POST',{...input,request_id:randomUUID(),email:'unpaid@example.test',payment_preference:'unpaid'})).status,503);
    const currentSettings=(await call('/api/catalog')).data.settings;
    assert.equal((await call('/api/admin/settings','PATCH',{...currentSettings,allow_unpaid_requests:true},true)).status,200);
    const inquiry=await call('/api/orders','POST',{...input,request_id:randomUUID(),email:'inquiry@example.test',payment_preference:'unpaid'});
    assert.equal(inquiry.status,201,JSON.stringify(inquiry));
    assert.equal((await call(`/api/orders/${inquiry.data.code}?token=${inquiry.data.token}`)).data.order.payment_status,'unpaid');
    assert.equal((await call('/api/admin/settings','PATCH',currentSettings,true)).status,200);
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
    await verifyUnifiedCatalog({call,sql,input,origin,dishId:dishA,zoneId:zone,orderPath,receipt,
      readAdminOrders:async()=>{const response=await fetch(`${origin}/admin/orders`,{headers:{Cookie:cookie}});assert.equal(response.status,200);return response.text();}});
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
    assert.equal((await call('/api/payments/create','POST',{code:expiring.data.code,token:expiring.data.token,payment_method:'card'})).status,200);
    const expiredId=sql(`select provider_payment_id from public.orders where id='${expiringId}'`);
    sessions.get(expiredId).status='expired';
    const expiringReference={code:expiring.data.code,token:expiring.data.token,payment_method:'card'};
    assert.equal((await call('/api/payments/create','POST',expiringReference)).status,503);
    assert.equal(sql(`select provider_payment_id from public.orders where id='${expiringId}'`),expiredId);
    assert.equal(sql(`select payment_status from public.orders where id='${expiringId}'`),'pending');
    assert.equal(sql(`select payment_review_required from public.orders where id='${expiringId}'`),'t');
    const denied=await fetch(`${bridgeUrl}/rest/v1/orders`,{headers:{Authorization:`Bearer ${anon}`,apikey:anon}});assert.ok([401,403].includes(denied.status));
    const deniedAuthenticated=await fetch(`${bridgeUrl}/rest/v1/orders`,{headers:{Authorization:`Bearer ${admin}`,apikey:anon}});assert.equal(deniedAuthenticated.status,403);
    sql('truncate public.order_rate_limits');
    const shutdown=await call('/api/orders','POST',{...input,request_id:randomUUID(),email:'shutdown@example.test'});assert.equal(shutdown.status,201);
    const shutdownId=sql(`select id from public.orders where code='${shutdown.data.code}'`);
    assert.equal((await call('/api/admin/orders/'+shutdownId,'PATCH',{action:'approve'},true)).status,200);
    assert.equal((await call('/api/payments/create','POST',{code:shutdown.data.code,token:shutdown.data.token,payment_method:'card'})).status,200);
    // Stäng av nya betalningar i en ny serverprocess; gamla signerade händelser ska ändå avstämmas.
    await stopProcess(webProcess);processes.splice(processes.indexOf(webProcess),1);
    webProcess=startWeb('false');await wait(`${origin}/api/health`);
    const sessionCount=sessions.size;
    assert.equal((await call('/api/admin/orders/'+shutdownId,'PATCH',{action:'payment_link'},true)).status,503);
    assert.equal((await call('/api/orders','POST',{...input,request_id:randomUUID(),email:'disabled@example.test'})).status,503);
    assert.equal(sessions.size,sessionCount);assert.equal((await call('/api/catalog')).data.payment_methods.includes('card'),false);
    const finalSession=sessions.get(sql(`select provider_payment_id from public.orders where id='${shutdownId}'`));
    await event('AUTHORISATION',{...finalSession,status:'completed'});
    assert.equal(sql(`select payment_status from public.orders where id='${shutdownId}'`),'paid');
    assert.equal((await fetch(`${origin}/api/payments/webhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
    process.stdout.write(`LOCAL INTEGRATION PASSED ${JSON.stringify({orders:Number(sql('select count(*) from public.orders')),mailDeliveries:mails.size,externalAuth:false,externalAdyenSandbox:false,externalEmail:false})}\n`);
    if(process.argv.includes('--keep')) await new Promise(resolve=>{stopKeeping=resolve;process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
  } finally {
    for(const child of processes.reverse())await stopProcess(child);
    if(bridge)await new Promise(resolve=>bridge.close(resolve));
    for(const log of logs)log.end();
    if(pgStarted)command(executable('pg_ctl'),['-D',pgData,'-m','fast','-w','stop']);
    // Loggar och det isolerade klustret behålls under ignorerade .tmp för felsökning.
  }
}

/** Två klienter läser samma API och ser samma adminändring utan en ny appversion. */
async function verifyUnifiedCatalog({call,sql,input,origin,dishId,zoneId,orderPath,receipt,readAdminOrders}) {
  const webHeaders={Origin:origin,'User-Agent':'Yehabibi web integration'};
  const mobileHeaders={'User-Agent':'Yehabibi Expo integration'};
  const readBoth=async()=>{
    const [web,mobile]=await Promise.all([
      call('/api/catalog','GET',undefined,false,webHeaders),
      call('/api/catalog','GET',undefined,false,mobileHeaders)
    ]);
    assert.equal(web.status,200);assert.equal(mobile.status,200);
    assert.deepEqual(web.data,mobile.data,'Webb och native ska läsa samma publika katalog.');
    return web.data;
  };
  const before=await readBoth();
  const historical=(await call(orderPath)).data.order;
  const dish=before.dishes.find(item=>item.id===dishId);
  const zone=before.delivery_zones.find(item=>item.id===zoneId);
  const changedDish={...dish,price_ore:3000,image_url:'/images/fest.webp'};
  const changedZone={...zone,fee_ore:15000};
  assert.equal((await call('/api/admin/catalog','POST',{kind:'dishes',id:dishId,value:changedDish},true)).status,200);
  assert.equal((await call('/api/admin/catalog','POST',{kind:'delivery_zones',id:zoneId,value:changedZone},true)).status,200);
  assert.equal((await call('/api/admin/settings','PATCH',{...before.settings,contact_phone:'0701111111'},true)).status,200);
  const updated=await readBoth();
  assert.equal(updated.dishes.find(item=>item.id===dishId).price_ore,3000);
  assert.equal(updated.dishes.find(item=>item.id===dishId).image_url,'/images/fest.webp');
  assert.equal(updated.delivery_zones.find(item=>item.id===zoneId).fee_ore,15000);
  assert.equal(updated.settings.contact_phone,'0701111111');

  // Båda plattformarna skickar samma format. Det påhittade klientbeloppet ignoreras.
  sql('truncate public.order_rate_limits');
  const countBefore=Number(sql('select count(*) from public.orders'));
  const send=async(platform,headers)=>{
    const result=await call('/api/orders','POST',{...input,request_id:randomUUID(),email:`${platform}@example.test`,fulfillment:'pickup',payment_preference:'cash',total_ore:1},false,headers);
    assert.equal(result.status,201,JSON.stringify(result));
    const tracked=await call(`/api/orders/${result.data.code}?token=${result.data.token}`);
    assert.equal(tracked.status,200);assert.equal(tracked.data.order.total_ore,54000);
    assert.equal(tracked.data.order.payment_status,'unpaid');
    return result.data;
  };
  const [webOrder,mobileOrder]=await Promise.all([send('web',webHeaders),send('mobile',mobileHeaders)]);
  assert.notEqual(webOrder.code,mobileOrder.code);
  assert.equal(Number(sql('select count(*) from public.orders')),countBefore+2);
  const adminOrders=await readAdminOrders();
  assert.ok(adminOrders.includes(webOrder.code),'Webbens order ska synas i gemensam admin.');
  assert.ok(adminOrders.includes(mobileOrder.code),'Mobilens order ska synas i gemensam admin.');

  assert.equal((await call('/api/admin/catalog','POST',{kind:'dishes',id:dishId,archive:true},true)).status,200);
  const archived=await readBoth();
  assert.equal(archived.dishes.some(item=>item.id===dishId),false);
  assert.equal((await call('/api/orders','POST',{...input,request_id:randomUUID(),email:'archived@example.test'})).status,400);
  const replay=await call('/api/orders','POST',input);
  assert.equal(replay.status,200);assert.deepEqual(replay.data,receipt);
  assert.deepEqual((await call(orderPath)).data.order,historical,'Adminpris och avpublicering får inte ändra historiska orderrader.');

  // Återställ bara detta tests katalogvärden för följande separata betalningsfall.
  assert.equal((await call('/api/admin/catalog','POST',{kind:'dishes',id:dishId,value:dish},true)).status,200);
  assert.equal((await call('/api/admin/catalog','POST',{kind:'delivery_zones',id:zoneId,value:zone},true)).status,200);
  assert.equal((await call('/api/admin/settings','PATCH',before.settings,true)).status,200);
  const restored=await readBoth();
  // Lika sort_order har ingen definierad inbördes ordning i PostgreSQL efter UPDATE.
  const byId=(left,right)=>left.id.localeCompare(right.id);
  assert.deepEqual({...restored,dishes:[...restored.dishes].sort(byId)},{...before,dishes:[...before.dishes].sort(byId)});
  sql('truncate public.order_rate_limits');
}
