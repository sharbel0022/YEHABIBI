import 'server-only';
import { adminDb } from '@/lib/supabase';
import { isSupabaseReady } from '@/lib/config';
import { verifyTrackingToken } from '@/lib/tracking';
import type { CateringOrder } from '@/types/domain';

/** Orderlänken är en privat åtkomstnyckel, även i Expo. */
export async function trackedOrder(code: string, token: string): Promise<CateringOrder | null> {
  if (!isSupabaseReady() || !/^CM-[A-F0-9]{10}$/.test(code) || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { data, error } = await adminDb().from('orders').select('*').eq('code', code).maybeSingle();
  if (error || !data || !verifyTrackingToken(token, data.tracking_hash)) return null;
  return data as CateringOrder;
}
