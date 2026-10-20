import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const activeSessionPath = path.join(repositoryRoot, '.tmp/test-mode-active.json');
export const testDishes = [
  { id: '44444444-4444-4444-8444-000000000001', title: 'TEST Ostrullar', price: 2500, unit: 'styck', category: 'varma_meze' },
  { id: '44444444-4444-4444-8444-000000000002', title: 'TEST Hummusfat', price: 9000, unit: 'fat', category: 'kalla_meze' },
  { id: '44444444-4444-4444-8444-000000000003', title: 'TEST Kaftaspett', price: 6500, unit: 'spett', category: 'grill' },
  { id: '44444444-4444-4444-8444-000000000004', title: 'TEST Falafel', price: 2000, unit: 'styck', category: 'varma_meze' },
  { id: '44444444-4444-4444-8444-000000000005', title: 'TEST Baklava', price: 3500, unit: 'bit', category: 'dessert' },
];
export const testPackageId='66666666-6666-4666-8666-666666666666';
export const testLargePackageId='66666666-6666-4666-8666-666666666667';
export function redacted(value) {
  return String(value).replace(/([?&](?:amp;)?(?:token|password|secret|session|key)=)[^&\s"'<>]+/gi, '$1[REDACTED]')
    .replace(/("(?:token|password|secret|access_token|refresh_token)"\s*:\s*")[^"]*/gi, '$1[REDACTED]')
    .replace(/(\/__test\/payment\/)[A-Za-z0-9_-]+/g, '$1[PRIVATE-SESSION]');
}
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const equalSecret = (left, right) => typeof left === 'string' && left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const privateView = value => typeof value === 'string' ? redacted(value) : Array.isArray(value) ? value.map(privateView)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(token|password|secret|access_token|refresh_token)$/i.test(key) ? '[REDACTED]' : privateView(item)])) : value;
export function cleanProcessEnvironment() {
  const selected = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME', 'LANG', 'LC_ALL']) {
    if (process.env[key]) selected[key] = process.env[key];
  }
  // PostgreSQL 18's Windows libintl aborts in _nl_find_domain when libpq loads
  // the inherited C.UTF-8 locale inside PostgREST. C avoids translated messages;
  // the database encoding remains UTF8 and business time stays Europe/Stockholm.
  return { ...selected, ...(process.platform === 'win32' ? {LANG:'C',LC_ALL:'C'} : {}), NODE_OPTIONS: '', NEXT_TELEMETRY_DISABLED: '1', CI: '1' };
}
export async function freePort(requestedPort = 0) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
export async function waitReady(url, children, directory, expectedIsolationId) {
  const assertRunning = () => {
    for (const child of children) {
      if (child.testStartupError) throw new Error(`Testprocess kunde inte startas (${child.testStartupError.code || 'spawn'}). Redigerade loggar: ${directory}`);
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Testprocess avslutades (${child.exitCode ?? child.signalCode}). Redigerade loggar: ${directory}`);
    }
  };
  for (let attempt = 0; attempt < 180; attempt++) {
    assertRunning();
    let available = false;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      available = response.ok && (!expectedIsolationId || (await response.json()).isolation_id === expectedIsolationId);
    } catch {}
    assertRunning();
    if (available) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Testservern startade inte. Redigerade loggar: ${directory}`);
}

export async function startTestEnvironment(options = {}) {
  const root = repositoryRoot;
  const restore = options.restoreDirectory ? path.resolve(options.restoreDirectory) : null;
  if (restore && (path.dirname(restore) !== path.join(root, '.tmp') || !/^test-mode-[a-f\d-]{36}$/.test(path.basename(restore)))) throw new Error('Okänd testdatabas återanvänds inte.');
  const savedConfig = restore ? JSON.parse(fs.readFileSync(path.join(restore, 'reusable-session.json'), 'utf8')) : null;
  if (savedConfig && (savedConfig.marker !== 'YEHABIBI_REUSABLE_TEST_V1' || !/^[a-f\d-]{36}$/.test(savedConfig.isolationId) || !/^[a-f\d]{64}$/.test(savedConfig.secret))) throw new Error('Ogiltigt återställningskontrakt.');
  const isolationId = savedConfig?.isolationId || randomUUID(), secret = savedConfig?.secret || randomBytes(32).toString('hex');
  const directory = restore || path.join(root, '.tmp', `test-mode-${isolationId}`);
  fs.mkdirSync(directory, { recursive: true });
  const pgBin = options.pgBin || process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/lib/postgresql/18/bin');
  const executable = name => path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : ''));
  const postgrest = options.postgrest || process.env.POSTGREST_BIN || path.join(root, '.tmp/v41-tools/postgrest' + (process.platform === 'win32' ? '.exe' : ''));
  for (const tool of [executable('initdb'), executable('pg_ctl'), executable('psql'), postgrest]) assert.ok(fs.existsSync(tool), `Installera testverktyget: ${tool}`);
  const env = { ...cleanProcessEnvironment(), PATH: `${pgBin}${path.delimiter}${process.env.PATH || process.env.Path || ''}` };
  // Windows treats PATH case-insensitively; never pass a second Path entry to child_process.
  delete env.Path;
  const pgData = path.join(directory, 'pgdata'), children = [], logs = [];
  let bridge, pgStarted = false, stopped = false, ready = false;
  const command = (file, args, input) => {
    const result = spawnSync(file, args, { env, input, encoding: 'utf8', windowsHide: true, ...(path.basename(file).startsWith('pg_ctl') ? { stdio: 'ignore' } : {}) });
    if (result.status !== 0) throw new Error(`${path.basename(file)} misslyckades: ${redacted(result.stderr || result.stdout || result.error || '')}`);
    return (result.stdout || '').trim();
  };
  const choosePort = async name => {
    const selected = options.ports?.[name] ?? savedConfig?.ports?.[name];
    if (selected === undefined) return freePort();
    assert.ok(Number.isInteger(selected) && selected >= 1024 && selected <= 65535, `Ogiltig lokal testport: ${name}`);
    // Reject an occupied fixed port before initializing the database or launching any process.
    return freePort(selected);
  };
  const pgPort = await freePort(), restPort = await freePort(), bridgePort = await choosePort('bridge'), webPort = await choosePort('web'), metroPort = await freePort();
  assert.equal(new Set([pgPort, restPort, bridgePort, webPort, metroPort]).size, 5, 'Testprocesserna behöver fem olika portar.');
  const origin = `http://127.0.0.1:${webPort}`, backendOrigin = `http://127.0.0.1:${bridgePort}`;
  const sql = text => command(executable('psql'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], text);
  const rows = query => JSON.parse(sql(`select coalesce(json_agg(row_to_json(t)),'[]'::json) from (${query}) t;`));
  const start = (file, args, extra = {}, cwd = root) => {
    const child = spawn(file, args, { env: { ...env, ...extra }, cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const log = fs.createWriteStream(path.join(directory, `process-${children.length}.log`));
    for (const stream of [child.stdout, child.stderr]) {
      let pending = '';
      stream.on('data', chunk => {
        pending += chunk.toString();
        const lines = pending.split(/\r?\n/); pending = lines.pop();
        for (const line of lines) log.write(redacted(line) + '\n');
      });
      stream.on('end', () => { if (pending) log.write(redacted(pending)); });
    }
    child.once('close', () => log.end());
    child.once('error', error => {
      child.testStartupError = error;
      if (ready && !stopped) void stop().then(() => options.onFailure?.(new Error(`Isolerad testprocess kunde inte startas (${error.code || 'spawn'}).`))).catch(stopError => options.onFailure?.(new Error(`Testprocessens stopp misslyckades: ${redacted(stopError.message)}`)));
    });
    child.once('exit', (code, signal) => {
      if (!ready || stopped) return;
      const failure = new Error(`Isolerad testprocess avslutades oväntat (${path.basename(file)}, kod ${code ?? signal}). Starta en ny testsession. Redigerade loggar: ${directory}`);
      // Only stop processes created by this instance. Never restart against a partially stopped database.
      void stop().then(() => options.onFailure?.(failure)).catch(error => options.onFailure?.(new Error(`${failure.message}; stoppfel: ${redacted(error.message)}`)));
    });
    children.push(child); logs.push(log); return child;
  };
  const stop = async () => {
    if (stopped) return; stopped = true;
    for (const child of [...children].reverse()) {
      if (!child.pid) continue;
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const exit = new Promise(resolve => child.once('exit', resolve));
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      else child.kill('SIGTERM');
      await Promise.race([exit, new Promise(resolve => setTimeout(resolve, 5000).unref())]);
    }
    if (bridge?.listening) { bridge.closeAllConnections(); await new Promise(resolve => bridge.close(resolve)); }
    if (pgStarted) { command(executable('pg_ctl'), ['-D', pgData, '-m', 'fast', '-w', 'stop']); pgStarted = false; }
    if (fs.existsSync(activeSessionPath)) {
      const saved = JSON.parse(fs.readFileSync(activeSessionPath, 'utf8'));
      if (saved.isolationId === isolationId) fs.unlinkSync(activeSessionPath);
    }
    options.onStop?.();
  };
  const jwtSecret = savedConfig?.jwtSecret || randomBytes(48).toString('base64url');
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerEmail = 'owner@example.test';
  const jwt = claims => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 86400, ...claims })}`;
    return `${body}.${createHmac('sha256', jwtSecret).update(body).digest('base64url')}`;
  };
  const service = jwt({ role: 'service_role' }), anon = jwt({ role: 'anon' }), admin = jwt({ role: 'authenticated', sub: userId, email: ownerEmail });
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: ownerEmail, email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const session = { access_token: admin, refresh_token: randomBytes(32).toString('hex'), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user };
  const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const adminPassword = savedConfig?.adminPassword || randomBytes(12).toString('base64url');
  const orderLinkSecret = savedConfig?.orderLinkSecret || randomBytes(32).toString('hex');
  const orderRateLimitSecret = savedConfig?.orderRateLimitSecret || randomBytes(32).toString('hex');
  const schemaHash = createHash('sha256').update(fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort().map(name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8')).join('\n') + fs.readFileSync(path.join(root, 'test-support/payments/schema.sql'), 'utf8')).digest('hex');
  if (savedConfig && savedConfig.schemaHash !== schemaHash) throw new Error('Testschema har ändrats. Starta med dev:remote -- --reset för en ny databas; tidigare data behålls.');
  const mails = new Map(), pushes = new Map();
  const json = (response, status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' }); response.end(JSON.stringify(data)); };
  const isAdmin = request => (request.headers.cookie || '').split(';').map(item => item.trim()).includes(cookie);
  try {
    if (!savedConfig) command(executable('initdb'), ['-D', pgData, '-U', 'postgres', '--auth=trust', '--no-locale', '-E', 'UTF8']);
    command(executable('pg_ctl'), ['-D', pgData, '-l', path.join(directory, 'postgres.log'), '-o', `-p ${pgPort} -h 127.0.0.1 -c shared_buffers=16MB -c max_connections=40${process.platform === 'win32' ? '' : ' -c unix_socket_directories='}`, '-w', 'start']); pgStarted = true;
    if (savedConfig) {
      const marker = rows('select isolation_id,secret_hash from public.test_environment_guard where id=true')[0];
      assert.equal(marker?.isolation_id, isolationId, 'Återanvänd testdatabas har fel identitet.');
      assert.equal(marker?.secret_hash, createHash('sha256').update(secret).digest('hex'), 'Testdatabasens attestering misslyckades.');
    } else {
    sql(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);alter table storage.objects enable row level security;`);
    for (const file of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort()) sql(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
    sql(fs.readFileSync(path.join(root, 'test-support/payments/schema.sql'), 'utf8'));
    // This table exists only after the test-support schema; the random attestation binds this DB to this process.
    sql(`insert into public.test_environment_guard(id,isolation_id,secret_hash) values(true,${literal(isolationId)},${literal(createHash('sha256').update(secret).digest('hex'))});
      grant usage on schema public to anon,authenticated,service_role;grant all on all tables in schema public to service_role;
      insert into auth.users(id) values(${literal(userId)});
      update public.dishes set active=false;update public.menus set active=false;update public.delivery_zones set active=false;update public.campaigns set active=false;
      update public.business_settings set brand_name='Yehabibi TEST – syntetisk catering',contact_email='kitchen@example.test',contact_phone='0700000000',pickup_address='Testgatan 1, Teststad',custom_min_people=5,min_advance_days=1,pickup_enabled=true,delivery_enabled=true,cash_enabled=true,allow_unpaid_requests=true where id=1;
      insert into public.owner_push_tokens(admin_user_id,token) values(${literal(userId)},'ExpoPushToken[isolated_owner_test_device]');`);
    for (const [index, dish] of testDishes.entries()) sql(`insert into public.dishes(id,slug,title,description,price_ore,portion_label,active,suggested_per_person,category,sort_order) values(${literal(dish.id)},${literal(`synthetic-${index}`)},${literal(dish.title)},'Endast syntetisk testdata – inga riktiga beställningar',${dish.price},${literal(dish.unit)},true,${index === 0 ? 2.4 : index === 1 ? 0.4 : 1},${literal(dish.category)},${index});`);
    sql(`insert into public.menus(id,slug,title,description,included,allergens,price_ore,min_people,active,direct_order_enabled,catering_enabled,package_portions,preparation_minutes,extra_preparation_minutes,extra_preparation_every,image_url)
      values(${literal(testPackageId)},'syntetiskt-testpaket','TEST Libanesiskt paket','Syntetiskt testpaket för samma dag',array['Test hummus','Test falafel'],array['sesam'],12900,5,true,true,true,2,20,5,3,'/images/hero.webp');
      insert into public.delivery_zones(id,name,postal_prefixes,fee_ore,active,direct_enabled,travel_minutes) values('55555555-5555-4555-8555-555555555555','TEST zon',array['721'],10000,true,true,20);
      update public.menus set package_group='TEST mezze',size_label='2 portioner',catering_price_ore=12900,allowed_addon_ids=array['44444444-4444-4444-8444-000000000001'::uuid,'44444444-4444-4444-8444-000000000002'::uuid] where id=${literal(testPackageId)};
      insert into public.menus(id,slug,title,description,included,allergens,price_ore,catering_price_ore,min_people,active,direct_order_enabled,catering_enabled,package_portions,preparation_minutes,kitchen_units,package_group,size_label,image_url)
        values(${literal(testLargePackageId)},'syntetiskt-testpaket-stort','TEST Libanesiskt paket','Syntetisk storleksvariant',array['250 g TEST hummus','10 TEST falafel'],array['sesam'],29900,8900,5,true,true,true,5,30,3,'TEST mezze','5 portioner','/images/hero.webp');
      update public.dishes set direct_addon_enabled=true,preparation_minutes=5 where id in ('44444444-4444-4444-8444-000000000001','44444444-4444-4444-8444-000000000002');
      update public.direct_order_settings set enabled=true,auto_approve=true,min_advance_minutes=5,capacity_per_slot=100,
        weekly_hours=(select jsonb_agg(jsonb_build_object('weekday',day,'closed',false,'opens_at','00:00','closes_at','23:59','cutoff_at','23:45','pickup_from','00:00','pickup_until','23:59','delivery_from','00:00','delivery_until','23:59')) from generate_series(0,6) day) where id=1;`);
    // Registry schema comes from the real additive migration; only this isolated database gets local_test.
    sql(`insert into public.payment_provider_registry(provider,environment,checkout_base_url,active) values('local_test','test',${literal(origin + '/__test/payment/')},true);`);
    }
    // Keep a controlled runtime budget; cleanProcessEnvironment excludes
    // inherited GHCRTS and all provider secrets.
    start(postgrest, ['+RTS',process.platform === 'win32' ? '-N1' : '-N2','-RTS'], { PGRST_DB_URI: `postgresql://postgres@127.0.0.1:${pgPort}/postgres`, PGRST_DB_ANON_ROLE: 'anon', PGRST_DB_SCHEMAS: 'public', PGRST_SERVER_HOST: '127.0.0.1', PGRST_SERVER_PORT: String(restPort), PGRST_JWT_SECRET: jwtSecret });
    await waitReady(`http://127.0.0.1:${restPort}/`, children, directory);
    bridge = http.createServer(async (request, response) => {
      try {
        const url = new URL(request.url, backendOrigin);
        const chunks = []; for await (const chunk of request) { chunks.push(chunk); if (chunks.reduce((sum, item) => sum + item.length, 0) > 1024 * 1024) return json(response, 413, { error: 'Too large' }); }
        const body = Buffer.concat(chunks);
        if (url.pathname.startsWith('/rest/v1')) {
          const headers = { ...request.headers }; delete headers.host; delete headers['content-length'];
          const result = await fetch(`http://127.0.0.1:${restPort}${url.pathname.slice(8)}${url.search}`, { method: request.method, headers, ...(body.length ? { body } : {}) });
          response.writeHead(result.status, Object.fromEntries([...result.headers].filter(([key]) => !['content-encoding', 'transfer-encoding', 'content-length'].includes(key)))); response.end(Buffer.from(await result.arrayBuffer())); return;
        }
        if (url.pathname === '/auth/v1/user') return request.headers.authorization === `Bearer ${admin}` ? json(response, 200, user) : json(response, 401, { message: 'Invalid isolated admin session' });
        if (url.pathname === `/auth/v1/admin/users/${userId}` && request.headers.authorization === `Bearer ${service}`) return json(response, 200, { user });
        if (url.pathname === '/__test/login' && request.method === 'POST') {
          const supplied = new URLSearchParams(body.toString()).get('password');
          if (!equalSecret(supplied, adminPassword)) return json(response, 401, { error: 'Fel testlösenord.' });
          response.writeHead(303, { 'Set-Cookie': `${cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`, Location: `${origin}/admin/orders`, 'Cache-Control': 'no-store' }); response.end(); return;
        }
        if (url.pathname === '/__test/login') {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          response.end(`<html lang="sv"><title>Yehabibi testadmin</title><h1>TESTLÄGE – INGA RIKTIGA BESTÄLLNINGAR</h1><p>Separat lokal testadministratör. Lösenordet visas i startterminalen.</p><form method="post"><label>Testlösenord <input name="password" type="password" required autocomplete="off"></label><button>Logga in i testadmin</button></form></html>`); return;
        }
        if (url.pathname.startsWith('/__transport/')) {
          if (!equalSecret(request.headers['x-test-transport'], secret)) return json(response, 401, { error: 'Private transport' });
          const value = JSON.parse(body.toString() || '{}');
          if (url.pathname.startsWith('/__transport/email')) {
            const key = String(request.headers['idempotency-key'] || randomUUID());
            if (!mails.has(key)) mails.set(key, { id: randomUUID(), ...value, captured_at: new Date().toISOString() });
            return json(response, 200, { id: mails.get(key).id });
          }
          if (url.pathname.endsWith('/getReceipts')) return json(response, 200, { data: Object.fromEntries((value.ids || []).map(id => [id, { status: 'ok' }])) });
          const entries = Array.isArray(value) ? value : [value];
          const tickets = entries.map(entry => { const id = randomUUID(); pushes.set(id, { id, ...entry, captured_at: new Date().toISOString() }); return { id, status: 'ok' }; });
          return json(response, 200, { data: tickets });
        }
        if (url.pathname === '/__test/stop' && request.method === 'POST') {
          if (!equalSecret(request.headers['x-test-control'], secret)) return json(response, 401, { error: 'Private control' });
          json(response, 200, { stopping: true }); setImmediate(() => stop()); return;
        }
        if (url.pathname === '/__test/inbox') {
          if (!isAdmin(request)) return json(response, 401, { error: 'Logga in med testadmin.' });
          const inbox = privateView({ emails: [...mails.values()], pushes: [...pushes.values()] });
          if (request.headers.accept?.includes('text/html')) {
            response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
            response.end(`<html lang="sv"><title>Lokal testinkorg</title><h1>TESTLÄGE – lokal inkorg</h1><p>Inga meddelanden har skickats till en extern mottagare. Privata ordertoken är borttagna.</p><a href="${origin}/admin/orders">Admin</a><pre>${escapeHtml(JSON.stringify(inbox, null, 2))}</pre></html>`); return;
          }
          return json(response, 200, inbox);
        }
        json(response, 404, { error: 'Isolerad testresurs saknas.' });
      } catch { json(response, 500, { error: 'Lokalt testanrop misslyckades.' }); }
    });
    await new Promise((resolve, reject) => { bridge.once('error', reject); bridge.listen(bridgePort, '127.0.0.1', resolve); });
    // Reusable databases get a fresh source overlay on each run; never overwrite existing junctions.
    const workspace = path.join(directory, savedConfig ? `workspace-${randomUUID()}` : 'workspace'), web = path.join(workspace, 'apps/web');
    fs.mkdirSync(web, { recursive: true });
    for (const entry of ['src', 'public', 'package.json', 'tsconfig.json', 'next.config.ts', 'next-env.d.ts']) {
      const source = path.join(root, 'apps/web', entry); if (fs.existsSync(source)) fs.cpSync(source, path.join(web, entry), { recursive: true });
    }
    fs.cpSync(path.join(root, 'packages'), path.join(workspace, 'packages'), { recursive: true, filter: source => !/[/\\](node_modules|dist)([/\\]|$)/.test(source) && !path.basename(source).startsWith('.env') });
    fs.copyFileSync(path.join(root, 'package.json'), path.join(workspace, 'package.json'));
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    if (fs.existsSync(path.join(root, 'apps/web/node_modules'))) fs.symlinkSync(path.join(root, 'apps/web/node_modules'), path.join(web, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const support = path.join(root, 'test-support/payments'), modules = path.join(web, 'src/lib/test-payments');
    fs.mkdirSync(modules, { recursive: true });
    for (const entry of fs.readdirSync(support).filter(name => name.endsWith('.ts') && name !== 'runtime.ts')) fs.copyFileSync(path.join(support, entry), path.join(modules, entry));
    fs.copyFileSync(path.join(support, 'runtime.ts'), path.join(web, 'src/lib/payments/runtime.ts'));
    // App Router ignores underscore folders; percent-encoding produces literal /__test.
    const paymentPage = path.join(web, 'src/app/%5F%5Ftest/payment/[id]'); fs.mkdirSync(path.join(paymentPage, 'simulate'), { recursive: true });
    fs.copyFileSync(path.join(support, 'routes/page.tsx'), path.join(paymentPage, 'page.tsx'));
    fs.copyFileSync(path.join(support, 'routes/simulate.route.ts'), path.join(paymentPage, 'simulate/route.ts'));
    // Only this ignored overlay exposes readiness, after its actual database attestation is verified.
    const readiness = path.join(web, 'src/app/%5F%5Ftest/ready'); fs.mkdirSync(readiness, { recursive: true });
    fs.writeFileSync(path.join(readiness, 'route.ts'), `import { paymentRuntime } from '@/lib/payments/runtime';
export async function GET() {
  await paymentRuntime().validate();
  return Response.json({ isolation_id: process.env.TEST_ISOLATION_ID }, { headers: { 'Cache-Control': 'no-store' } });
}
`);
    const webEnv = { NODE_ENV: 'development', NODE_OPTIONS: `--import=${pathToFileURL(path.join(root, 'test-support/local/transport.mjs')).href}`, APP_ENV: 'test', TEST_ISOLATION_ID: isolationId, TEST_PAYMENT_SECRET: secret, TEST_BACKEND_ORIGIN: backendOrigin,
      NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_INDEXABLE: 'false', NEXT_PUBLIC_SUPABASE_URL: backendOrigin, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service,
      ORDERS_ENABLED: 'true', PAYMENTS_ENABLED: 'false', TEST_PAYMENTS_ENABLED: 'true', PAYMENT_PROVIDER: '', ADYEN_ENVIRONMENT: 'test', PAYMENTS_LIVE_APPROVED: 'false', ADYEN_LIVE_URL_PREFIX: '', ADYEN_API_KEY: '', ADYEN_HMAC_KEY: '', ADYEN_MERCHANT_ACCOUNT: '', ADYEN_ENABLED_METHODS: '', ADYEN_CAPTURE_MODE: '',
      NOTIFICATIONS_ENABLED: 'true', BACKGROUND_JOB_SECRET:randomBytes(32).toString('hex'), RESEND_API_KEY: 're_isolated_capture_only', EMAIL_FROM: 'Yehabibi TEST <orders@example.test>', OWNER_NOTIFICATION_EMAIL: ownerEmail, ADMIN_EMAILS: ownerEmail,
      ORDER_LINK_SECRET: orderLinkSecret, ORDER_RATE_LIMIT_SECRET: orderRateLimitSecret, OWNER_PUSH_ENABLED: 'true', CUSTOMER_PUSH_ENABLED: 'true', EXPO_ACCESS_TOKEN: '', MOBILE_WEB_ORIGINS: `http://localhost:${metroPort},http://127.0.0.1:${metroPort},http://10.0.2.2:${webPort},${origin}` };
    start(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(webPort)], webEnv, web);
    await waitReady(`${origin}/__test/ready`, children, directory, isolationId);
    // A real independent process invokes the same authenticated endpoint while browsers are closed.
    if(options.worker!==false)start(process.execPath,[path.join(root,'scripts/background-worker.mjs')],{
      BACKGROUND_JOB_URL:`${origin}/api/internal/jobs`,BACKGROUND_JOB_SECRET:webEnv.BACKGROUND_JOB_SECRET,BACKGROUND_JOB_INTERVAL_MS:'500'});
    const state = { isolationId, origin, backendOrigin, directory, metroPort, adminLogin: `${backendOrigin}/__test/login`, inbox: `${backendOrigin}/__test/inbox`, androidApi: `http://10.0.2.2:${webPort}`, marker: 'YEHABIBI_ISOLATED_LOCAL_TEST', controlSecret: secret };
    fs.writeFileSync(path.join(directory, 'private-session.json'), JSON.stringify({ ...state, adminPassword }, null, 2), { mode: 0o600 });
    if (options.reusable || savedConfig) fs.writeFileSync(path.join(directory, 'reusable-session.json'), JSON.stringify({marker:'YEHABIBI_REUSABLE_TEST_V1', isolationId, secret, jwtSecret, adminPassword, orderLinkSecret, orderRateLimitSecret, schemaHash, ports:{web:webPort,bridge:bridgePort,metro:metroPort}}, null, 2), {mode:0o600});
    if (options.persistent) fs.writeFileSync(activeSessionPath, JSON.stringify(state, null, 2), { mode: 0o600 });
    ready = true;
    const tick=async()=>{
      const result=await fetch(`${origin}/api/internal/jobs`,{method:'POST',headers:{Authorization:`Bearer ${webEnv.BACKGROUND_JOB_SECRET}`}});
      assert.equal(result.status,200,'Authenticated isolated worker tick failed');return result.json();
    };
    const waitFor=async(check,timeout=20000)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Timed out waiting for isolated background effect');};
    return { ...state, adminPassword, adminCookie: cookie, webEnv, stop, sql, rows, mails, pushes, userId, directory, web, children,tick,waitFor };
  } catch (error) { await stop(); throw error; }
}

export async function stopActiveSession() {
  if (!fs.existsSync(activeSessionPath)) return false;
  const saved = JSON.parse(fs.readFileSync(activeSessionPath, 'utf8'));
  const base = new URL(saved.backendOrigin);
  if (saved.marker !== 'YEHABIBI_ISOLATED_LOCAL_TEST' || base.hostname !== '127.0.0.1' || base.protocol !== 'http:' || !/^[a-f\d-]{36}$/.test(saved.isolationId)) throw new Error('Okänd session stoppas inte.');
  const response = await fetch(new URL('/__test/stop', base), { method: 'POST', headers: { 'x-test-control': saved.controlSecret }, signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error('Kunde inte autentisera stopp av den egna testsessionen.');
  for (let count = 0; count < 40 && fs.existsSync(activeSessionPath); count++) await new Promise(resolve => setTimeout(resolve, 250));
  return true;
}
