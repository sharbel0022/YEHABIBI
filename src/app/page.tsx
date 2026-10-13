import Link from 'next/link';
import { ArrowUpRight, CalendarHeart, House, BriefcaseBusiness, MapPin, Star } from 'lucide-react';
import { getMenus, getSettings } from '@/lib/data';
import { HeroMedia } from '@/components/HeroMedia';
import { MenuCard } from '@/components/MenuCard';
import { Cta } from '@/components/Cta';
import { SectionHeading } from '@/components/SectionHeading';
import { safeExternalUrl } from '@/lib/domain';
import { isSupabaseReady } from '@/lib/config';

export default async function HomePage() {
  const [menus, settings] = await Promise.all([getMenus(), getSettings()]);
  const review = safeExternalUrl(settings.google_review_url);
  return <>
    <section className="hero" aria-labelledby="hero-heading">
      <HeroMedia videoUrl={safeExternalUrl(settings.hero_video_url)} poster={settings.hero_poster_url || '/images/hero.webp'} />
      <div className="hero-shade" />
      <div className="shell hero-content">
        <span className="eyebrow eyebrow-light">LIBANESISK CATERING · VÄSTERÅS</span>
        <h1 id="hero-heading">Mer än mat.<br/><em>En del av vår kultur.</em></h1>
        <p>Äkta libanesiska smaker som samlar människor. Till ditt hem, din fest och ditt företag.</p>
        <div className="hero-actions"><Cta href="/bestall">Beställ catering</Cta><Cta href="/menyer" light>Se våra menyer</Cta></div>
      </div>
      <div className="hero-caption">MADE TO SHARE · LIBANESISKA SMAKER</div>
    </section>
    <section className="occasion-bar" aria-label="Vad planerar du?">
      <div className="shell occasion-items">
        <Link href="/bestall?typ=hemma"><House/> <span>Hemma <small>En middag att minnas</small></span></Link>
        <Link href="/festcatering-vasteras"><CalendarHeart/> <span>För fest <small>Fira tillsammans</small></span></Link>
        <Link href="/foretagscatering-vasteras"><BriefcaseBusiness/> <span>För företag <small>En paus att uppskatta</small></span></Link>
      </div>
    </section>
    <section className="section shell" id="menyer">
      <SectionHeading eyebrow="VÅRA MENYER" title="Vällagat, generöst och enkelt." text="Välj bland våra färdiga cateringpaket. Menyerna och priserna bekräftas av oss före varje beställning." />
      {!isSupabaseReady() && <p className="preview-note">Demomenyer: priser fastställs av ägaren före lansering. Beställningar är inte aktiverade.</p>}
      <div className="menu-grid">{menus.slice(0, 3).map(menu => <MenuCard key={menu.id} menu={menu} preview={!isSupabaseReady()}/>)}</div>
      <div className="centered-action"><Link href="/menyer" className="text-link">Se alla menyer <ArrowUpRight size={18}/></Link></div>
    </section>
    <section className="split-section">
      <div className="split-photo"><img src="/images/grill.webp" alt="Libanesiska grillrätter och mezze" loading="lazy" /></div>
      <div className="split-copy"><span className="eyebrow">EN UPPLEVELSE ATT DELA</span><h2>God mat. <em>Äkta möten.</em></h2><p>Vi skapar omtänksam catering med smaker inspirerade av det libanesiska köket – till familjefesten, arbetsplatsen eller hemma hos dig.</p><Cta href="/bestall">Planera din catering</Cta></div>
    </section>
    <section className="section shell easy-section">
      <SectionHeading eyebrow="SÅ ENKELT ÄR DET" title="Tre steg till en god stund." />
      <div className="steps"><div><b>01</b><h3>Välj meny</h3><p>Hitta ett cateringpaket och ange antal personer.</p></div><div><b>02</b><h3>Välj datum & plats</h3><p>Berätta var och när maten ska serveras.</p></div><div><b>03</b><h3>Få bekräftelse</h3><p>Vi granskar din förfrågan och skickar betalningsinformation efter godkännande.</p></div></div>
    </section>
    <section className="section review-section"><div className="shell review-layout"><div><span className="eyebrow">LOKAL CATERING</span><h2>Libanesisk catering i Västerås</h2><p>{settings.service_area}. Vi anpassar catering för hem, fest och företag.</p><div className="review-actions"><Cta href="/kontakt">Kontakta oss</Cta>{review && <a className="text-link" href={review} target="_blank" rel="noopener noreferrer"><Star size={18}/> Lämna omdöme på Google</a>}</div></div><div className="review-illustration"><MapPin size={58}/><strong>Cedar Mezze</strong><span>Västerås & omnejd</span><small>Google-recensioner visas när en verifierad företagslänk finns.</small></div></div></section>
  </>;
}
