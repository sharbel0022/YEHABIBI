import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getHospitalityCatalog } from "@/lib/hospitality";
import { Gallery } from "@/components/hospitality/Gallery";
import { ContactActions } from "@/components/hospitality/ContactActions";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, catalog] = await Promise.all([
    params,
    getHospitalityCatalog(),
  ]);
  const venue = catalog.venues.find((item) => item.slug === slug);
  if (!venue) notFound();
  return venue
    ? {
        title: `${venue.name} – festlokal`,
        description: venue.description,
        alternates: { canonical: `/festlokal/${venue.slug}` },
      }
    : {};
}
export default async function VenuePage({ params }: Props) {
  const [{ slug }, catalog] = await Promise.all([
    params,
    getHospitalityCatalog(),
  ]);
  const venue = catalog.venues.find((item) => item.slug === slug);
  if (!venue) notFound();
  return (
    <div className="shell hospitality-page">
      <nav className="breadcrumbs" aria-label="Brödsmulor">
        <Link href="/festlokal">Festlokaler</Link>
        <span aria-hidden="true">/</span>
        <span>{venue.name}</span>
      </nav>
      <section className="venue-detail">
        <Gallery images={venue.images} name={venue.name} />
        <div>
          <span className="eyebrow">EN PLATS FÖR ERT TILLFÄLLE</span>
          <h1>{venue.name}</h1>
          <p className="intro">{venue.description}</p>
          <dl className="venue-facts">
            {venue.capacity && (
              <>
                <dt>Maxkapacitet</dt>
                <dd>{venue.capacity} personer</dd>
              </>
            )}
            {venue.address && (
              <>
                <dt>Adress</dt>
                <dd>{venue.address}</dd>
              </>
            )}
          </dl>
          {venue.facilities.length > 0 && (
            <>
              <h2>Det finns i lokalen</h2>
              <ul>
                {venue.facilities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
          <ContactActions
            contact={{ ...catalog.contact, phone: venue.phone }}
            venue
          />
        </div>
      </section>
      <Link className="text-link" href="/festlokal">
        ← Till alla festlokaler
      </Link>
    </div>
  );
}
