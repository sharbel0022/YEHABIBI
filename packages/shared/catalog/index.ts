import type { Catalog, Dish, ItemCategory, Menu, MenuItem, Settings } from '../types/index.ts';

export const BRAND = 'Cedar Mezze';

/** En gemensam förhandsvisning. Endast backendens verifierade katalog kan öppna beställningar. */
export const previewMenus: Menu[] = [
  {
    id: '11111111-1111-4111-8111-111111111111', slug: 'mezze-klassiker', title: 'Mezze Klassiker',
    description: 'Ett generöst urval kalla och varma libanesiska favoriter.',
    included: ['Hummus', 'Baba ganoush', 'Tabbouleh', 'Falafel', 'Vinblad'], allergens: ['Sesam', 'Vete'],
    price_ore: 0, min_people: 10, image_url: '/images/mezze.webp', active: true, sort_order: 1,
  },
  {
    id: '22222222-2222-4222-8222-222222222222', slug: 'grill-och-mezze', title: 'Grill & Mezze',
    description: 'Det bästa från grillen tillsammans med klassiska mezerätter.',
    included: ['Kafta', 'Kycklingspett', 'Hummus', 'Sallad', 'Ris'], allergens: ['Sesam', 'Vete'],
    price_ore: 0, min_people: 10, image_url: '/images/grill.webp', active: true, sort_order: 2,
  },
  {
    id: '33333333-3333-4333-8333-333333333333', slug: 'familjebuffe', title: 'Familjebuffé',
    description: 'En festlig buffé för stora och små sällskap.',
    included: ['Blandade meze', 'Grillrätter', 'Sallader', 'Bröd'], allergens: ['Sesam', 'Vete'],
    price_ore: 0, min_people: 15, image_url: '/images/fest.webp', active: true, sort_order: 3,
  },
];

const dishExamples: Array<{ title: string; category: ItemCategory }> = [
  { title: 'Hummus', category: 'kalla_meze' },
  { title: 'Tabbouleh', category: 'vegetariskt' },
  { title: 'Ostrullar', category: 'varma_meze' },
  { title: 'Kebbe', category: 'varma_meze' },
  { title: 'Falafel', category: 'varma_meze' },
  { title: 'Vinblad', category: 'kalla_meze' },
  { title: 'Kafta', category: 'grill' },
  { title: 'Kycklingspett', category: 'grill' },
  { title: 'Grillmix', category: 'grill' },
  { title: 'Bröd och såser', category: 'brod_saser' },
  { title: 'Dessert', category: 'dessert' },
];

export const previewDishes: Dish[] = dishExamples.map(({ title, category }, index) => ({
  id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
  slug: `demo-${index + 1}`, title, category,
  description: 'Demonstrationsrätt. Pris, portionsstorlek och allergener bekräftas av ägaren före bokning.',
  allergens: [], price_ore: 0, portion_label: 'Bekräftas av ägaren', suggested_per_person: 0,
  image_url: category === 'grill' ? '/images/grill.webp' : category === 'dessert' ? '/images/fest.webp' : '/images/mezze.webp',
  active: true, sort_order: index,
}));

/** V2-formatet beskriver samma rätter, utan en separat menylista eller exempelpriser. */
export const previewItems: MenuItem[] = previewDishes.map(dish => ({
  id: dish.id, title: dish.title, description: dish.description,
  category: dish.category || 'kalla_meze', unit_label: dish.portion_label,
  unit_price_ore: dish.price_ore, suggested_per_person: dish.suggested_per_person || 0,
  allergens: dish.allergens, image_url: dish.image_url, active: dish.active, sort_order: dish.sort_order,
}));

export const previewSettings: Settings = {
  id: 1, brand_name: BRAND, tagline: 'Mer än mat – en del av vår kultur.',
  description: 'Äkta libanesiska smaker för hem, fest och företag.',
  service_area: 'Västerås med omnejd (bekräftas före lansering)', location_city: 'Västerås',
  contact_email: '', contact_phone: '', hero_video_url: null, hero_poster_url: '/images/hero.webp',
  google_review_url: null, google_maps_url: null, instagram_url: null, facebook_url: null, tiktok_url: null,
  pickup_address: '', delivery_enabled: true, pickup_enabled: true, cash_enabled: false, allow_unpaid_requests: false,
  delivery_fee_ore: 0, min_advance_days: 2, custom_min_people: 5, delivery_zones: [],
  campaign_title: '', campaign_description: '', campaign_image_url: null,
  campaign_start_date: null, campaign_end_date: null, campaign_enabled: false,
};

export const previewCatalog: Catalog = {
  menus: previewMenus,
  dishes: previewDishes,
  campaigns: [],
  settings: previewSettings,
  delivery_zones: [],
  orders_enabled: false,
  payment_methods: [],
  demo: true,
  test_mode: false,
};
