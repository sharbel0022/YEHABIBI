import { NextResponse } from 'next/server';
import { sessionDb } from '@/lib/supabase';
export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/admin?login=failed', request.url));
  const db = await sessionDb();
  if (!db) return NextResponse.redirect(new URL('/admin?login=unavailable', request.url));
  const {error} = await db.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? '/admin?login=failed' : '/admin', request.url));
}
