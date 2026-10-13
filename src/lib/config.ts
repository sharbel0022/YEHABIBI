import type { Menu, Settings } from '@/types/domain';

export const BRAND = 'Cedar Mezze';
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const isIndexable = () => process.env.NEXT_PUBLIC_INDEXABLE === 'true';
export const isSupabaseReady = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Demonstration ONLY. No public order can be saved until the database is configured.
export const previewMenus: Menu[] = [
  { id:'11111111-1111-4111-8111-111111111111', slug:'mezze-klassiker', title:'Mezze Klassiker', description:'Ett generöst urval kalla och varma libanesiska favoriter.', included:['Hummus','Baba ganoush','Tabbouleh','Falafel','Vinblad'], allergens:['Sesam','Vete'], price_ore:0, min_people:10, image_url:'/images/mezze.webp', active:true, sort_order:1 },
  { id:'22222222-2222-4222-8222-222222222222', slug:'grill-och-mezze', title:'Grill & Mezze', description:'Det bästa från grillen tillsammans med klassiska mezerätter.', included:['Kafta','Kycklingspett','Hummus','Sallad','Ris'], allergens:['Sesam','Vete'], price_ore:0, min_people:10, image_url:'/images/grill.webp', active:true, sort_order:2 },
  { id:'33333333-3333-4333-8333-333333333333', slug:'familjebuffe', title:'Familjebuffé', description:'En festlig buffé för stora och små sällskap.', included:['Blandade meze','Grillrätter','Sallader','Bröd'], allergens:['Sesam','Vete'], price_ore:0, min_people:15, image_url:'/images/fest.webp', active:true, sort_order:3 }
];

export const previewSettings: Settings = {
  id:1, brand_name:BRAND, tagline:'Mer än mat – en del av vår kultur.',
  description:'Äkta libanesiska smaker för hem, fest och företag.',
  service_area:'Västerås med omnejd (bekräftas före lansering)', location_city:'Västerås',
  contact_email:'', contact_phone:'', hero_video_url:null,
  hero_poster_url:'/images/hero.webp',
  google_review_url:process.env.GOOGLE_REVIEW_URL || null,
  google_maps_url:process.env.GOOGLE_MAPS_URL || null,
  instagram_url:process.env.INSTAGRAM_URL || null,
  facebook_url:process.env.FACEBOOK_URL || null,
  tiktok_url:process.env.TIKTOK_URL || null,
  pickup_address:'', delivery_enabled:true, pickup_enabled:true,
  cash_enabled:true, delivery_fee_ore:0, min_advance_days:2
};
