import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { checkOrigin, jsonError, requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';

const fileSchema=z.object({filename:z.string().min(1).max(160),size:z.number().int().positive(),contentType:z.enum(['image/png','image/jpeg','image/webp','video/mp4','video/webm'])});
const allowedExtensions:Record<string,string>={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','video/mp4':'.mp4','video/webm':'.webm'};
export async function POST(request:Request){
  if(!checkOrigin(request))return jsonError('Felaktigt anrop.',403);
  if(!await requireAdmin())return jsonError('Obehörig.',401);
  const parsed=fileSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return jsonError('Ogiltig filinformation.');
  const {contentType,size}=parsed.data;
  const limit=contentType.startsWith('image/')?5*1024*1024:45*1024*1024;
  if(size>limit)return jsonError('Filen är för stor. Bilder max 5 MB och video max 45 MB.');
  const filename=`public/${randomUUID()}${allowedExtensions[contentType]}`;
  const bucket=adminDb().storage.from('catering-media');
  const {data,error}=await bucket.createSignedUploadUrl(filename);
  if(error||!data)return jsonError('Kunde inte förbereda uppladdningen.',500);
  const {data:publicLink}=bucket.getPublicUrl(filename);
  return Response.json({path:filename,token:data.token,url:publicLink.publicUrl});
}
