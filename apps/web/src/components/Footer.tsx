"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { phoneHref, type HospitalityContact } from "@yehabibi/shared";
import { Brand } from "@/components/Brand";

export function Footer({ contact }: { contact: HospitalityContact }) {
  const isVenue = usePathname().startsWith("/festlokal");
  const call = phoneHref(contact.phone);
  return (
    <footer className="footer">
      <div className="shell footer-layout">
        <div>
          <Brand />
          <p>
            Libanesiska smaker.
            <br />
            Fester att minnas.
          </p>
          <p>Catering och fest i {contact.city}.</p>
        </div>
        <div>
          <strong>Utforska</strong>
          <Link href="/catering">Cateringmenyer</Link>
          <Link href="/festlokal">Festlokaler</Link>
          <Link href="/om-oss">Om oss</Link>
        </div>
        <div>
          <strong>Personlig kontakt</strong>
          <span>Catering: mejl eller telefon</span>
          <span>Fest: endast telefon</span>
          {call && <a href={call}>{contact.phone}</a>}
          {!isVenue && contact.emailVerified && contact.email && (
            <a href={`mailto:${contact.email}`}>{contact.email}</a>
          )}
        </div>
        <div>
          <strong>Hitta hit</strong>
          <span>{contact.address}</span>
          {contact.mapsUrl && (
            <a href={contact.mapsUrl} target="_blank" rel="noopener noreferrer">
              Visa på Google Maps ↗
            </a>
          )}
          {contact.socialLinks.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>© {new Date().getFullYear()} Yei Habibi</span>
        <div>
          <Link href="/integritet">Integritet</Link>
          <Link href="/admin">Ägarinloggning</Link>
        </div>
      </div>
    </footer>
  );
}
