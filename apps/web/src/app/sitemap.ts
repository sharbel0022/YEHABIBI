import type { MetadataRoute } from 'next';
import { isIndexable, siteUrl } from '@/lib/config';
import { getHospitalityCatalog } from '@/lib/hospitality';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getHospitalityCatalog();
  if (!isIndexable() || catalog.preview) return [];
  const paths = ['', '/catering', '/festlokal', '/om-oss', '/kontakt', '/festcatering-vasteras', '/foretagscatering-vasteras', ...catalog.menus.filter(menu => menu.approved).map(menu => `/catering/${menu.slug}`), ...catalog.venues.map(venue => `/festlokal/${venue.slug}`)];
  return paths.map(path => ({ url: siteUrl() + path, changeFrequency: 'monthly', priority: path === '' ? 1 : 0.8 }));
}
