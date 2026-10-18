import type { Settings, Catalog } from '@/types/domain';
import { siteUrl } from '@/lib/config';
import { safeExternalUrl } from '@/lib/domain';
export function LocalStructuredData({settings,openingHours}:{settings:Settings;openingHours?:Catalog['opening_hours']}){
  const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const business={
    '@context':'https://schema.org', '@type':'FoodEstablishment',
    name:settings.brand_name, url:siteUrl(), image:siteUrl()+'/images/hero.webp',
    description:settings.description,
    servesCuisine:'Lebanese',
    hasMenu:siteUrl()+'/menyer',
    ...(openingHours?{openingHoursSpecification:openingHours.weekly_hours.filter(day=>!day.closed).map(day=>({
      '@type':'OpeningHoursSpecification',dayOfWeek:`https://schema.org/${weekdays[day.weekday]}`,
      opens:day.pickup_from,closes:day.pickup_until
    }))}:{}),
    areaServed:{'@type':'City',name:settings.location_city},
    ...(settings.contact_phone?{telephone:settings.contact_phone}:{}),
    ...(settings.contact_email?{email:settings.contact_email}:{}),
    sameAs:[settings.instagram_url,settings.facebook_url,settings.tiktok_url].map(safeExternalUrl).filter(Boolean)
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(business).replace(/</g,'\\u003c')}}/>;
}
