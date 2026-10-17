import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin, checkOrigin, jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { campaignSchema, dishSchema, zoneSchema } from '@/lib/validators';

export const dynamic = 'force-dynamic';
const requestSchema = z.object({kind:z.enum(['dishes','campaigns','delivery_zones']),id:z.string().uuid().optional(),archive:z.boolean().optional(),value:z.unknown().optional()});
export async function POST(request:Request) {
  if(!checkOrigin(request)) return jsonError('Felaktigt anrop.',403);
  if(!await requireAdmin()) return jsonError('Obehörig.',401);
  const parsed = requestSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return jsonError('Ogiltigt kataloganrop.');
  const {kind,id,archive,value} = parsed.data;
  const db = adminDb();
  if(archive && id) {
    const {data,error} = await db.from(kind).update({active:false,updated_at:new Date().toISOString()}).eq('id',id).select('*').maybeSingle();
    if(error || !data) return jsonError('Kunde inte avpublicera.',500);
    return Response.json({item:data},{headers:{'Cache-Control':'no-store'}});
  }
  const validated = kind==='dishes' ? dishSchema.safeParse(value) : kind==='campaigns' ? campaignSchema.safeParse(value) : zoneSchema.safeParse(value);
  if(!validated.success) return jsonError('Kontrollera uppgifterna, priset och datumen.');
  const payload:Record<string,unknown> = {...validated.data,updated_at:new Date().toISOString()};
  if(kind==='campaigns') {
    const ids = (validated.data as z.infer<typeof campaignSchema>).menu_ids;
    if(ids.length) {
      const {data,error} = await db.from('menus').select('id').in('id',ids);
      if(error || data?.length !== new Set(ids).size) return jsonError('Välj befintliga cateringpaket.');
    }
  }
  if(kind==='dishes' && !id) {
    const title = (validated.data as z.infer<typeof dishSchema>).title;
    payload.slug = `${title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').slice(0,45)}-${randomBytes(3).toString('hex')}`;
  }
  const query = id ? db.from(kind).update(payload).eq('id',id) : db.from(kind).insert(payload);
  const {data,error} = await query.select('*').maybeSingle();
  if(error || !data) return jsonError('Kunde inte spara katalogen.',500);
  return Response.json({item:data},{status:id?200:201,headers:{'Cache-Control':'no-store'}});
}
