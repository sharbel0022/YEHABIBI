import { checkOrigin, jsonError, publicOptions, publicResponse } from '@/lib/auth';
import { ordersReady } from '@/lib/data';
import { availabilitySchema } from '@/lib/validators';
import { getAvailability } from '@/lib/scheduling';

export const dynamic='force-dynamic';
export const OPTIONS=publicOptions;
export async function POST(request:Request) {
  try {
    if(!checkOrigin(request)) return publicResponse(request,jsonError('Felaktigt anrop.',403));
    if(!ordersReady()) return publicResponse(request,jsonError('Beställningar är inte aktiverade ännu.',503));
    const parsed=availabilitySchema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success) return publicResponse(request,jsonError('Välj paket, antal och leveranssätt.'));
    return publicResponse(request,Response.json(await getAvailability(parsed.data)));
  } catch { return publicResponse(request,jsonError('Kunde inte läsa lediga tider. Försök igen senare.',503)); }
}
