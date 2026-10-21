import { getHospitalityCatalog } from '@/lib/hospitality';
import { jsonError, publicOptions, publicResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const OPTIONS = publicOptions;
export async function GET(request: Request) {
  try { return publicResponse(request, Response.json(await getHospitalityCatalog())); }
  catch { return publicResponse(request, jsonError('Innehållet kunde inte hämtas. Försök igen senare.', 503)); }
}
