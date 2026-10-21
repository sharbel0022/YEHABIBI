import type { CateringDish } from "@yehabibi/shared";

export const plockCategories = [
  { id: "cold", label: "Kalla meze", description: "Smårätter att kombinera till din egen meny." },
  { id: "salads", label: "Sallader", description: "Välj sallader till din catering." },
  { id: "warm", label: "Varma meze", description: "Varma smårätter för din plockmeny." },
  { id: "grill", label: "Grillrätter", description: "Spett och grillkombinationer enligt önskemål." },
  { id: "sides", label: "Tillbehör", description: "Komplettera med bröd, ris eller såser." },
  { id: "dessert", label: "Desserter", description: "En söt avslutning till din catering." },
] as const;

type DishDetails = { image: string | undefined; description: string; categoryId: string };
const photo = (name: string) => `/images/plock/${name}.jpg`;
const details: Record<string, DishDetails> = {
  hummus: { image: photo("hummus"), description: "Krämig kikärtsröra till din plockmeny.", categoryId: "cold" },
  muhammara: { image: photo("muhammara"), description: "Paprikabaserad röra med fyllig smak.", categoryId: "cold" },
  "baba ganoush": { image: photo("baba-ganoush"), description: "Aubergineröra som passar att kombinera.", categoryId: "cold" },
  labne: { image: photo("labne"), description: "Yoghurtbaserad rätt till dina kalla meze.", categoryId: "cold" },
  fatoush: { image: photo("fatoush"), description: "Libanesisk sallad till din catering.", categoryId: "salads" },
  tabbouleh: { image: photo("tabbouleh"), description: "Persiljesallad som kompletterar din meny.", categoryId: "salads" },
  ostrulle: { image: photo("ostrulle"), description: "Fylld rulle enligt kökets recept.", categoryId: "warm" },
  sambosak: { image: photo("sambosak"), description: "Fylld degbit från vårt mezesortiment.", categoryId: "warm" },
  kubbe: { image: photo("kubbe"), description: "Traditionell kubbe till din plockmeny.", categoryId: "warm" },
  falafel: { image: photo("falafel"), description: "Kikärtsbaserade bollar att lägga till.", categoryId: "warm" },
  kycklingspett: { image: photo("kycklingspett"), description: "Kycklingspett från grillen.", categoryId: "grill" },
  "nötspett": { image: photo("notspett"), description: "Nötkött på spett till din catering.", categoryId: "grill" },
  lammspett: { image: photo("lammspett"), description: "Lamm på spett enligt önskemål.", categoryId: "grill" },
  mixgrill: { image: photo("mixgrill"), description: "En blandad grillkombination.", categoryId: "grill" },
  libabröd: { image: photo("libabrod"), description: "Bröd att servera till dina valda rätter.", categoryId: "sides" },
  ris: { image: photo("ris"), description: "Ris som tillbehör till menyn.", categoryId: "sides" },
  "såser": { image: photo("saser"), description: "Såser enligt kökets sortiment.", categoryId: "sides" },
  baklava: { image: photo("baklava"), description: "Söt bakelse som avslutning.", categoryId: "dessert" },
  "tarator djaj": { image: undefined, description: "Kycklingröra till dina kalla meze.", categoryId: "cold" },
  "mixgrill special": { image: photo("mixgrill"), description: "Mixgrill med nöt-, kyckling- och lammspett.", categoryId: "grill" },
};
const categoryIds: Record<string, string> = {
  "kalla meze": "cold", sallader: "salads", "varma meze": "warm", "grillrätter": "grill",
  grill: "grill", "tillbehör": "sides", desserter: "dessert", "sött tillägg": "dessert",
};

/** Public visibility remains the catalog's responsibility; this only adds presentation. */
export function getPlockDish(dish: CateringDish): DishDetails {
  const known = detailsFor(dish.name);
  if (known) return known;
  const category = dish.category.trim().toLocaleLowerCase("sv-SE");
  return {
    image: undefined,
    description: "Beskriv dina önskemål så bekräftar vi innehåll och upplägg.",
    categoryId: Object.prototype.hasOwnProperty.call(categoryIds, category) ? categoryIds[category] : "other",
  };
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("sv-SE").replace(/\s*\(.*\)\s*$/, "");
}

function detailsFor(name: string): DishDetails | undefined {
  const key = normalizeName(name);
  return Object.prototype.hasOwnProperty.call(details, key) ? details[key] : undefined;
}

export function getDishPhoto(name: string): string | undefined {
  return detailsFor(name)?.image;
}
