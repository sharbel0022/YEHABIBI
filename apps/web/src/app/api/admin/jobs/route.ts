import { z } from 'zod';
import { requireAdmin,checkOrigin,jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';

export const dynamic='force-dynamic';
const settings=z.object({watchdog_enabled:z.boolean(),job_health_required:z.boolean(),job_health_max_age_seconds:z.number().int().min(120).max(3600),
  notification_reception_available:z.boolean(),notification_backup_approved:z.boolean(),
  reminder_minutes:z.number().int().min(1).max(120),escalation_minutes:z.number().int().min(2).max(240),
  preparation_reminder_minutes:z.number().int().min(1).max(1440)}).strict().refine(value=>value.escalation_minutes>value.reminder_minutes);
export async function GET() {
  if(!await requireAdmin())return jsonError('Obehörig.',401);
  const db=adminDb();
  const [{data:health,error},{data:config,error:configError}]=await Promise.all([
    db.rpc('background_job_health'),db.from('direct_order_settings').select('watchdog_enabled,job_health_required,job_health_max_age_seconds,notification_reception_available,notification_backup_approved,reminder_minutes,escalation_minutes,preparation_reminder_minutes').eq('id',1).single()]);
  if(error||configError)return jsonError('Jobbhälsan kunde inte läsas.',503);
  return Response.json({health,settings:config},{headers:{'Cache-Control':'no-store'}});
}
export async function PATCH(request:Request) {
  if(!checkOrigin(request))return jsonError('Felaktigt anrop.',403);
  if(!await requireAdmin())return jsonError('Obehörig.',401);
  const input=settings.safeParse(await request.json().catch(()=>null));
  if(!input.success)return jsonError('Kontrollera driftregler och larmgränser.');
  const {error}=await adminDb().from('direct_order_settings').update({...input.data,updated_at:new Date().toISOString()}).eq('id',1);
  if(error)return jsonError('Driftreglerna kunde inte sparas.',503);
  return GET();
}
