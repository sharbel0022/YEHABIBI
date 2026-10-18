import { requireAdmin, checkOrigin, jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { menuSchema } from '@/lib/validators';
import { z } from 'zod';
import { configuredMenuAddons } from '@/lib/admin-catalog';
export const dynamic='force-dynamic';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!checkOrigin(request))return jsonError('Felaktigt anrop.',403);
  if(!await requireAdmin())return jsonError('Obehörig.',401);
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return jsonError('Ogiltigt id.');
  const input=await request.json().catch(()=>null);
  const availability=z.object({action:z.literal('availability'),availability_state:z.enum(['available','paused','sold_out'])}).safeParse(input);
  if(availability.success) {
    const {data,error}=await adminDb().from('menus').update({availability_state:availability.data.availability_state,updated_at:new Date().toISOString()}).eq('id',id).select('*').maybeSingle();
    if(error||!data)return jsonError('Tillgängligheten kunde inte sparas.',503);
    return Response.json({menu:data},{headers:{'Cache-Control':'no-store'}});
  }
  const parsed=menuSchema.safeParse(input);
  if(!parsed.success)return jsonError('Kontrollera menyuppgifterna.');
  if(!await configuredMenuAddons(parsed.data.allowed_addon_ids))return jsonError('Välj aktiva rätter som har aktiverats som tillbehör.');
  const {data,error}=await adminDb().from('menus').update({...parsed.data,updated_at:new Date().toISOString()}).eq('id',id).select('*').maybeSingle();
  if(error||!data)return jsonError('Kunde inte uppdatera meny.',500);
  return Response.json({menu:data});
}
