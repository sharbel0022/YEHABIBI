import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { getHospitalityCatalog } from "@/lib/hospitality";
import { ContactActions } from "@/components/hospitality/ContactActions";
export const metadata: Metadata = {
  title: "Kontakta oss – catering & fest",
  description:
    "Kontakta Yei Habibi om libanesisk catering i Västerås via mejl eller telefon. För festlokaler och bokning ringer du oss på 021-41 57 11.",
  alternates: { canonical: "/kontakt" },
};
export default async function ContactPage() {
  const { contact } = await getHospitalityCatalog();
  return (
    <div className="shell hospitality-page">
      <header className="page-intro">
        <span className="eyebrow">PERSONLIG KONTAKT</span>
        <h1>Vi hjälper dig att planera.</h1>
        <p>Välj rätt kontaktväg för det du behöver.</p>
      </header>
      <div className="contact-card-grid">
        <section className="contact-card">
          <h2>Catering</h2>
          <p>
            Tre färdiga menyer eller en egen plockmeny.
            <br />
            Berätta om ditt tillfälle via mejl eller telefon.
          </p>
          <ContactActions contact={contact} />
        </section>
        <section className="contact-card">
          <h2>Fest</h2>
          <p>
            Frågor om lokaler, datum och upplägg.
            <br />
            All bokning av festlokaler sker per telefon.
          </p>
          <ContactActions contact={contact} venue />
        </section>
      </div>
      <section className="contact-address">
        <MapPin size={25} aria-hidden="true" />
        <div>
          <h2>Besöksadress</h2>
          <p>{contact.address}</p>
          {contact.mapsUrl && (
            <a
              className="text-link"
              href={contact.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Visa på Google Maps ↗
            </a>
          )}
          <p className="field-hint">
            Företagets kontaktadress. Adress för respektive festlokal bekräftas
            separat.
          </p>
        </div>
      </section>
    </div>
  );
}
