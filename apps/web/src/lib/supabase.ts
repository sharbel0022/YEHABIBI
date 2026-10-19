import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isSupabaseReady } from '@/lib/config';

export function adminDb(signal?:AbortSignal) {
  if (!isSupabaseReady()) throw new Error('Databasen är inte konfigurerad');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken:false, persistSession:false },
    global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.any([AbortSignal.timeout(10000),...(init?.signal?[init.signal]:[]),...(signal?[signal]:[])])})}
  });
}

export async function sessionDb() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return jar.getAll(); },
      setAll(items) { try { for (const item of items) jar.set(item.name, item.value, item.options); } catch { /* server-component read: route handlers perform cookie refresh */ } }
    }
  });
}
