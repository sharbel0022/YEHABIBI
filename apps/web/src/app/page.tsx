import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getHospitalityCatalog } from "@/lib/hospitality";
import {
  CateringCard,
  ContactBand,
  DraftNotice,
} from "@/components/hospitality/Content";

export const metadata: Metadata = {
  title: "Yei Habibi – Libanesisk catering & fest i Västerås",
  alternates: { canonical: "/" },
  description:
    "Yei Habibi – libanesisk catering i Västerås och festlokaler för era stora stunder. Tre meze-menyer och en egen plockmeny. Personlig kontakt via mejl och telefon.",
};
export default async function HomePage() {
  const catalog = await getHospitalityCatalog();
  const food = catalog.menus[0];
  const venuePhoto = catalog.venues[0]?.images[0];
  return (
    <div className="shell hospitality-home">
      <section className="home-intro">
        <span className="eyebrow">LIBANESISKA SMAKER · FESTER ATT MINNAS</span>
        <h1>Catering &amp; fest.</h1>
        <p>Välj det du vill planera. Vi hjälper dig vidare personligen.</p>
      </section>
      <section className="home-choices" aria-label="Vad vill du planera?">
        <Link href="/catering" className="home-choice">
          <div className="choice-photo">
            <img
              src={food?.image || "/images/catering-fest/catering.webp"}
              alt={
                food?.imageAlt ||
                "Upplagda matportioner från företagets bildmaterial"
              }
              width={1080}
              height={719}
              fetchPriority="high"
            />
            {(!food?.approved || catalog.preview) && (
              <span className="image-label">Bildexempel</span>
            )}
          </div>
          <div className="choice-copy">
            <span className="choice-kicker">CATERING</span>
            <h2>Catering för alla tillfällen</h2>
            <p>
              Tre färdiga menyer och en egen plockmeny.
              <br />
              Vi planerar maten tillsammans med dig.
            </p>
            <span className="btn btn-primary">
              Visa catering <ArrowRight size={17} aria-hidden="true" />
            </span>
          </div>
        </Link>
        <Link href="/festlokal" className="home-choice">
          <div className="choice-photo">
            <img
              src={venuePhoto?.src || "/images/catering-fest/dukning.webp"}
              alt={
                venuePhoto?.alt || "Festdukning från företagets bildmaterial"
              }
              width={1080}
              height={719}
              fetchPriority="high"
            />
            {!venuePhoto && <span className="image-label">Bildexempel</span>}
          </div>
          <div className="choice-copy">
            <span className="choice-kicker">FEST</span>
            <h2>Oförglömliga event i våra festlokaler</h2>
            <p>
              För stora stunder och nära möten.
              <br />
              All festbokning sker via telefon.
            </p>
            <span className="btn btn-primary">
              Visa festlokaler <ArrowRight size={17} aria-hidden="true" />
            </span>
          </div>
        </Link>
      </section>
      <DraftNotice preview={catalog.preview} />
      <section className="hospitality-section">
        <div className="hospitality-section-heading">
          <span className="eyebrow">MAT ATT DELA</span>
          <h2>Våra cateringmenyer</h2>
          <p>
            Libanesiska favoriter för bröllop, födelsedagar, studentfirande och
            företagets fest.
          </p>
        </div>
        <div className="catering-grid">
          {catalog.menus.map((menu) => (
            <CateringCard key={menu.id} menu={menu} />
          ))}
        </div>
      </section>
      <ContactBand contact={catalog.contact} venue />
      <section className="home-about">
        <div>
          <span className="eyebrow">VÄLKOMMEN TILL YEI HABIBI</span>
          <h2>
            Mat att dela.
            <br />
            Tillfällen att minnas.
          </h2>
        </div>
        <div>
          <p>
            Här möts libanesisk catering och fest. Välj maten som passar ditt
            sällskap och prata med oss om det som gör just ert tillfälle
            speciellt.
          </p>
          <Link href="/om-oss" className="text-link">
            Lär känna oss <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
