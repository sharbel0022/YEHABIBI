"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { phoneHref, type HospitalityContact } from "@yehabibi/shared";
import { Brand } from "@/components/Brand";
import { Facebook, Instagram } from "lucide-react";

const homeLinks = [
  ["/", "Hem"],
  ["/catering", "Catering"],
  ["/festlokal", "Festlokaler"],
  ["/om-oss", "Om oss"],
  ["/kontakt", "Kontakt"],
];

export function Footer({ contact }: { contact: HospitalityContact }) {
  const path = usePathname();
  const isVenue = path.startsWith("/festlokal");
  const call = phoneHref(contact.phone);
  if (path === "/" || path === "/catering" || path.startsWith("/catering/") || isVenue || path === "/om-oss" || path === "/kontakt") {
    return (
      <footer className="home-footer">
        <div className="home-footer-inner">
          <Brand signature />
          <nav aria-label="Sidfotsmeny">
            {homeLinks.map(([href, label]) => (
              <Link key={href} href={href}>{label}</Link>
            ))}
          </nav>
          <div className="home-footer-meta">
            {contact.socialLinks.length > 0 && (
              <div className="home-footer-socials">
                {contact.socialLinks.map((link) => {
                  const host = new URL(link.url).hostname;
                  const Icon = /(^|\.)instagram\.com$/.test(host)
                    ? Instagram
                    : /(^|\.)facebook\.com$/.test(host)
                      ? Facebook
                      : null;
                  return (
                    <a key={link.url} href={link.url} aria-label={link.label} target="_blank" rel="noopener noreferrer">
                      {Icon ? <Icon size={18} aria-hidden="true" /> : link.label}
                    </a>
                  );
                })}
              </div>
            )}
            <small>© {new Date().getFullYear()} Yehabibi – Catering &amp; Fest</small>
          </div>
        </div>
      </footer>
    );
  }
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
