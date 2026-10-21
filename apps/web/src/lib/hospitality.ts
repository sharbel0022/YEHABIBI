import "server-only";
import { cache } from "react";
import {
  defaultHospitalityCatalog,
  hospitalityCatalogSchema,
  publicHospitalityCatalog,
  type HospitalityCatalog,
} from "@yehabibi/shared";
import { isSupabaseReady } from "@/lib/config";
import { adminDb } from "@/lib/supabase";

export type HospitalityContentRecord = {
  catalog: HospitalityCatalog;
  revision: number;
  persistent: boolean;
};

/** Private editor reader. Never pass its raw catalog to a public page. */
export async function getAdminHospitalityCatalog(): Promise<HospitalityContentRecord> {
  if (!isSupabaseReady())
    return {
      catalog: structuredClone(defaultHospitalityCatalog),
      revision: 0,
      persistent: false,
    };
  const { data, error } = await adminDb()
    .from("hospitality_content")
    .select("catalog,revision")
    .eq("id", 1)
    .single();
  if (error || !data)
    throw new Error(
      "Innehållskatalogen saknas. Kör Catering & Fest-migrationen.",
    );
  const parsed = hospitalityCatalogSchema.safeParse(data.catalog);
  if (!parsed.success)
    throw new Error(
      "Innehållskatalogen behöver kontrolleras i administrationen.",
    );
  return { catalog: parsed.data, revision: data.revision, persistent: true };
}

export const getHospitalityCatalog = cache(
  async (): Promise<HospitalityCatalog> => {
    const { catalog } = await getAdminHospitalityCatalog();
    return publicHospitalityCatalog(catalog);
  },
);
