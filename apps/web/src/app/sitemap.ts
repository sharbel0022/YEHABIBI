import type { MetadataRoute } from 'next';
import { isIndexable,siteUrl } from '@/lib/config';
export default function sitemap():MetadataRoute.Sitemap {
  if(!isIndexable())return [];
  const paths=['','/menyer','/bestall','/om-oss','/kontakt','/festcatering-vasteras','/foretagscatering-vasteras'];
  return paths.map(path=>({url:siteUrl()+path,changeFrequency:'monthly',priority:path===''?1:0.8}));
}
