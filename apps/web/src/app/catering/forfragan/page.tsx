import type { Metadata } from "next";
import Link from "next/link";
import { getHospitalityCatalog } from "@/lib/hospitality";
import { CateringInquiry } from "@/components/hospitality/CateringInquiry";
import { inquiryEmailReady } from "@/lib/catering-inquiry-mail";
import { phoneHref } from "@yehabibi/shared";
import { parseInquirySelection, type InquirySearch } from "@/components/catering/presentation";
export const metadata: Metadata = {
  title: "Cateringförfrågan",
  description:
    "Skicka en cateringförfrågan till Yei Habibi. Välj meny och antal, fyll i kontaktuppgifter och önskemål. Betalning sker på plats efter personlig bekräftelse.",
  alternates: { canonical: "/catering/forfragan" },
  robots: { index: false, follow: true },
};
export default async function InquiryPage({
  searchParams,
}: {
  searchParams: Promise<InquirySearch>;
}) {
  const [catalog, params] = await Promise.all([
    getHospitalityCatalog(),
    searchParams,
  ]);
  const selection = parseInquirySelection(catalog, params);
  return (
    <div className="shell hospitality-page inquiry-page catering-experience">
      <nav className="breadcrumbs" aria-label="Brödsmulor">
        <Link href="/catering">Catering</Link>
        <span aria-hidden="true">/</span>
        <span>Förfrågan</span>
      </nav>
      <header className="page-intro">
        <span className="eyebrow">DIN CATERINGFÖRFRÅGAN</span>
        <h1>Kassan</h1>
        <p>
          Granska dina val och fyll i uppgifterna. Vi bekräftar innehåll,
          pris och upplägg personligen. Du betalar på plats.
        </p>
      </header>
      <CateringInquiry catalog={catalog} emailReady={inquiryEmailReady(catalog)} initialMenuIds={selection.menuIds} initialDishIds={selection.dishIds} initialQuantities={selection.quantities} restoreDraft={!Object.hasOwn(params, "meny") && !Object.hasOwn(params, "ratt") && !Object.hasOwn(params, "antal")} />
      <div className="inquiry-contact">
        <h2>Vill du prata med oss?</h2>
        <a className="text-link" href={phoneHref(catalog.contact.phone) || undefined}>Ring oss på {catalog.contact.phone}</a>
      </div>
    </div>
  );
}
