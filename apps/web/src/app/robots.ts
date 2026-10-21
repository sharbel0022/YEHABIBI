import type { MetadataRoute } from 'next';
import { isIndexable,siteUrl } from '@/lib/config';
import { getHospitalityCatalog } from '@/lib/hospitality';
export const dynamic = 'force-dynamic';
export default async function robots():Promise<MetadataRoute.Robots>{
  if(!isIndexable() || (await getHospitalityCatalog()).preview)return {rules:[{userAgent:'*',disallow:'/'}]};
  return {rules:[{userAgent:'*',allow:'/',disallow:['/admin','/order','/api','/auth']}],sitemap:`${siteUrl()}/sitemap.xml`};
}
