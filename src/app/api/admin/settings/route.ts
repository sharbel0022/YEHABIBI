import { requireAdmin, checkOrigin, jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { settingsSchema } from '@/lib/validators';
import { safeExternalUrl } from '@/lib/domain';

export const dynamic='force-dynamic';
export async function PATCH(request:Request) {
  if(!checkOrigin(request))return jsonError('Felaktigt anrop.',403);
  if(!await requireAdmin())return jsonError('Obehörig.',401);
  const parsed=settingsSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return jsonError('Kontrollera inställningarna.');
  const input=parsed.data;
  for(const key of ['google_review_url','google_maps_url','instagram_url','facebook_url','tiktok_url','hero_video_url'] as const){
    if(input[key]&&!safeExternalUrl(input[key]))return jsonError('Endast säkra HTTPS-länkar tillåts.');
  }
  if(input.hero_poster_url && !input.hero_poster_url.startsWith('/images/')&&!safeExternalUrl(input.hero_poster_url))return jsonError('Ogiltig bildadress.');
  if(!input.delivery_enabled&&!input.pickup_enabled)return jsonError('Aktivera leverans eller hämtning.');
  const {data,error}=await adminDb().from('business_settings').update({...input,updated_at:new Date().toISOString()}).eq('id',1).select('*').single();
  if(error||!data)return jsonError('Kunde inte spara inställningar.',500);
  return Response.json({settings:data});
}
