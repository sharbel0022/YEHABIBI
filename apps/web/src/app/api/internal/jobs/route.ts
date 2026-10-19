import { authorizedJobRequest } from '@/lib/jobs/policy';
import { runBackgroundJobs } from '@/lib/jobs/runtime';
import { adminDb } from '@/lib/supabase';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request) {
  if (!authorizedJobRequest(request.headers.get('authorization'),process.env.BACKGROUND_JOB_SECRET)) return response({error:'Unauthorized'},401);
  try { return response(await runBackgroundJobs()); }
  catch { return response({error:'Background tick failed; inspect authenticated job health'},503); }
}
export async function GET(request:Request) {
  if (!authorizedJobRequest(request.headers.get('authorization'),process.env.BACKGROUND_JOB_SECRET)) return response({error:'Unauthorized'},401);
  const {data,error}=await adminDb().rpc('background_job_health').abortSignal(AbortSignal.timeout(8000));
  return error ? response({error:'Job health unavailable'},503) : response(data);
}
