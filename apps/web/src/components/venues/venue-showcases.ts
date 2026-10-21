import type { HospitalityCatalog, Venue } from "@yehabibi/shared";
export type VenuePhotoAsset = { src: string; alt: string; crop?: { left: number; top: number; width: number; height: number } };
export type VenueShowcase = {
  id: string; slug: string; name: string; tagline: string; description: string; cardDescription: string;
  hero: VenuePhotoAsset; cardImage?: VenuePhotoAsset; images: VenuePhotoAsset[];
  videoSrc?: string; videoLabel?: string; illustration?: boolean;
  capacity?: number | null; address?: string; facilities?: string[]; phone?: string;
};
const photo = (index: number, left: number, top: number, width: number, height: number, detail: string): VenuePhotoAsset => ({
  src: `/images/venues/festlokal-${index}-reference.png`,
  alt: `Festlokal ${index}: ${detail} – inspirationsbild`, crop: { left, top, width, height },
});
const definitions = [
  { tagline: "För bröllop och stora firanden.", description: "Upptäck en elegant stil med varma ljus, vackra dukningar och blomsterarrangemang. Ring oss så planerar vi ditt tillfälle tillsammans.", cardDescription: "En varm och elegant inramning för din stora dag.", hero: [700,102,744,590], pictures: [[35,735,340,198],[395,735,315,198],[733,735,330,198]] },
  { tagline: "För födelsedag, företagsevent och högtider.", description: "En festlig inramning med gyllene detaljer och omsorgsfull dukning. Prata med oss om din fest, dina gäster och det upplägg du önskar.", cardDescription: "Gyllene detaljer och en stämningsfull dukning.", hero: [720,102,724,572], pictures: [[30,699,314,240],[365,699,336,240],[1099,699,319,240]] },
  { tagline: "Modern stil för event och privata middagar.", description: "Mörka toner, mjukt ljus och eleganta detaljer ger inspiration till ditt nästa firande. Vi hjälper dig att hitta ett upplägg för ditt tillfälle.", cardDescription: "Karaktär och atmosfär för minnesvärda tillfällen.", hero: [705,110,739,600], pictures: [[46,729,331,206],[398,729,330,206],[738,729,327,206]] },
  { tagline: "För mindre fester och familjetillfällen.", description: "En ombonad känsla med levande ljus och vackert dukade bord. Ring oss om datum och önskemål så berättar vi mer om möjligheterna.", cardDescription: "En inbjudande känsla för fest och gemenskap.", hero: [705,104,739,596], pictures: [[57,724,324,188],[397,724,326,188],[1084,724,316,188]] },
];
export const venueShowcases: VenueShowcase[] = definitions.map((definition, position) => {
  const index = position + 1;
  const [left,top,width,height] = definition.hero;
  const topRow = index <= 2;
  return {
    id: `showcase-${index}`, slug: `festlokal-${index}`, name: `Festlokal ${index}`,
    tagline: definition.tagline, description: definition.description, cardDescription: definition.cardDescription,
    hero: photo(index,left,top,width,height,"dukning och lokalens atmosfär"),
    cardImage: {src:"/images/venues/overview-reference.png",alt:`Festlokal ${index} – inspirationsbild`,crop:{left:index%2 ? 49 : 736,top:topRow ? 296 : 645,width:663,height:200}},
    images: definition.pictures.map(([x,y,w,h], imageIndex) => photo(index,x,y,w,h,["festdukning","blommor och bordsdetaljer","lokalens inramning"][imageIndex])),
    videoSrc: `/videos/venues/festlokal-${index}.mp4`, videoLabel:"Bildspel", illustration:true,
  };
});
export function publishedVenuePresentation(venue: Venue): VenueShowcase {
  return { id:venue.id,slug:venue.slug,name:venue.name,tagline:"En plats för ditt tillfälle.",description:venue.description,cardDescription:venue.description,
    hero:venue.images[0],images:venue.images,capacity:venue.capacity,address:venue.address,facilities:venue.facilities,phone:venue.phone };
}
export function listVenuePresentations(catalog: HospitalityCatalog): VenueShowcase[] {
  return catalog.venues.length ? catalog.venues.map(publishedVenuePresentation) : catalog.preview ? venueShowcases : [];
}
export function findVenuePresentation(catalog: HospitalityCatalog, slug: string): VenueShowcase | undefined {
  const real = catalog.venues.find(venue => venue.slug === slug);
  return real ? publishedVenuePresentation(real) : catalog.preview ? venueShowcases.find(venue => venue.slug === slug) : undefined;
}
