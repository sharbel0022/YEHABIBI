import type { Metadata } from "next";
import Link from "next/link";
import { getHospitalityCatalog } from "@/lib/hospitality";
import { CateringInquiry } from "@/components/hospitality/CateringInquiry";
import { ContactActions } from "@/components/hospitality/ContactActions";
import { parseInquirySelection, type InquirySearch } from "@/components/catering/presentation";
export const metadata: Metadata = {
  title: "Cateringförfrågan",
  description:
    "Förbered en personlig cateringförfrågan till Yei Habibi. Ange meny, datum, antal personer och önskemål. Skicka sedan själv mejlet från ditt e-postprogram.",
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
        <span className="eyebrow">FRÅN MENY TILL PERSONLIG KONTAKT</span>
        <h1>Berätta om ditt tillfälle.</h1>
        <p>
          Fyll i dina önskemål för ett mejlutkast. Du skickar själv mejlet och
          vi bekräftar sedan innehåll, pris och upplägg personligen.
        </p>
      </header>
      <CateringInquiry catalog={catalog} initialMenuIds={selection.menuIds} initialDishIds={selection.dishIds} />
      <div className="inquiry-contact">
        <h2>Vill du prata med oss?</h2>
        <ContactActions contact={catalog.contact} />
      </div>
    </div>
  );
}
