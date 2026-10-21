import Link from "next/link";
import { ArrowLeft, ArrowRight, Phone } from "lucide-react";
import { phoneHref } from "@yehabibi/shared";
import type { VenueShowcase } from "./venue-showcases";
import { VenueMediaGallery } from "./VenueMediaGallery";
import { VenuePhoto } from "./VenuePhoto";
import styles from "./VenuePresentation.module.css";

function PhoneCTA({ phone, label = "Ring oss för bokning" }: { phone: string; label?: string }) {
  const href = phoneHref(phone);
  return href ? (
    <a className={styles.phoneButton} href={href} aria-label={`${label} på ${phone}`}>
      <Phone size={17} aria-hidden="true" />
      <span>{label}</span>
    </a>
  ) : null;
}

function InspirationNote() {
  return <p className={styles.inspiration}>Inspirationsbilder. Ring oss för information om de aktuella lokalerna.</p>;
}

export function VenueOverview({ venues, phone }: { venues: VenueShowcase[]; phone: string }) {
  return (
    <div className={`venue-experience ${styles.experience} ${styles.overview}`}>
      <div className={styles.overviewInner}>
        <header className={styles.intro}>
          <span className={styles.eyebrow}>FEST HOS YE HABIBI</span>
          <h1>Våra festlokaler</h1>
          <p>Hitta en plats för ditt tillfälle. Ring oss så pratar vi om datum och upplägg.</p>
          <p>All bokning sker via telefon.</p>
        </header>
        <div className={styles.venueGrid}>
          {venues.map((venue) => (
            <article className={styles.venueCard} key={venue.id} data-venue-card={venue.id}>
              <Link className={styles.cardLink} href={`/festlokal/${venue.slug}`} aria-labelledby={`venue-card-${venue.id}`} aria-describedby={`venue-card-description-${venue.id}`}>
                <VenuePhoto image={venue.cardImage || venue.hero} className={styles.cardImage} decorative />
                <div className={styles.cardCopy}>
                  <span className={styles.cardRule} aria-hidden="true" />
                  <h2 id={`venue-card-${venue.id}`}>{venue.name}</h2>
                  <p id={`venue-card-description-${venue.id}`}>{venue.cardDescription}</p>
                  <span className={styles.cardAction}>Visa lokalen<span className={styles.arrowCircle}><ArrowRight size={18} aria-hidden="true" /></span></span>
                </div>
              </Link>
            </article>
          ))}
        </div>
        {venues.length === 0 && <p className={styles.emptyVenues}>Kontakta oss för information om våra aktuella festlokaler. Ring oss så hjälper vi dig med datum och upplägg.</p>}
        {venues.some((venue) => venue.illustration) && <InspirationNote />}
        <section className={styles.contactBand} aria-labelledby="venue-overview-contact">
          <div>
            <h2 id="venue-overview-contact">Planerar du en fest?</h2>
            <p>Alla bokningar av festlokaler sker per telefon.</p>
          </div>
          <PhoneCTA phone={phone} />
        </section>
      </div>
    </div>
  );
}

export function VenueDetail({ venue, phone }: { venue: VenueShowcase; phone: string }) {
  const venuePhone = !venue.illustration && venue.phone ? venue.phone : phone;
  const showCapacity = !venue.illustration && typeof venue.capacity === "number" && venue.capacity > 0;
  const hasFacts = !venue.illustration && Boolean(showCapacity || venue.address || venue.facilities?.length);
  const mediaHeading = venue.videoSrc
    ? venue.videoLabel?.trim().toLocaleLowerCase("sv-SE") === "bildspel" ? "Bilder och bildspel" : "Bilder och video"
    : "Bilder";
  return (
    <div className={`venue-experience ${styles.experience} ${styles.detail}`}>
      <section className={styles.hero} aria-labelledby={`venue-title-${venue.id}`}>
        <VenuePhoto image={venue.hero} className={styles.heroImage} />
        <div className={styles.heroInner}>
          <Link className={styles.backLink} href="/festlokal"><ArrowLeft size={15} aria-hidden="true" />Alla festlokaler</Link>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>EN PLATS FÖR DITT TILLFÄLLE</span>
            <h1 id={`venue-title-${venue.id}`}>{venue.name}</h1>
            {venue.tagline && <p className={styles.tagline}>{venue.tagline}</p>}
            <p className={styles.description}>{venue.description}</p>
            <PhoneCTA phone={venuePhone} />
            <p className={styles.bookingNote}>All bokning sker via telefon.</p>
          </div>
        </div>
      </section>
      <div className={styles.detailInner}>
        {venue.illustration && <InspirationNote />}
        {hasFacts && (
          <section className={styles.factsSection} aria-labelledby={`venue-facts-${venue.id}`}>
            <h2 id={`venue-facts-${venue.id}`}>Om lokalen</h2>
            <div className={styles.factsGrid}>
              {(showCapacity || venue.address) && (
                <dl className={styles.facts}>
                  {showCapacity && <><dt>Maxkapacitet</dt><dd>{venue.capacity} personer</dd></>}
                  {venue.address && <><dt>Adress</dt><dd>{venue.address}</dd></>}
                </dl>
              )}
              {Boolean(venue.facilities?.length) && (
                <div className={styles.facilities}>
                  <h3>Det finns i lokalen</h3>
                  <ul>{[...new Set(venue.facilities)].map((facility) => <li key={facility}>{facility}</li>)}</ul>
                </div>
              )}
            </div>
          </section>
        )}
        <section className={styles.mediaSection} aria-labelledby={`venue-media-${venue.id}`}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>UPPTÄCK MER</span>
            <h2 id={`venue-media-${venue.id}`}>{mediaHeading}</h2>
          </div>
          <VenueMediaGallery name={venue.name} images={venue.images} videoSrc={venue.videoSrc} videoLabel={venue.videoLabel} />
        </section>
        <section className={styles.contactBand} aria-labelledby={`venue-contact-${venue.id}`}>
          <div>
            <h2 id={`venue-contact-${venue.id}`}>Berätta om din fest.</h2>
            <p>Ring oss om datum och upplägg. All bokning sker per telefon.</p>
          </div>
          <PhoneCTA phone={venuePhone} label="Ring oss" />
        </section>
      </div>
    </div>
  );
}
