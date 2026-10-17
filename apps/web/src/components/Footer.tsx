import Link from 'next/link';
import type {Settings} from '@/types/domain';
import {Brand} from '@/components/Brand';
import {safeExternalUrl} from '@/lib/domain';
export function Footer({settings}: {settings:Settings}){
  const socials=[['Instagram',settings.instagram_url],['Facebook',settings.facebook_url],['TikTok',settings.tiktok_url]] as const;
  return <footer className="footer"><div className="shell footer-layout">
    <div><Brand/><p>{settings.tagline}</p><p className="muted">Catering för hem, fest och företag. {settings.service_area}.</p></div>
    <div><strong>Utforska</strong><Link href="/menyer">Våra menyer</Link><Link href="/bestall">Beställ catering</Link><Link href="/kontakt">Kontakt</Link></div>
    <div><strong>Följ oss</strong>{socials.map(([label,href])=>safeExternalUrl(href)&&<a key={label} href={href!} rel="noopener noreferrer" target="_blank">{label}</a>)}{safeExternalUrl(settings.google_review_url)&&<a href={settings.google_review_url!} rel="noopener noreferrer" target="_blank">Skriv recension på Google</a>}</div>
    <div><strong>Information</strong><Link href="/integritet">Integritetspolicy (utkast)</Link><Link href="/villkor">Köpvillkor (utkast)</Link><Link href="/admin">Ägarinloggning</Link></div>
  </div><div className="shell footer-bottom"><span>© {new Date().getFullYear()} Cedar Mezze • Arbetsnamn</span><span>Libanesisk catering med omtanke.</span></div></footer>;
}
