import type { CateringMenu, HospitalityCatalog } from "@yehabibi/shared";

export const menuArtwork: Record<string, string> = {
  "meny-1": "/images/catering/meny-1.png",
  "meny-2": "/images/catering/meny-2.png",
  "meny-3": "/images/catering/meny-3.png",
  plockmeny: "/images/catering/plockmeny.png",
};

export function menuDishNames(menu: CateringMenu): string[] {
  return [...menu.meze, ...(menu.grill ? [menu.grill] : [])];
}

export type InquirySearch = Record<string, string | string[] | undefined>;

export type DishQuantities = Record<string, number>;
export type CateringSelection = { menuIds: string[]; dishIds: string[]; quantities: DishQuantities };
export const CATERING_DRAFT_KEY = "yehabibi.catering.draft.v1";

export function inquiryHref(menuIds: string[], dishIds: string[], quantities: DishQuantities = {}): string {
  const query = new URLSearchParams();
  for (const id of new Set(menuIds)) query.append("meny", id);
  for (const id of new Set(dishIds)) {
    query.append("ratt", id);
    query.append("antal", String(validQuantity(quantities[id]) || 1));
  }
  return `/catering/forfragan${query.size ? `?${query}` : ""}`;
}

/** Only IDs present in the current public catalog can become inquiry choices. */
export function validQuantity(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return 0;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 999 ? number : 0;
}

export function normalizeSelection(catalog: HospitalityCatalog, raw: unknown): CateringSelection {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const menuIds = Array.isArray(source.menuIds) ? source.menuIds : [];
  const requested = source.quantities && typeof source.quantities === "object" ? source.quantities as Record<string, unknown> : {};
  const quantities: DishQuantities = {};
  for (const dish of catalog.dishes) {
    const quantity = Object.hasOwn(requested, dish.id) ? validQuantity(requested[dish.id]) : 0;
    if (quantity) Object.defineProperty(quantities, dish.id, { value: quantity, enumerable: true, writable: true, configurable: true });
  }
  return {
    menuIds: catalog.menus.filter(menu => menuIds.includes(menu.id)).map(menu => menu.id),
    dishIds: Object.keys(quantities),
    quantities,
  };
}

export function parseInquirySelection(catalog: HospitalityCatalog, search: InquirySearch): CateringSelection {
  const values = (key: string) => {
    const value = search[key];
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
  };
  const ids = values("ratt");
  const counts = values("antal");
  const quantities: DishQuantities = {};
  for (const dish of catalog.dishes) {
    const index = ids.indexOf(dish.id);
    if (index < 0) continue;
    const count = counts[index] === undefined ? 1 : validQuantity(counts[index]);
    if (count) Object.defineProperty(quantities, dish.id, { value: count, enumerable: true, writable: true, configurable: true });
  }
  return normalizeSelection(catalog, { menuIds: values("meny"), quantities });
}

type DishPreview = { src: string; x: number; y: number; zoom: number };
const first = menuArtwork["meny-1"];
const second = menuArtwork["meny-2"];
const third = menuArtwork["meny-3"];
const plock = menuArtwork.plockmeny;

// Focal points display dishes from the supplied posters; the source files stay intact.
const dishPreviews: Record<string, DishPreview> = {
  Hummus: { src: first, x: 0.56, y: 0.52, zoom: 550 },
  Muhammara: { src: first, x: 0.849, y: 0.589, zoom: 390 },
  "Baba Ganoush": { src: second, x: 0.66, y: 0.395, zoom: 480 },
  Labne: { src: second, x: 0.876, y: 0.421, zoom: 420 },
  Fatoush: { src: first, x: 0.704, y: 0.8, zoom: 350 },
  Ostrulle: { src: second, x: 0.57, y: 0.512, zoom: 480 },
  Sambosak: { src: second, x: 0.466, y: 0.658, zoom: 420 },
  Kubbe: { src: third, x: 0.46, y: 0.743, zoom: 600 },
  "Tarator Djaj (kycklingröra)": { src: third, x: 0.82, y: 0.566, zoom: 430 },
  Tabbouleh: { src: third, x: 0.905, y: 0.402, zoom: 580 },
  "Mixgrill (nöt- och kycklingspett)": { src: second, x: 0.758, y: 0.821, zoom: 280 },
  "Mixgrill Special (nöt-, kyckling- och lammspett)": { src: third, x: 0.818, y: 0.813, zoom: 290 },
  Falafel: { src: plock, x: 0.56, y: 0.716, zoom: 440 },
  Baklava: { src: plock, x: 0.516, y: 0.852, zoom: 650 },
};

export function dishPreview(name: string): DishPreview | undefined {
  return dishPreviews[name];
}
