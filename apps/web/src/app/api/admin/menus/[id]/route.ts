import { requireAdmin, checkOrigin, jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { menuSchema } from '@/lib/validators';
export const dynamic='force-dynamic';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!checkOrigin(request))return jsonError('Felaktigt anrop.',403);
  if(!await requireAdmin())return jsonError('Obehörig.',401);
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return jsonError('Ogiltigt id.');
  const parsed=menuSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return jsonError('Kontrollera menyuppgifterna.');
  const {data,error}=await adminDb().from('menus').update({...parsed.data,updated_at:new Date().toISOString()}).eq('id',id).select('*').maybeSingle();
  if(error||!data)return jsonError('Kunde inte uppdatera meny.',500);
  return Response.json({menu:data});
}
