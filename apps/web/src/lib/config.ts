import { BRAND, previewMenus, previewItems, previewSettings as sharedPreviewSettings } from '@yehabibi/shared';

export { BRAND, previewMenus, previewItems };
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const isIndexable = () => process.env.NEXT_PUBLIC_INDEXABLE === 'true';
export const isSupabaseReady = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Bara servern läser miljövariabler. Den gemensamma demonstrationen har inga företagspriser. */
export const previewSettings = {
  ...sharedPreviewSettings,
  google_review_url: process.env.GOOGLE_REVIEW_URL || null,
  google_maps_url: process.env.GOOGLE_MAPS_URL || null,
  instagram_url: process.env.INSTAGRAM_URL || null,
  facebook_url: process.env.FACEBOOK_URL || null,
  tiktok_url: process.env.TIKTOK_URL || null,
};
