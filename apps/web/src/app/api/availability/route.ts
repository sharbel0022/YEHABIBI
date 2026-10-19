import { checkOrigin, jsonError, publicOptions, publicResponse } from '@/lib/auth';
import { getSettings, ordersReady } from '@/lib/data';
import { directPaymentCapabilities } from '@/lib/payments';
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
    const [quote,settings]=await Promise.all([getAvailability(parsed.data),getSettings()]);
    const methods=await directPaymentCapabilities(quote.total_ore);
    if(!methods.length && !(parsed.data.fulfillment==='pickup' && settings.pickup_enabled && settings.cash_enabled)) return publicResponse(request,jsonError('Direktbetalning är inte aktiverad för leveranssättet.',503));
    return publicResponse(request,Response.json(quote));
  } catch { return publicResponse(request,jsonError('Kunde inte läsa lediga tider. Försök igen senare.',503)); }
}
