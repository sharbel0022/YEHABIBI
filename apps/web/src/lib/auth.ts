import 'server-only';
import { sessionDb } from '@/lib/supabase';

export async function requireAdmin() {
  const client = await sessionDb();
  if (!client) return null;
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user?.email || !user.email_confirmed_at) return null;
  const allowlist = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!allowlist.includes(user.email.toLowerCase())) return null;
  return user;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Non-browser clients rely on rate-limits/authentication.
  try { const a = new URL(origin).origin; const b = new URL(request.url).origin; const configured = new URL(process.env.NEXT_PUBLIC_SITE_URL || b).origin; return a === b || a === configured || mobileWebOrigins().includes(a); }
  catch { return false; }
}
function mobileWebOrigins() {
  return (process.env.MOBILE_WEB_ORIGINS || '').split(',').flatMap(value => { try { return [new URL(value.trim()).origin]; } catch { return []; } });
}
/** Endast den offentliga Expo-API:n använder CORS, med uttryckligen tillåtna ursprung. */
export function publicResponse(request:Request,response:Response) {
  const origin = request.headers.get('origin');
  if(origin && checkOrigin(request)) {
    response.headers.set('Access-Control-Allow-Origin',origin);
    response.headers.set('Vary','Origin');
  }
  response.headers.set('Cache-Control','no-store');
  return response;
}
export function publicOptions(request:Request) {
  if(!checkOrigin(request)) return jsonError('Felaktigt anrop.',403);
  return publicResponse(request,new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}}));
}
export function jsonError(message: string, status = 400) {
  return Response.json({ error:message }, { status, headers:{'Cache-Control':'no-store'} });
}
