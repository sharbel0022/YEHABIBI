import { getHospitalityCatalog } from '@/lib/hospitality';
import { inquiryOriginAllowed, validateCateringInquiry } from '@/lib/catering-inquiry';
import { inquiryEmailReady, sendCateringInquiry } from '@/lib/catering-inquiry-mail';

export const dynamic = 'force-dynamic';
const maxBytes = 20*1024;
const windowMs = 10*60*1000;
const attempts = new Map<string,{count:number;resetAt:number}>();
// Best-effort abuse control per running instance, not a durable/global rate limit.
function rateAllowed(key:string,now:number) {
  for (const [old,item] of attempts) if (item.resetAt <= now) attempts.delete(old);
  const item = attempts.get(key) || {count:0,resetAt:now+windowMs};
  if (item.count >= (key === 'global' ? 40 : 6)) return false;
  if (attempts.size >= 1000 && !attempts.has(key)) return false;
  item.count++; attempts.set(key,item); return true;
}
const reply = (status:number,error:string,code:string) => Response.json({ok:false,error,code},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

export async function POST(request:Request) {
  if (!inquiryOriginAllowed(request.headers.get('origin'),request.url,process.env.NEXT_PUBLIC_SITE_URL)) return reply(403,'Formuläret måste skickas från den här webbplatsen.','origin');
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415,'Formuläret måste skickas som JSON.','content_type');
  if (Number(request.headers.get('content-length') || 0) > maxBytes) return reply(413,'Meddelandet är för långt.','too_large');
  if (!rateAllowed('global',Date.now()) || !rateAllowed(`ip:${(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').slice(0,100)}`,Date.now())) return reply(429,'För många försök. Vänta en stund och försök igen.','rate_limited');
  let input:unknown;
  try {
    if (!request.body) return reply(400,'Formuläret saknar uppgifter.','invalid');
    const reader = request.body.getReader(); const chunks:Uint8Array[]=[]; let size=0;
    while (true) {
      const {value,done}=await reader.read(); if (done) break;
      size+=value.byteLength;
      if (size>maxBytes) {await reader.cancel(); return reply(413,'Meddelandet är för långt.','too_large');}
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset=0; for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
    input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } catch { return reply(400,'Kontrollera uppgifterna i formuläret.','invalid'); }
  try {
    const catalog=await getHospitalityCatalog();
    const checked=validateCateringInquiry(input,catalog);
    if (!checked.ok) return reply(400,checked.error,'invalid');
    if (!inquiryEmailReady(catalog)) return reply(503,'Direktmejl är inte aktiverat ännu. Ring oss eller använd e-postlänken tills vidare.','not_configured');
    const sent=await sendCateringInquiry(checked.value,catalog);
    if (!sent.ok) return reply(sent.unavailable ? 503 : 502,'Vi kunde inte bekräfta att mejltjänsten tog emot förfrågan. Behåll formuläret och försök igen med samma referens.','send_unconfirmed');
    return Response.json({ok:true,reference:sent.reference},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch { return reply(503,'Förfrågan kunde inte behandlas. Försök igen senare eller ring oss.','unavailable'); }
}
