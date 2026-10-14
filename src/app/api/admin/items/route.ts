import {requireAdmin,checkOrigin,jsonError} from '@/lib/auth';
import {adminDb} from '@/lib/supabase';
import {itemSchema} from '@/lib/validators';
import {safeExternalUrl} from '@/lib/domain';

export const dynamic='force-dynamic';

/** The owner controls every approved unit price. Never accept dish prices from a customer. */
export async function POST(request:Request){
  if(!checkOrigin(request))return jsonError('Felaktigt anrop.',403);
  if(!await requireAdmin())return jsonError('Obehörig.',401);
  const parsed=itemSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return jsonError('Kontrollera rättens uppgifter.');
  const dish=parsed.data;
  if(dish.image_url&&!dish.image_url.startsWith('/images/')&&!safeExternalUrl(dish.image_url))
    return jsonError('Bildadress måste vara HTTPS.');
  const {data,error}=await adminDb().from('menu_items')
    .insert({...dish,image_url:dish.image_url||null}).select('*').single();
  if(error||!data)return jsonError('Kunde inte skapa maträtt.',500);
  return Response.json({item:data},{status:201});
}
