import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {createRequire} from 'node:module';
import {repositoryRoot as root, cleanProcessEnvironment, freePort, startTestEnvironment} from '../test-support/local/environment.mjs';
import {tailscale, tailscaleJson, selectPrivateDevice, assertUnusedServePort, ownsServePort, releaseServe} from '../test-support/remote/tailscale.mjs';

const directory = path.join(root,'.tmp');
const stateFile = path.join(directory,'remote-active.json');
const lockFile = path.join(directory,'remote-starting.json');
const databaseFile = path.join(directory,'remote-database.json');
const credentialsFile = path.join(directory,'remote-credentials.txt');
const marker = 'YEHABIBI_PRIVATE_REMOTE_V442';
const argv = process.argv.slice(2);
const readOption = name => {const i=argv.indexOf(name); if(i<0)return undefined; if(!argv[i+1] || argv[i+1].startsWith('--'))throw new Error(`Värde saknas för ${name}.`); return argv[i+1];};
const writePrivate = (file,value) => fs.writeFileSync(file,JSON.stringify(value,null,2),{mode:0o600});
const readState = () => {if(!fs.existsSync(stateFile))return null; const state=JSON.parse(fs.readFileSync(stateFile,'utf8')); const control=new URL(state.controlOrigin); if(state.marker!==marker || control.protocol!=='http:' || control.hostname!=='127.0.0.1' || control.pathname!=='/' || control.search || control.hash || control.username || control.password)throw new Error('Okänd fjärrsession lämnas orörd.'); return state;};
const request = (url,options={},timeout=10000) => fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(timeout)});
async function controller(state,route,method='GET') {const response=await request(`${state.controlOrigin}${route}`,{method,headers:{'x-yehabibi-control':state.controlToken}},30000); if(!response.ok)throw new Error('Den egna sessionskontrollen svarade inte korrekt.');return response.json();}
async function stopActive() {
  const state=readState();
  if(!state){console.log('Ingen aktiv privat fjärrtestsession.');return;}
  try{await controller(state,'/stop','POST');}catch{throw new Error('Sessionskontrollen kan inte nås. Inga process-ID:n eller främmande Serve-inställningar stoppas. Kör doctor och granska den sparade sessionen manuellt.');}
  for(let n=0;n<160 && fs.existsSync(stateFile);n++)await new Promise(resolve=>setTimeout(resolve,250));
  if(fs.existsSync(stateFile))throw new Error('Stoppet är inte bekräftat; kör dev:remote:doctor.');
  console.log('Den egna fjärrtestsessionen är stoppad. Databasdata och befintlig Tailscale-konfiguration har behållits.');
}
async function doctor() {
  const problems=[];
  console.log('TESTLÄGE – INGA RIKTIGA PENGAR');
  let status;
  try{status=await tailscaleJson(['status','--json']);console.log(`Tailscale: ${status.BackendState==='Running'?'anslutet':'inte anslutet'}`);if(status.BackendState!=='Running')problems.push('Logga själv in på Tailscale.');}catch(error){problems.push(error.message);}
  const state=readState();
  if(!state){console.log('Backend / worker / Expo: ingen aktiv fjärrsession.');if(fs.existsSync(lockFile))problems.push('En start pågår eller avbröts. Granska remote-starting.json; ta inte bort låset medan processer kör.');}
  else {
    try{
      const live=await controller(state,'/status');
      for(const [key,title] of Object.entries({backend:'Backend',worker:'Bakgrundsworker',metro:'Expo/Metro',privateHttps:'Privat backend-HTTPS',tunnel:'Expo Tunnel',api:'API-adress'})){console.log(`${title}: ${live[key]?'OK':'BLOCKERAD'}`);if(!live[key])problems.push(`${title} kunde inte verifieras.`);}
      console.log(`Privat webb/API: ${state.publicOrigin}`);
      if(live.tunnel)console.log(`Expo Go: ${state.expoUrl}`);
    }catch{problems.push('Sessionskontrollen svarar inte. Ingen automatisk processavslutning utförs.');}
    if(status){const peer=Object.values(status.Peer||{}).find(value=>value.ID===state.deviceId);console.log(`Vald telefon: ${peer?.Online?'online':'offline eller inte tillgänglig'} (fysiskt 4G/5G-prov krävs separat).`);}
  }
  console.log('Fysisk mobil och SDK-kompatibel Expo Go: måste verifieras på telefonen.');
  if(problems.length){problems.forEach(problem=>console.log(`BLOCKERAR: ${problem}`));process.exitCode=1;}
}
async function discoverExpo(port,child,expectedApiOrigin,shouldStop=()=>false,deadlineMs=120000) {
  const deadline=Date.now()+deadlineMs;
  const headers={'expo-platform':'ios',accept:'application/expo+json','ngrok-skip-browser-warning':'true'};
  while(Date.now()<deadline){
    if(shouldStop())throw new Error('Expo-starten avbröts.');
    if(child.exitCode!==null || child.signalCode!==null)throw new Error('Expo-processen avslutades innan tunneln var klar. Se .tmp/remote-expo.log.');
    try{
      const manifest=await request(`http://127.0.0.1:${port}/`,{headers}).then(response=>response.json());
      const host=manifest.extra?.expoClient?.hostUri;
      if(typeof host==='string' && /^[a-z0-9-]+\.exp\.direct$/.test(host)){
        const remote=await request(`https://${host}/`,{headers});
        const remoteManifest=await remote.json();
        if(remote.ok && remoteManifest.extra?.expoClient?.hostUri===host && remoteManifest.extra?.expoClient?.sdkVersion===manifest.extra.expoClient.sdkVersion
          && remoteManifest.extra.expoClient.extra?.appEnvironment==='test'
          && remoteManifest.extra.expoClient.extra?.remoteTestApiOrigin===expectedApiOrigin)return `exp://${host}`;
      }
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('Expo/Metro startade men någon verifierad Expo Go-tunnel skapades inte inom 120 sekunder. Se .tmp/remote-expo.log. Backend exponeras aldrig via publik fallback.');
}
async function start() {
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<22 || major===22 && minor<13)throw new Error('Node.js 22.13 eller senare krävs.');
  fs.mkdirSync(directory,{recursive:true});
  const active=readState();
  if(active){await controller(active,'/status');console.log(`En egen session kör redan. Privat webb: ${active.publicOrigin}\nExpo Go: ${active.expoUrl}\nAnvänd dev:remote:stop före omstart.`);return;}
  const require=createRequire(path.join(root,'apps/mobile/package.json'));
  for(const dependency of ['expo/package.json','@expo/ngrok/package.json','next/package.json']){try{require.resolve(dependency);}catch{throw new Error(`Beroendet ${dependency} saknas. Kör npm ci från repots rot.`);}}
  console.log(`Node ${process.version}; npm ${process.env.npm_config_user_agent?.match(/npm\/([^ ]+)/)?.[1]||'starta via npm run dev:remote'}.`);
  const status=await tailscaleJson(['status','--json']);
  const device=selectPrivateDevice(status,readOption('--device'));
  const httpsPort=Number(readOption('--https-port') || 8443);
  const previousServe=await tailscaleJson(['serve','status','--json']);
  assertUnusedServePort(previousServe,httpsPort);
  if(!device.online)console.log('Telefonen är registrerad men offline. Anslut Tailscale på telefonen före mobilprovet.');
  else {
    try{await tailscale(['ping','--c=1','--timeout=5s',device.deviceName]);console.log('Registrerad telefon svarar via privat tailnet. 4G/5G och Expo måste verifieras på telefonen.');}
    catch{console.log('Telefonen är registrerad men svarar inte på Tailscale-ping just nu. Servern startas med samma privata autentisering; mobilprovet kräver att telefonen återansluts.');}
  }
  let lock;
  try{lock=fs.openSync(lockFile,'wx',0o600);fs.writeFileSync(lock,JSON.stringify({marker,pid:process.pid}));}catch{throw new Error('En start pågår eller avbröts. Kör dev:remote:doctor; inget befintligt startlås skrivs över.');}
  let session,gateway,expo,serveLease,control,log,stopping=false,booting=true,shutdownRequested=false;
  const checkContinue=()=>{if(shutdownRequested)throw new Error('Starten avbröts. Den egna sessionen stängs säkert.');};
  let finish;const finished=new Promise(resolve=>{finish=resolve;});
  const cleanup=async()=>{
    if(stopping)return;stopping=true;
    const errors=[];
    // Close the remote entry first; never reset unrelated Tailscale services.
    if(serveLease)try{await releaseServe(serveLease);}catch(error){errors.push(error.message);}
    if(gateway)try{await gateway.close();}catch{errors.push('Gateway kunde inte stängas.');}
    if(expo && expo.exitCode===null && expo.signalCode===null){const exit=new Promise(resolve=>expo.once('exit',resolve));if(process.platform==='win32')spawnSync('taskkill',['/pid',String(expo.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});else expo.kill('SIGTERM');await Promise.race([exit,new Promise(resolve=>setTimeout(resolve,5000))]);}
    if(session)try{await session.stop();}catch{errors.push('Databasstopp måste granskas i doctor.');}
    if(control?.listening){control.closeAllConnections();await new Promise(resolve=>control.close(resolve));}
    log?.end();
    if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
    else {if(fs.existsSync(stateFile))fs.unlinkSync(stateFile);if(fs.existsSync(credentialsFile))fs.unlinkSync(credentialsFile);}
    fs.closeSync(lock);if(fs.existsSync(lockFile))fs.unlinkSync(lockFile);
    finish();
  };
  const shutdown=()=>{shutdownRequested=true;if(!booting)void cleanup();};process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  try{
    const publicOrigin=`https://${device.dns}:${httpsPort}`;
    const accessToken=randomBytes(32).toString('base64url'),adminToken=randomBytes(32).toString('base64url'),controlToken=randomBytes(32).toString('base64url');
    let health=async()=>({backend:false,metro:false,tunnel:false,worker:false,privateHttps:false,api:false});
    control=http.createServer(async(req,res)=>{
      const supplied=req.headers['x-yehabibi-control'];
      if(typeof supplied!=='string' || Buffer.byteLength(supplied)!==Buffer.byteLength(controlToken) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(controlToken))){res.writeHead(401);res.end();return;}
      if(req.url==='/stop' && req.method==='POST'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"stopping":true}');setImmediate(shutdown);}
      else if(req.url==='/status' && req.method==='GET'){try{const data=await health();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}catch{res.writeHead(503);res.end();}}
      else {res.writeHead(404);res.end();}
    });
    await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(0,'127.0.0.1',resolve);});
    const controlOrigin=`http://127.0.0.1:${control.address().port}`;
    writePrivate(stateFile,{marker,pid:process.pid,controlOrigin,controlToken,publicOrigin,expoUrl:null,deviceId:device.deviceId,stage:'starting'});
    checkContinue();
    let restoreDirectory;
    if(fs.existsSync(databaseFile) && !argv.includes('--reset')){const saved=JSON.parse(fs.readFileSync(databaseFile,'utf8'));if(saved.marker!==marker)throw new Error('Okänd sparad databas.');restoreDirectory=saved.directory;}
    console.log(restoreDirectory?'Startar tidigare isolerad testdatabas med bevarade order.':'Startar ny syntetisk, isolerad testdatabas.');
    session=await startTestEnvironment({reusable:true,restoreDirectory,onFailure:error=>{console.error(error.message);process.exitCode=1;shutdown();}});
    writePrivate(databaseFile,{marker,directory:session.directory});
    checkContinue();
    const {startRemoteGateway}=await import('../test-support/remote/gateway.mjs');
    gateway=await startRemoteGateway({session,publicOrigin,allowedLogins:device.allowedLogins,accessToken,adminToken});
    checkContinue();
    // Recheck immediately before mutation. Only an entirely unused port is eligible.
    assertUnusedServePort(await tailscaleJson(['serve','status','--json']),httpsPort);
    const candidate={dns:device.dns,port:httpsPort,target:gateway.origin};
    try{await tailscale(['serve','--bg',`--https=${httpsPort}`,'--yes',gateway.origin]);}
    catch(error){if(ownsServePort(await tailscaleJson(['serve','status','--json']),candidate))serveLease=candidate;throw error;}
    serveLease=candidate;
    checkContinue();
    if(!ownsServePort(await tailscaleJson(['serve','status','--json']),serveLease))throw new Error('Den egna privata Serve-anslutningen kunde inte verifieras.');
    const verifyPrivate=async(timeout=10000)=>{try{const response=await request(`${publicOrigin}/__remote/health`,{headers:{'X-Yehabibi-Remote-Token':accessToken}},timeout);const value=await response.json();return response.ok && value.isolation_id===session.isolationId && value.test_mode===true;}catch{return false;}};
    let privateReady=false;
    for(let attempt=0;attempt<8 && !privateReady;attempt++){privateReady=await verifyPrivate();if(!privateReady)await new Promise(resolve=>setTimeout(resolve,1000));}
    if(!privateReady){
      let detail='nätverksfel';
      try{const response=await request(`${publicOrigin}/__remote/health`,{headers:{'X-Yehabibi-Remote-Token':accessToken}});detail=`HTTP ${response.status}`;}catch(error){detail=error.cause?.code || error.name;}
      throw new Error(`Privat HTTPS/Tailscale-identitet eller isolerad backendhälsa kunde inte verifieras (${detail}).`);
    }
    checkContinue();
    const metroPort=await freePort(session.metroPort);
    log=fs.createWriteStream(path.join(directory,'remote-expo.log'),{flags:'w',mode:0o600});
    expo=spawn(process.execPath,['--dns-result-order=ipv4first',path.join(root,'node_modules/expo/bin/cli'),'start','--go','--tunnel','--port',String(metroPort)],{
      cwd:path.join(root,'apps/mobile'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...cleanProcessEnvironment(),EXPO_NO_DOTENV:'1',APP_ENV:'test',EXPO_PUBLIC_REMOTE_TEST:'true',EXPO_PUBLIC_API_URL:publicOrigin},
    });
    for(const stream of [expo.stdout,expo.stderr])stream.on('data',chunk=>log.write(chunk));
    expo.once('error',()=>{console.error('Expo kunde inte startas.');process.exitCode=1;shutdown();});
    console.log('Privat HTTPS och isoleringsmarkör verifierade. Startar Expo Tunnel ...');
    const expoUrl=await discoverExpo(metroPort,expo,publicOrigin,()=>shutdownRequested);
    checkContinue();
    health=async()=>{
      const [backend,metro,remote,privateHttps]=await Promise.all([
        request(`${session.origin}/__test/ready`,{},3000).then(response=>response.json()).then(value=>value.isolation_id===session.isolationId).catch(()=>false),
        request(`http://127.0.0.1:${metroPort}/status`,{},3000).then(response=>response.text()).then(value=>value.includes('packager-status:running')).catch(()=>false),
        request(expoUrl.replace('exp://','https://')+'/',{headers:{'expo-platform':'ios',accept:'application/expo+json','ngrok-skip-browser-warning':'true'}},3000).then(response=>response.json()).catch(()=>null),
        verifyPrivate(3000),
      ]);
      const tunnel=remote?.extra?.expoClient?.hostUri===expoUrl.slice(6);
      const api=remote?.extra?.expoClient?.extra?.appEnvironment==='test' && remote?.extra?.expoClient?.extra?.remoteTestApiOrigin===publicOrigin;
      const worker=session.children.find(child=>child.spawnargs?.some(arg=>arg.endsWith('background-worker.mjs')));
      return {backend,metro,tunnel,worker:!!worker && worker.exitCode===null && worker.signalCode===null,privateHttps,api};
    };
    writePrivate(stateFile,{marker,pid:process.pid,controlOrigin:`http://127.0.0.1:${control.address().port}`,controlToken,publicOrigin,expoUrl,deviceId:device.deviceId,isolationId:session.isolationId,serveLease});
    fs.writeFileSync(credentialsFile,`TESTLÄGE – INGA RIKTIGA PENGAR\nMobil sessionsnyckel: ${accessToken}\nFörhöjd webbläsarnyckel (simulator/admin): ${adminToken}\nTestadmin-lösenord: ${session.adminPassword}\nPrivat inloggning: ${publicOrigin}/__remote/login\n`,{mode:0o600});
    expo.once('exit',()=>{if(!stopping){console.error('Expo avslutades. Den egna fjärrsessionen stängs.');process.exitCode=1;void cleanup();}});
    booting=false;
    console.log(`TESTLÄGE – INGA RIKTIGA PENGAR\nExpo Go: ${expoUrl}\nPrivat webb/API: ${publicOrigin}\nPrivat webbinloggning: ${publicOrigin}/__remote/login\nLokala nycklar: ${credentialsFile}\nLäs nycklarna lokalt; dela dem inte i chatt/GitHub.\nExpo SDK 57: iPhone kräver SDK-kompatibel Expo Go via eas go/TestFlight eller development build. Vanlig App Store-version räcker inte.\nCtrl+C eller npm run dev:remote:stop stoppar endast denna session. Data behålls.`);
    await finished;
  }catch(error){await cleanup();throw error;}
}
try{if(argv.includes('--stop'))await stopActive();else if(argv.includes('--doctor'))await doctor();else await start();}
catch(error){console.error(`BLOCKERAR: ${error.message}`);process.exitCode=1;}
