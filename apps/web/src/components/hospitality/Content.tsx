import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CateringMenu, HospitalityContact } from "@yehabibi/shared";
import { ContactActions } from "./ContactActions";

export function DraftNotice({ preview }: { preview: boolean }) {
  return preview ? (
    <p className="content-draft">
      <span>Innehållsutkast</span> Menypriser, allergener, bilder och lokalfakta
      behöver företagets slutliga godkännande före publicering.
    </p>
  ) : null;
}
export function CateringCard({ menu }: { menu: CateringMenu }) {
  return (
    <article className="catering-card">
      <Link
        href={`/catering/${menu.slug}`}
        className="catering-card-photo"
        tabIndex={-1}
        aria-hidden="true"
      >
        <img
          src={menu.image || "/images/catering-fest/meze.webp"}
          alt=""
          width={600}
          height={400}
          loading="lazy"
        />
        {!menu.approved && <span className="image-label">Bildexempel</span>}
      </Link>
      <div className="catering-card-copy">
        <h3>{menu.name}</h3>
        <p className="menu-price">
          {menu.pricePerPerson === null ? (
            "Pris enligt offert"
          ) : (
            <>
              {menu.pricePerPerson} <span>kr/person</span>
            </>
          )}
        </p>
        <p>{menu.description}</p>
        <Link className="btn btn-outline-light" href={`/catering/${menu.slug}`}>
          Visa innehåll <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
export function ContactBand({
  contact,
  venue = false,
}: {
  contact: HospitalityContact;
  venue?: boolean;
}) {
  return (
    <section
      className="contact-band"
      aria-label={venue ? "Kontakt för festlokaler" : "Kontakt för catering"}
    >
      <div>
        <h2>{venue ? "Planerar du en fest?" : "Ska vi planera något gott?"}</h2>
        <p>
          {venue
            ? "Ring oss om datum, gäster och upplägg."
            : "Berätta om ditt tillfälle. Vi hjälper dig vidare personligen."}
        </p>
      </div>
      <ContactActions contact={contact} venue={venue} />
    </section>
  );
}
