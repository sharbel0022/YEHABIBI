import Link from 'next/link';
import {ArrowUpRight,CalendarHeart,House,BriefcaseBusiness,MapPin,Star} from 'lucide-react';
import {getMenus,getSettings} from '@/lib/data';
import {HeroMedia} from '@/components/HeroMedia';
import {MenuCard} from '@/components/MenuCard';
import {Cta} from '@/components/Cta';
import {SectionHeading} from '@/components/SectionHeading';
import {campaignIsActive,safeExternalUrl} from '@/lib/domain';
import {isSupabaseReady} from '@/lib/config';

export default async function HomePage(){
  const [menus,settings]=await Promise.all([getMenus(),getSettings()]);
  const review=safeExternalUrl(settings.google_review_url);
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm'}).format(new Date());
  const showCampaign=campaignIsActive(
    settings.campaign_enabled,settings.campaign_start_date,settings.campaign_end_date,today
  ) && !!settings.campaign_title;

  return <>
    <section className="hero" aria-labelledby="hero-title">
      <HeroMedia videoUrl={safeExternalUrl(settings.hero_video_url)}
        poster={settings.hero_poster_url||'/images/hero.webp'}/>
      <div className="hero-shade"/>
      <div className="shell hero-content">
        <span className="eyebrow eyebrow-light">CEDAR MEZZE · LIBANESISK CATERING</span>
        <h1 id="hero-title">Libanesiska smaker, <em>hemma hos dig.</em></h1>
        <p>Från en kväll med vänner till årets stora fest. Välj din favoritmat, antal personer och hur du vill få den.</p>
        <div className="hero-actions">
          <Cta href="/menyer?val=bygg">Bygg din meny</Cta>
          <Cta href="/menyer" light>Se cateringpaket</Cta>
        </div>
      </div>
    </section>
    <section className="section shell occasions-v2">
      <SectionHeading eyebrow="VÄLJ TILLFÄLLE" title="Catering för alla tillfällen."
        text="En middag med grabbarna, en familjefest eller en dag med kollegorna."/>
      <div className="occasion-cards">
        <Link href="/bestall?typ=hemma&val=bygg" className="occasion-card">
          <House aria-hidden="true"/><h3>Hemma</h3>
          <p>5–10 vänner eller familjen runt samma bord.</p>
          <span>Välj hemma <ArrowUpRight size={18}/></span>
        </Link>
        <Link href="/bestall?typ=fest&val=bygg" className="occasion-card">
          <CalendarHeart aria-hidden="true"/><h3>Fest</h3>
          <p>Födelsedag, examen och andra tillfällen att fira.</p>
          <span>Välj fest <ArrowUpRight size={18}/></span>
        </Link>
        <Link href="/bestall?typ=foretag&val=bygg" className="occasion-card">
          <BriefcaseBusiness aria-hidden="true"/><h3>Företag</h3>
          <p>Möten, konferens eller catering på jobbet.</p>
          <span>Välj företag <ArrowUpRight size={18}/></span>
        </Link>
      </div>
    </section>
    <section className="section shell" id="menyer">
      <SectionHeading eyebrow="FÄRDIGA FAVORITER" title="Färdiga paket. Eller din egen mix."
        text="Välj ett av våra cateringpaket eller bestäm själv hur många ostrullar, grillspett och mezzerätter ni vill ha."/>
      {!isSupabaseReady()&&<p className="preview-note">Designexempel. Ägaren behöver godkänna alla priser och allergener innan beställningarna öppnar.</p>}
      <div className="menu-grid">
        {menus.slice(0,3).map(menu=><MenuCard key={menu.id} menu={menu} preview={!isSupabaseReady()}/>)}
      </div>
      <div className="centered-action"><Link href="/menyer?val=bygg" className="btn btn-primary">Bygg din egen catering <ArrowUpRight size={18}/></Link></div>
    </section>
    <section className="split-section build-highlight">
      <div className="split-photo"><img src="/images/mezze.webp" alt="Libanesisk mezze att dela med vänner" loading="lazy"/></div>
      <div className="split-copy">
        <span className="eyebrow">BESTÄM SJÄLV</span>
        <h2>En meny <em>som passar er.</em></h2>
        <p>Välj antal per rätt. Se varje styckpris, totalsumman och pris per person direkt. Hämta maten eller välj hemleverans.</p>
        <Cta href="/menyer?val=bygg">Bygg din meny</Cta>
      </div>
    </section>
    {showCampaign&&<section className="section shell seasonal-section" aria-label="Aktuell cateringkampanj">
      {settings.campaign_image_url&&<img src={settings.campaign_image_url} alt={settings.campaign_title} loading="lazy"/>}
      <div><span className="eyebrow">SÄSONGEN JUST NU</span><h2>{settings.campaign_title}</h2>
        <p>{settings.campaign_description}</p><Cta href="/menyer">Se cateringmenyer</Cta></div>
    </section>}
    <section className="section shell easy-section" id="sa-funkar-det">
      <SectionHeading eyebrow="SÅ FUNGERAR DET" title="Enkelt från början till slut."/>
      <div className="steps">
        <div><b>01</b><h3>Välj mat</h3><p>Färdigt paket eller bygg själv. Priset visas tydligt.</p></div>
        <div><b>02</b><h3>Datum och plats</h3><p>Välj hemma, fest eller företag och leverans eller hämtning.</p></div>
        <div><b>03</b><h3>Få bekräftelse</h3><p>Ägaren godkänner förfrågan. Betala därefter med Swish, kort, Apple Pay eller kontant vid hämtning.</p></div>
      </div>
    </section>
    <section className="section review-section">
      <div className="shell review-layout">
        <div><span className="eyebrow">LOKAL LIBANESISK CATERING</span>
          <h2>Smaker att dela i Västerås.</h2>
          <p>{settings.service_area}. Vi levererar catering till hem, fester och företag efter överenskommelse.</p>
          <div className="review-actions"><Cta href="/kontakt">Kontakta oss</Cta>
            {review&&<a className="text-link" href={review} target="_blank" rel="noopener noreferrer">
              <Star size={18}/> Lämna ett ärligt omdöme på Google</a>}
          </div>
        </div>
        <div className="review-illustration">
          <MapPin size={52}/><strong>Cedar Mezze</strong><span>Västerås med omnejd</span>
          <small>Officiella Google-recensioner kan öppnas när företagets profil är verifierad.</small>
        </div>
      </div>
    </section>
  </>;
}
