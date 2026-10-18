import { requireAdmin,jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
export const dynamic='force-dynamic';
export async function GET() {
  if(!await requireAdmin())return jsonError('Obehörig.',401);
  const db=adminDb();
  const {data:watchdog,error:watchdogError}=await db.rpc('run_kitchen_watchdog');
  if(watchdogError)return jsonError('Kökets mottagning kunde inte kontrolleras.',503);
  const {data,error}=await db.from('direct_order_settings').select('paused,capacity_buffer_minutes').eq('id',1).single();
  if(error||!data)return jsonError('Köksinställningarna kunde inte läsas.',503);
  const now=new Date();
  return Response.json({server_now:now.toISOString(),paused:data.paused,buffer_minutes:data.capacity_buffer_minutes,alerts:watchdog?.alerts||[]},{headers:{'Cache-Control':'no-store'}});
}
