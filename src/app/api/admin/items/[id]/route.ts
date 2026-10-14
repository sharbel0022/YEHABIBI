import {requireAdmin,checkOrigin,jsonError} from '@/lib/auth';
import {adminDb} from '@/lib/supabase';
import {itemSchema} from '@/lib/validators';
import {safeExternalUrl} from '@/lib/domain';

export const dynamic='force-dynamic';

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!checkOrigin(request))return jsonError('Felaktigt anrop.',403);
  if(!await requireAdmin())return jsonError('Obehörig.',401);
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return jsonError('Ogiltigt id.');
  const parsed=itemSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return jsonError('Kontrollera rättens uppgifter.');
  const dish=parsed.data;
  if(dish.image_url&&!dish.image_url.startsWith('/images/')&&!safeExternalUrl(dish.image_url))
    return jsonError('Bildadress måste vara HTTPS.');
  const {data,error}=await adminDb().from('menu_items')
    .update({...dish,image_url:dish.image_url||null,updated_at:new Date().toISOString()})
    .eq('id',id).select('*').maybeSingle();
  if(error||!data)return jsonError('Kunde inte uppdatera maträtt.',500);
  return Response.json({item:data});
}
