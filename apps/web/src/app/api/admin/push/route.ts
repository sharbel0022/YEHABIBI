import { requireAdmin, checkOrigin, jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { checkOwnerPushReceipts, isExpoPushToken } from '@/lib/push';

export const dynamic = 'force-dynamic';
export async function POST(request:Request) {
  if(!checkOrigin(request)) return jsonError('Felaktigt anrop.',403);
  const user = await requireAdmin();
  if(!user) return jsonError('Obehörig.',401);
  const body = await request.json().catch(()=>null);
  if(body?.action==='check') {
    try { return Response.json({checked:await checkOwnerPushReceipts(user.id)},{headers:{'Cache-Control':'no-store'}}); }
    catch { return jsonError('Pushkvitton kunde inte hämtas. Ordermejl påverkas inte.',503); }
  }
  if(typeof body?.token !== 'string' || !isExpoPushToken(body.token)) return jsonError('Ange en giltig Expo-pushtoken från en development build.');
  const {error} = await adminDb().from('owner_push_tokens').upsert({token:body.token,admin_user_id:user.id,updated_at:new Date().toISOString()});
  if(error) return jsonError('Kunde inte spara pushtoken.',500);
  return Response.json({saved:true},{headers:{'Cache-Control':'no-store'}});
}
