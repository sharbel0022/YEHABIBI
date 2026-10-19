import {setTimeout as delay} from 'node:timers/promises';

// The same entry point supports a supervised local process and a hosted scheduler.
// Credentials come from its environment/secret store, never command-line arguments.
const args=new Set(process.argv.slice(2));
const base=new URL(process.env.BACKGROUND_JOB_URL || 'http://127.0.0.1:3000/api/internal/jobs');
if (base.pathname!=='/api/internal/jobs' || base.search || base.hash || base.username || base.password
  || !(base.protocol==='https:' || base.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(base.hostname))) throw new Error('Use the authenticated job endpoint over HTTPS or loopback HTTP.');
const secret=process.env.BACKGROUND_JOB_SECRET;
if (!secret || secret.length<32) throw new Error('BACKGROUND_JOB_SECRET must contain at least 32 characters.');
const interval=Number(process.env.BACKGROUND_JOB_INTERVAL_MS || 60000);
if (!Number.isInteger(interval) || interval<100 || interval>3600000) throw new Error('Invalid worker interval.');
const stop=new AbortController();
process.once('SIGINT',()=>stop.abort()); process.once('SIGTERM',()=>stop.abort());
do {
  const start=Date.now();
  try {
    const result=await fetch(base,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.any([stop.signal,AbortSignal.timeout(110000)])});
    if (!result.ok) throw new Error('tick rejected');
    const data=await result.json();
    console.log(JSON.stringify({at:new Date().toISOString(),ok:true,completed:data.completed,failed:data.failed,notifications:data.notifications}));
  } catch {
    if (!stop.signal.aborted) { console.error(JSON.stringify({at:new Date().toISOString(),ok:false,error:'Background tick failed'})); if(args.has('--once'))process.exitCode=1; }
  }
  if (args.has('--once') || stop.signal.aborted) break;
  await delay(Math.max(100,interval-(Date.now()-start)),undefined,{signal:stop.signal}).catch(()=>{});
} while (!stop.signal.aborted);
