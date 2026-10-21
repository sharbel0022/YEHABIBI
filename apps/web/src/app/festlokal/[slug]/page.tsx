import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getHospitalityCatalog } from "@/lib/hospitality";
import { VenueDetail } from "@/components/venues/VenuePresentation";
import { findVenuePresentation } from "@/components/venues/venue-showcases";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, catalog] = await Promise.all([params, getHospitalityCatalog()]);
  const venue = findVenuePresentation(catalog, slug);
  if (!venue) notFound();
  return { title: `${venue.name} – festlokal`, description: venue.description,
    alternates: { canonical: `/festlokal/${venue.slug}` },
    robots: venue.illustration ? { index:false, follow:true } : undefined,
  };
}
export default async function VenuePage({ params }: Props) {
  const [{ slug }, catalog] = await Promise.all([params, getHospitalityCatalog()]);
  const venue = findVenuePresentation(catalog, slug);
  if (!venue) notFound();
  return <VenueDetail venue={venue} phone={venue.phone || catalog.contact.phone} />;
}
