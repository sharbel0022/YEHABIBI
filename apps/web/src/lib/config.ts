import type { Menu, MenuItem, Settings } from '@/types/domain';

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

/** Examples only. The public ordering endpoint stays disabled until real prices are approved. */
export const previewItems: MenuItem[] = [
  {id:'44444444-4444-4444-8444-444444444444',title:'Ostrullar',description:'Krispiga ostrullar, exempelpris.',category:'varma_meze',unit_label:'styck',unit_price_ore:2500,suggested_per_person:2,allergens:['Mjölk','Vete – kontrollera i köket'],image_url:'/images/mezze.webp',active:true,sort_order:1},
  {id:'55555555-5555-4555-8555-555555555555',title:'Hummusfat',description:'Hummus med olivolja, exempelpris.',category:'kalla_meze',unit_label:'fat',unit_price_ore:8900,suggested_per_person:0.3,allergens:['Sesam – kontrollera i köket'],image_url:'/images/mezze.webp',active:true,sort_order:2},
  {id:'66666666-6666-4666-8666-666666666666',title:'Kaftaspett',description:'Kryddade libanesiska spett, exempelpris.',category:'grill',unit_label:'styck',unit_price_ore:6500,suggested_per_person:1,allergens:['Kontrollera med köket'],image_url:'/images/grill.webp',active:true,sort_order:3},
  {id:'77777777-7777-4777-8777-777777777777',title:'Tabbouleh',description:'Libanesisk persiljesallad, exempelpris.',category:'vegetariskt',unit_label:'portion',unit_price_ore:6900,suggested_per_person:0.5,allergens:['Vete – kontrollera i köket'],image_url:'/images/mezze.webp',active:true,sort_order:4},
  {id:'88888888-8888-4888-8888-888888888888',title:'Brödpaket',description:'Bröd att dela, exempelpris.',category:'brod_saser',unit_label:'paket',unit_price_ore:8000,suggested_per_person:0.2,allergens:['Vete – kontrollera i köket'],image_url:'/images/mezze.webp',active:true,sort_order:5},
  {id:'99999999-9999-4999-8999-999999999999',title:'Baklava',description:'Söt avslutning, exempelpris.',category:'dessert',unit_label:'bit',unit_price_ore:3500,suggested_per_person:1,allergens:['Nötter','Vete – kontrollera i köket'],image_url:'/images/fest.webp',active:true,sort_order:6}
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
  pickup_address:'', custom_min_people:5, delivery_zones:[],
  campaign_title:'',campaign_description:'',campaign_image_url:null,campaign_start_date:null,campaign_end_date:null,campaign_enabled:false, delivery_enabled:true, pickup_enabled:true,
  cash_enabled:true, delivery_fee_ore:0, min_advance_days:2
};
