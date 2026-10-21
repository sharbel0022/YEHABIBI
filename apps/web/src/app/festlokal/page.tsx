import type { Metadata } from "next";
import { getHospitalityCatalog } from "@/lib/hospitality";
import { VenueOverview } from "@/components/venues/VenuePresentation";
import { listVenuePresentations } from "@/components/venues/venue-showcases";
export const metadata: Metadata = {
  title: "Festlokaler i Västerås",
  description: "Utforska festlokaler för bröllop, födelsedag och företagsevent. Se bilder och kontakta Yei Habibi för ert upplägg. All bokning sker via telefon.",
  alternates: { canonical: "/festlokal" },
};
export default async function VenuesPage() {
  const catalog = await getHospitalityCatalog();
  return <VenueOverview venues={listVenuePresentations(catalog)} phone={catalog.contact.phone} />;
}
