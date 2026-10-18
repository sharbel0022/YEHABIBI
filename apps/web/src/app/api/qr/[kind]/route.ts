import QRCode from 'qrcode';
import { getSettings } from '@/lib/data';
import { siteUrl } from '@/lib/config';
import { safeExternalUrl } from '@/lib/domain';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{kind:string}>}){
  const {kind}=await params;
  const settings=await getSettings();
  const url=kind==='bestall'?`${siteUrl()}/menyer`:kind==='google'?safeExternalUrl(settings.google_review_url):null;
  if(!url)return new Response('Länk saknas',{status:404});
  const svg=await QRCode.toString(url,{type:'svg',margin:3,width:430,color:{dark:'#163b2b',light:'#ffffff'}});
  return new Response(svg,{headers:{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
