import { randomBytes } from 'node:crypto';
import { requireAdmin, checkOrigin, jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { menuSchema } from '@/lib/validators';

export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(!checkOrigin(request))return jsonError('Felaktigt anrop.',403);
  if(!await requireAdmin())return jsonError('Obehörig.',401);
  const parsed=menuSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return jsonError('Kontrollera menyuppgifterna.');
  const base=parsed.data.title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'catering';
  const slug=`${base}-${randomBytes(3).toString('hex')}`;
  const {data,error}=await adminDb().from('menus').insert({...parsed.data,slug}).select('*').single();
  if(error||!data)return jsonError('Kunde inte skapa meny.',500);
  return Response.json({menu:data},{status:201});
}
