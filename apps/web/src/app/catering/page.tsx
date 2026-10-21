import type { Metadata } from "next";
import { getHospitalityCatalog } from "@/lib/hospitality";
import { CateringMenuGallery } from "@/components/catering/CateringMenuGallery";
import { parseInquirySelection, type InquirySearch } from "@/components/catering/presentation";
export const metadata: Metadata = {
  title: "Libanesisk catering i Västerås",
  description:
    "Jämför tre libanesiska cateringmenyer med meze och mixgrill, eller skapa en egen plockmeny. Catering för bröllop, företag, födelsedag och student i Västerås.",
  alternates: { canonical: "/catering" },
};
export default async function CateringPage({ searchParams }: { searchParams: Promise<InquirySearch> }) {
  const [catalog, search] = await Promise.all([getHospitalityCatalog(), searchParams]);
  const selection = parseInquirySelection(catalog, search);
  return (
    <div className="catering-experience catering-overview">
      <header className="page-intro">
        <span className="eyebrow">CATERING &amp; MEZE</span>
        <h1>Våra cateringmenyer</h1>
        <p>Välj en meny eller plocka dina favoriter. Vi planerar maten tillsammans med dig.</p>
      </header>
      <CateringMenuGallery catalog={catalog} initialMenuIds={selection.menuIds} initialDishIds={selection.dishIds} initialQuantities={selection.quantities} restoreDraft={!Object.hasOwn(search, "meny") && !Object.hasOwn(search, "ratt") && !Object.hasOwn(search, "antal")} />
    </div>
  );
}
