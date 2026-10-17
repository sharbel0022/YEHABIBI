import { requireAdmin, checkOrigin, jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { settingsSchema } from '@/lib/validators';
import { safeExternalUrl } from '@/lib/domain';
import { getSettings } from '@/lib/data';

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
  if(input.campaign_start_date && input.campaign_end_date &&
      input.campaign_start_date > input.campaign_end_date)
    return jsonError('Kampanjens slutdatum måste komma efter startdatum.');
  if(input.campaign_image_url &&
      !input.campaign_image_url.startsWith('/images/') &&
      !safeExternalUrl(input.campaign_image_url))
    return jsonError('Ogiltig kampanjbild.');
  if(input.hero_poster_url && !input.hero_poster_url.startsWith('/images/')&&!safeExternalUrl(input.hero_poster_url))return jsonError('Ogiltig bildadress.');
  if(!input.delivery_enabled&&!input.pickup_enabled)return jsonError('Aktivera leverans eller hämtning.');
  const {error}=await adminDb().rpc('update_catering_settings',{p_settings:input});
  if(error)return jsonError('Kunde inte spara inställningar.',500);
  return Response.json({settings:await getSettings()},{headers:{'Cache-Control':'no-store'}});
}
