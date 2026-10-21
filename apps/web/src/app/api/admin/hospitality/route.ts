import { z } from 'zod';
import { hospitalityCatalogSchema } from '@yehabibi/shared';
import { requireAdmin, checkOrigin, jsonError } from '@/lib/auth';
import { getAdminHospitalityCatalog } from '@/lib/hospitality';
import { adminDb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
const inputSchema = z.object({ catalog: hospitalityCatalogSchema, revision: z.number().int().min(0), emailVerificationConfirmed: z.boolean().optional() });
export async function GET() {
  if (!await requireAdmin()) return jsonError('Obehörig.', 401);
  try { return Response.json(await getAdminHospitalityCatalog(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return jsonError('Innehållet kunde inte läsas. Kontrollera migrationen.', 503); }
}
export async function PATCH(request: Request) {
  if (!checkOrigin(request)) return jsonError('Felaktigt anrop.', 403);
  if (!await requireAdmin()) return jsonError('Obehörig.', 401);
  if (Number(request.headers.get('content-length')) > 250000) return jsonError('Innehållet är för stort.', 413);
  const raw = await request.text();
  if (raw.length > 250000) return jsonError('Innehållet är för stort.', 413);
  const parsed = inputSchema.safeParse(await Promise.resolve().then(() => JSON.parse(raw)).catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || 'Kontrollera innehållet.');
  try {
    const { catalog, revision } = parsed.data;
    const previous = await getAdminHospitalityCatalog();
    if (previous.revision !== revision) return jsonError('Innehållet har ändrats av en annan redaktör. Ladda om sidan innan du sparar.', 409);
    if (previous.catalog.contact.email !== catalog.contact.email && catalog.contact.emailVerified && !parsed.data.emailVerificationConfirmed) {
      return jsonError('Den ändrade mottagaradressen behöver en ny uttrycklig bekräftelse.');
    }
    const { data, error } = await adminDb().from('hospitality_content')
      .update({ catalog, revision: revision + 1, updated_at: new Date().toISOString() })
      .eq('id', 1).eq('revision', revision).select('catalog,revision').maybeSingle();
    if (error) return jsonError('Innehållet kunde inte sparas.', 503);
    if (!data) return jsonError('Innehållet har ändrats av en annan redaktör. Ladda om sidan innan du sparar.', 409);
    return Response.json({ catalog: data.catalog, revision: data.revision, persistent: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return jsonError('Innehållet kunde inte sparas.', 503); }
}
