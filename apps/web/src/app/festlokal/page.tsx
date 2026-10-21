import type { Metadata } from "next";
import Link from "next/link";
import { Phone, ArrowRight, Users } from "lucide-react";
import { phoneHref } from "@yehabibi/shared";
import { getHospitalityCatalog } from "@/lib/hospitality";
import { ContactBand } from "@/components/hospitality/Content";
export const metadata: Metadata = {
  title: "Festlokal i Västerås",
  description:
    "Planerar ni bröllop, födelsedag eller företagsfest i Västerås? Kontakta Yei Habibi per telefon om festlokaler, catering och ert upplägg.",
  alternates: { canonical: "/festlokal" },
};
export default async function VenuesPage() {
  const catalog = await getHospitalityCatalog();
  return (
    <div className="shell hospitality-page">
      <header className="page-intro">
        <span className="eyebrow">PLATS FÖR ERA STORA STUNDER</span>
        <h1>Hitta platsen för din fest.</h1>
        <p>
          Bröllop, födelsedag eller företagsfest. Prata med oss om det ni vill
          fira.
          <br />
          All bokning av festlokaler sker per telefon.
        </p>
      </header>
      {catalog.venues.length ? (
        <div className="venue-grid">
          {catalog.venues.map((venue) => (
            <article key={venue.id} className="venue-card">
              <Link
                className="venue-card-photo"
                href={`/festlokal/${venue.slug}`}
                tabIndex={-1}
                aria-hidden="true"
              >
                <img
                  src={venue.images[0]?.src}
                  alt=""
                  width={900}
                  height={550}
                  loading="lazy"
                />
              </Link>
              <div className="venue-card-copy">
                <h2>{venue.name}</h2>
                <p>{venue.description}</p>
                {venue.capacity && (
                  <p className="venue-capacity">
                    <Users size={17} aria-hidden="true" />
                    Upp till {venue.capacity} personer
                  </p>
                )}
                <ul>
                  {venue.facilities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {venue.address && <p className="field-hint">{venue.address}</p>}
                <div className="contact-actions">
                  <Link
                    className="btn btn-outline-light"
                    href={`/festlokal/${venue.slug}`}
                  >
                    Visa lokalen <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  {phoneHref(venue.phone) && (
                    <a
                      className="btn btn-primary"
                      href={phoneHref(venue.phone)!}
                    >
                      <Phone size={16} aria-hidden="true" />
                      Ring oss
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="venues-pending">
          <figure>
            <img
              src="/images/catering-fest/dukning.webp"
              alt="Dukat festbord från företagets bildmaterial, ännu inte kopplat till en verifierad lokal"
              width={1080}
              height={719}
            />
            <figcaption className="image-label">
              Bildexempel – lokaluppgifter inväntar godkännande
            </figcaption>
          </figure>
          <div>
            <h2>Vi hjälper er att hitta rätt.</h2>
            <p>
              Presentationerna av våra festlokaler förbereds. Bilder, namn och
              kapacitet publiceras när uppgifterna är bekräftade.
            </p>
            <p>
              Ring oss så pratar vi om er fest, era gäster och vilket upplägg
              som passar.
            </p>
            <a
              className="btn btn-primary"
              href={phoneHref(catalog.contact.phone) || undefined}
            >
              <Phone size={17} aria-hidden="true" />
              Ring oss för bokning
            </a>
            <p className="field-hint">{catalog.contact.phone}</p>
          </div>
        </section>
      )}
      <ContactBand contact={catalog.contact} venue />
    </div>
  );
}
