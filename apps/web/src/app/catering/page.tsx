import type { Metadata } from "next";
import { getHospitalityCatalog } from "@/lib/hospitality";
import {
  CateringCard,
  ContactBand,
  DraftNotice,
} from "@/components/hospitality/Content";
export const metadata: Metadata = {
  title: "Libanesisk catering i Västerås",
  description:
    "Jämför tre libanesiska cateringmenyer med meze och mixgrill, eller skapa en egen plockmeny. Catering för bröllop, företag, födelsedag och student i Västerås.",
  alternates: { canonical: "/catering" },
};
export default async function CateringPage() {
  const catalog = await getHospitalityCatalog();
  return (
    <div className="shell hospitality-page">
      <header className="page-intro">
        <span className="eyebrow">LIBANESISK CATERING I VÄSTERÅS</span>
        <h1>Catering som passar ditt tillfälle.</h1>
        <p>Välj en av våra tre menyer – eller fråga om en egen plockmeny.</p>
      </header>
      <DraftNotice preview={catalog.preview} />
      <div className="catering-grid">
        {catalog.menus.map((menu) => (
          <CateringCard menu={menu} key={menu.id} />
        ))}
      </div>
      <ContactBand contact={catalog.contact} />
    </div>
  );
}
