import 'server-only';
import { adminDb } from '@/lib/supabase';
import type { AvailabilityInput, AvailabilityResponse } from '@yehabibi/shared';

/** The database's clock, timezone rules and order rows are the sole scheduling authority. */
export async function getAvailability(input:AvailabilityInput):Promise<AvailabilityResponse> {
  const {data,error}=await adminDb().rpc('get_direct_availability',{p_input:input});
  if(error || !data) throw new Error('Kunde inte läsa lediga tider. Försök igen senare.');
  const quote=data as AvailabilityResponse;
  return {...quote,server_now:new Date(quote.server_now).toISOString(),slots:quote.slots.map(slot=>({...slot,starts_at:new Date(slot.starts_at).toISOString()}))};
}
