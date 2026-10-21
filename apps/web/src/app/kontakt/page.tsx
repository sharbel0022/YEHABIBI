import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Mail, MapPin, Phone } from "lucide-react";
import { buildCateringEmail, cateringMailto, phoneHref } from "@yehabibi/shared";
import { getHospitalityCatalog } from "@/lib/hospitality";
import styles from "./contact.module.css";
export const metadata: Metadata = {
  title: "Kontakta oss – catering & fest",
  description:
    "Kontakta Yei Habibi om libanesisk catering i Västerås via mejl eller telefon. För festlokaler och bokning ringer du oss på 021-41 57 11.",
  alternates: { canonical: "/kontakt" },
};
export default async function ContactPage() {
  const { contact } = await getHospitalityCatalog();
  const call = phoneHref(contact.phone);
  const email = contact.emailVerified
    ? cateringMailto(contact.email, "Catering", buildCateringEmail({ menuName: "Catering" }))
    : null;
  const cards = [
    {
      icon: Phone,
      title: "Ring oss",
      value: contact.phone || "Telefonnummer kommer snart",
      hint: "Vi svarar gärna på dina frågor.",
      href: call,
      label: `Ring oss på ${contact.phone}`,
    },
    {
      icon: MapPin,
      title: "Besök oss",
      value: contact.address || contact.city,
      hint: "Kontakta oss gärna före ditt besök.",
      href: contact.mapsUrl || null,
      label: `Visa ${contact.address || contact.city} på kartan`,
      external: true,
    },
    {
      icon: Mail,
      title: "Catering via mejl",
      value: email ? contact.email : "E-postadress inväntar bekräftelse",
      hint: "Berätta om ditt tillfälle och dina önskemål.",
      href: email,
      label: `Mejla oss om catering på ${contact.email}`,
    },
    {
      icon: CalendarDays,
      title: "Festbokning",
      value: "Endast via telefon",
      hint: "Ring om datum, lokaler och upplägg.",
      href: call,
      label: `Ring oss för bokning av festlokal på ${contact.phone}`,
    },
  ];
  const mapLocation = contact.address || contact.city;
  const mapEmbed = contact.mapsUrl && mapLocation
    ? `https://maps.google.com/maps?q=${encodeURIComponent(mapLocation)}&z=14&output=embed`
    : null;
  return (
    <div className={`brand-experience contact-experience ${styles.page}`}>
      <div className={styles.backdrop} aria-hidden="true">
        <svg viewBox="0 0 724 468" preserveAspectRatio="xMidYMid slice" focusable="false">
          <defs><clipPath id="contact-photo-crop"><rect width="724" height="468" /></clipPath></defs>
          <image href="/images/home/fest.png" width="724" height="724" clipPath="url(#contact-photo-crop)" />
        </svg>
      </div>
      <div className={styles.olive} aria-hidden="true">
        <svg viewBox="0 0 240 210" focusable="false">
          <path d="M-10 195 Q75 178 181 64 M55 173 Q37 120 25 65 M91 145 Q147 152 216 140" fill="none" stroke="currentColor" strokeWidth="2" />
          <g fill="currentColor">
            <ellipse cx="30" cy="164" rx="9" ry="29" transform="rotate(-57 30 164)" /><ellipse cx="57" cy="149" rx="9" ry="28" transform="rotate(-17 57 149)" />
            <ellipse cx="79" cy="151" rx="9" ry="29" transform="rotate(64 79 151)" /><ellipse cx="95" cy="118" rx="8" ry="27" transform="rotate(-22 95 118)" />
            <ellipse cx="127" cy="118" rx="8" ry="26" transform="rotate(64 127 118)" /><ellipse cx="139" cy="83" rx="8" ry="25" transform="rotate(-19 139 83)" />
            <ellipse cx="171" cy="81" rx="8" ry="24" transform="rotate(58 171 81)" /><ellipse cx="32" cy="117" rx="7" ry="24" transform="rotate(-36 32 117)" />
            <ellipse cx="20" cy="85" rx="7" ry="23" transform="rotate(-25 20 85)" /><ellipse cx="150" cy="147" rx="7" ry="24" transform="rotate(82 150 147)" />
            <ellipse cx="191" cy="139" rx="7" ry="23" transform="rotate(72 191 139)" />
          </g>
        </svg>
      </div>
      <div className={styles.inner}>
        <div className={styles.content}>
          <header className={styles.intro}>
            <span className={styles.eyebrow}>KONTAKT</span>
            <h1>Kontakta oss</h1>
            <p>Har du frågor om catering eller vill boka en festlokal?<br className={styles.desktopBreak} /> Hör av dig till oss – vi hjälper dig gärna.</p>
          </header>
          <div className={styles.cards}>
            {cards.map(({ icon: Icon, title, value, hint, href, label, external }) => {
              const content = <><Icon size={27} strokeWidth={1.4} aria-hidden="true" /><span className={styles.cardCopy}><span className={styles.cardTitle}>{title}</span><strong>{value}</strong><span className={styles.cardHint}>{hint}</span></span></>;
              return href ? (
                <a key={title} className={styles.card} href={href} aria-label={label} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>{content}</a>
              ) : <div key={title} className={`${styles.card} ${styles.unavailable}`}>{content}</div>;
            })}
          </div>
          <Link className={styles.inquiryLink} href="/catering/forfragan">Gör en cateringförfrågan <ArrowUpRight size={17} aria-hidden="true" /></Link>
          <p className={styles.bookingNote}>All bokning av festlokaler sker per telefon.</p>
        </div>
        <section className={styles.location} aria-labelledby="contact-location-title">
          <div className={styles.map}>
            {mapEmbed ? <iframe title={`Karta till ${mapLocation}`} src={mapEmbed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /> : <MapPin size={46} strokeWidth={1.2} aria-hidden="true" />}
          </div>
          <div className={styles.locationCopy}>
            <span className={styles.locationIcon}><MapPin size={21} strokeWidth={1.5} aria-hidden="true" /></span>
            <div><h2 id="contact-location-title">Välkommen till {contact.city || "oss"}</h2><p>{contact.address}</p>{contact.mapsUrl && <a href={contact.mapsUrl} target="_blank" rel="noopener noreferrer">Öppna i Google Maps <ArrowUpRight size={14} aria-hidden="true" /></a>}</div>
          </div>
          <p className={styles.locationNote}>Adress för respektive festlokal bekräftas separat.</p>
        </section>
      </div>
    </div>
  );
}
