import type { MetadataRoute } from 'next';
import { isIndexable,siteUrl } from '@/lib/config';
export default function robots():MetadataRoute.Robots{
  if(!isIndexable())return {rules:[{userAgent:'*',disallow:'/'}]};
  return {rules:[{userAgent:'*',allow:'/',disallow:['/admin','/order','/api','/auth']}],sitemap:`${siteUrl()}/sitemap.xml`};
}
