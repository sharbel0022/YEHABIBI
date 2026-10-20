import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {currentBootId} from '../test-support/remote/reboot.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'.tmp'), lockFile=path.join(directory,'remote-server-supervisor.json');
export function serverPaused(saved,bootId){return saved?.bootId===bootId;}
export async function requestServerRefresh({state,pid,fetch:send=globalThis.fetch}){
  if(state?.marker!=='YEHABIBI_PRIVATE_REMOTE_V442'||state.pid!==pid||typeof state.controlToken!=='string')return false;
  const origin=new URL(state.controlOrigin);
  if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||!origin.port||origin.pathname!=='/'||origin.username||origin.password||origin.search||origin.hash)return false;
  const response=await send(new URL('/stop',origin),{method:'POST',headers:{'x-yehabibi-control':state.controlToken},redirect:'error',signal:AbortSignal.timeout(10000)});
  return response.ok;
}
const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
const alive=pid=>{if(!Number.isSafeInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};

export async function supervise(){
  fs.mkdirSync(directory,{recursive:true});
  const bootId=await currentBootId(), previous=read(lockFile);
  if(previous?.bootId===bootId && alive(previous.pid))return;
  if(previous)fs.unlinkSync(lockFile);
  const descriptor=fs.openSync(lockFile,'wx',0o600);
  fs.writeFileSync(descriptor,JSON.stringify({pid:process.pid,bootId}));fs.closeSync(descriptor);
  let stopped=false,child;
  const paused=()=>stopped||serverPaused(read(path.join(directory,'remote-server-paused.json')),bootId);
  const stop=()=>{stopped=true;child?.kill('SIGTERM');};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  const wait=async()=>{for(let i=0;i<20&&!paused();i++)await new Promise(resolve=>setTimeout(resolve,500));};
  try{
    while(!paused()){
      // Reuse a manually started session without launching duplicate servers.
      const existing=read(path.join(directory,'remote-active.json'));
      if(existing?.bootId===bootId&&alive(existing.pid)){await wait();continue;}
      child=spawn(process.execPath,['--experimental-strip-types',path.join(root,'scripts/remote-dev.mjs'),'--server'],
        {cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
      for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>process.stdout.write(chunk));
      const ownedPid=child.pid,startedAt=Date.now();let refreshing=false;
      // The isolated environment issues 24-hour backend JWTs. Remint them by a
      // controlled restart well before expiry, without extending their privileges.
      const renewal=setInterval(async()=>{
        if(refreshing||paused()||Date.now()-startedAt<12*60*60*1000)return;
        refreshing=true;
        try{const state=read(path.join(directory,'remote-active.json'));if(state?.bootId===bootId)await requestServerRefresh({state,pid:ownedPid});}
        catch{console.error('Yehabibi: automatisk serverförnyelse återförsöks.');}
        finally{refreshing=false;}
      },60000);
      try{await new Promise(resolve=>{child.once('error',resolve);child.once('exit',resolve);});}
      finally{clearInterval(renewal);child=null;}
      if(!paused()){console.log('Yehabibi: återansluter servern automatiskt.');await wait();}
    }
  }finally{
    if(read(lockFile)?.pid===process.pid)fs.unlinkSync(lockFile);
    process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  supervise().catch(()=>{console.error('Yehabibi: bakgrundsstarten kunde inte verifieras. Kontrollera serverloggen.');process.exitCode=1;});
}
