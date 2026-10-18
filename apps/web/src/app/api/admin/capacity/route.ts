import { z } from 'zod';
import { requireAdmin,checkOrigin,jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
export const dynamic='force-dynamic';
const holdSchema=z.object({resource:z.enum(['kitchen','delivery']),zone_id:z.string().uuid().nullable().optional(),starts_at:z.iso.datetime({offset:true}),ends_at:z.iso.datetime({offset:true}),units:z.number().int().min(1).max(1000),reason:z.string().trim().min(3).max(300)})
  .refine(value=>Date.parse(value.ends_at)>Date.parse(value.starts_at),'Sluttiden måste ligga efter starttiden.');
export async function GET() {
  if(!await requireAdmin())return jsonError('Obehörig.',401);
  const db=adminDb();
  const {error:cleanupError}=await db.rpc('release_expired_capacity_holds');
  if(cleanupError)return jsonError('Kapacitetsreservationerna kunde inte kontrolleras.',503);
  const [holds,zones]=await Promise.all([
    db.from('capacity_reservations').select('id,order_id,source,resource,zone_id,starts_at,ends_at,units,state,expires_at,reason').in('state',['held','confirmed']).gte('ends_at',new Date().toISOString()).order('starts_at').limit(300),
    db.from('delivery_zones').select('id,name').order('name')
  ]);
  if(holds.error||zones.error)return jsonError('Kapacitetsbokningarna kunde inte läsas.',503);
  return Response.json({holds:holds.data||[],zones:zones.data||[]},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request) {
  if(!checkOrigin(request))return jsonError('Felaktigt anrop.',403);
  const administrator=await requireAdmin();if(!administrator)return jsonError('Obehörig.',401);
  const input=await request.json().catch(()=>null);
  const release=z.object({action:z.literal('release'),id:z.string().uuid()}).safeParse(input);
  if(release.success) {
    const {data,error}=await adminDb().rpc('release_manual_capacity_hold',{p_hold_id:release.data.id,p_admin_id:administrator.id});
    if(error||!data)return jsonError('Endast en aktiv manuell bokning kan frigöras.',409);
    return Response.json({released:true},{headers:{'Cache-Control':'no-store'}});
  }
  const parsed=holdSchema.safeParse(input);if(!parsed.success)return jsonError('Kontrollera resurs, kapacitet, tider med UTC-offset och orsak.');
  const {data,error}=await adminDb().rpc('create_manual_capacity_hold',{p_input:parsed.data,p_admin_id:administrator.id});
  if(error||!data)return jsonError('Kapaciteten räcker inte för intervallet. Uppdatera och välj en annan tid eller mindre kapacitet.',409);
  return Response.json({hold:data},{status:201,headers:{'Cache-Control':'no-store'}});
}
