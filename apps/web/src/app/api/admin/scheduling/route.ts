import { requireAdmin, checkOrigin, jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { schedulingSchema } from '@/lib/validators';
import { getSchedulingSettings } from '@/lib/data';

export const dynamic='force-dynamic';
export async function GET() {
  if(!await requireAdmin()) return jsonError('Obehörig.',401);
  try { return Response.json({scheduling:await getSchedulingSettings()},{headers:{'Cache-Control':'no-store'}}); }
  catch { return jsonError('Kunde inte läsa tidsinställningar.',503); }
}
export async function PATCH(request:Request) {
  if(!checkOrigin(request)) return jsonError('Felaktigt anrop.',403);
  if(!await requireAdmin()) return jsonError('Obehörig.',401);
  const parsed=schedulingSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return jsonError('Kontrollera öppettider, tidsintervall och kapacitet.');
  const {error}=await adminDb().from('direct_order_settings').update({...parsed.data,updated_at:new Date().toISOString()}).eq('id',1);
  if(error) return jsonError('Kunde inte spara tidsinställningar.',503);
  return Response.json({scheduling:await getSchedulingSettings()},{headers:{'Cache-Control':'no-store'}});
}
