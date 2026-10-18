import { requireAdmin, checkOrigin, jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { schedulingSchema } from '@/lib/validators';
import { getSchedulingSettings } from '@/lib/data';
import { z } from 'zod';

export const dynamic='force-dynamic';
export async function GET() {
  if(!await requireAdmin()) return jsonError('Obehörig.',401);
  try { return Response.json({scheduling:await getSchedulingSettings()},{headers:{'Cache-Control':'no-store'}}); }
  catch { return jsonError('Kunde inte läsa tidsinställningar.',503); }
}
export async function PATCH(request:Request) {
  if(!checkOrigin(request)) return jsonError('Felaktigt anrop.',403);
  if(!await requireAdmin()) return jsonError('Obehörig.',401);
  const input=await request.json().catch(()=>null);
  const operation=z.object({action:z.enum(['pause','resume','delay']),minutes:z.number().int().min(-120).max(120).optional()}).safeParse(input);
  if(operation.success) {
    const current=await getSchedulingSettings();
    const changes=operation.data.action==='delay' ? {capacity_buffer_minutes:Math.max(0,Math.min(1440,current.capacity_buffer_minutes+(operation.data.minutes??15)))} : {paused:operation.data.action==='pause'};
    const {data,error}=await adminDb().from('direct_order_settings').update({...changes,updated_at:new Date().toISOString()}).eq('id',1).eq('paused',current.paused).eq('capacity_buffer_minutes',current.capacity_buffer_minutes).select('id').maybeSingle();
    if(error||!data)return jsonError('Köksinställningarna ändrades samtidigt. Uppdatera och försök igen.',409);
    return Response.json({scheduling:await getSchedulingSettings()},{headers:{'Cache-Control':'no-store'}});
  }
  const parsed=schedulingSchema.safeParse(input);
  if(!parsed.success) return jsonError('Kontrollera öppettider, tidsintervall och kapacitet.');
  const {error}=await adminDb().from('direct_order_settings').update({...parsed.data,updated_at:new Date().toISOString()}).eq('id',1);
  if(error) return jsonError('Kunde inte spara tidsinställningar.',503);
  return Response.json({scheduling:await getSchedulingSettings()},{headers:{'Cache-Control':'no-store'}});
}
