import { getCatalog } from '@/lib/data';
import { jsonError, publicOptions, publicResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const OPTIONS = publicOptions;
export async function GET(request:Request) {
  try { return publicResponse(request,Response.json(await getCatalog())); }
  catch { return publicResponse(request,jsonError('Katalogen kunde inte hämtas. Försök igen senare.',503)); }
}
