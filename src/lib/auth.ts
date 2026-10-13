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
  try { const a = new URL(origin).origin; const b = new URL(request.url).origin; const configured = new URL(process.env.NEXT_PUBLIC_SITE_URL || b).origin; return a === b || a === configured; }
  catch { return false; }
}
export function jsonError(message: string, status = 400) {
  return Response.json({ error:message }, { status, headers:{'Cache-Control':'no-store'} });
}
