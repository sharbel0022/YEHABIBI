import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, BriefcaseBusiness, CalendarHeart, Heart, House, Leaf, MapPin, Star, Users } from 'lucide-react';
import { getCatalog } from '@/lib/data';
import { HeroMedia } from '@/components/HeroMedia';
import { MenuCard } from '@/components/MenuCard';
import { Cta } from '@/components/Cta';
import { SectionHeading } from '@/components/SectionHeading';
import { formatSek, safeExternalUrl } from '@/lib/domain';

export const metadata: Metadata = { alternates: { canonical: '/' } };
const occasions = [
  { type: 'hemma', title: 'Hemma', text: 'Mindre sällskap, familj och vänner.', icon: House },
  { type: 'fest', title: 'Fest', text: 'Födelsedagar, bröllop och stora stunder.', icon: CalendarHeart },
  { type: 'foretag', title: 'Företag', text: 'Från möteslunchen till hela företagets fest.', icon: BriefcaseBusiness }
];

export default async function HomePage() {
  const { menus, dishes, settings, campaigns, demo } = await getCatalog();
  const review = safeExternalUrl(settings.google_review_url);
  return <>
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy"><span className="eyebrow">HEMMA · FEST · FÖRETAG</span>
        <h1 id="hero-title">Äkta libanesisk catering <em>för alla tillfällen.</em></h1>
        <p>Mezze att dela. Smaker att samlas kring. Välj en färdig meny eller bygg er egen – från första favoriten till sista tuggan.</p>
        <div className="hero-order-actions"><Cta href="/bestall-nu">Beställ nu</Cta><Link className="btn btn-outline-light" href="/bestall">Boka catering</Link></div>
        <div className="hero-signature"><img src="/brand-mark.svg" alt="" width={28} height={34}/><span>Yehabibi <small>CEDAR MEZZE</small></span></div>
      </div>
      <div className="hero-photo"><HeroMedia videoUrl={safeExternalUrl(settings.hero_video_url)} poster={settings.hero_poster_url || '/images/hero.webp'}/>
        <span className="hero-photo-note">Mat att dela. Stunder att minnas.</span></div>
    </section>
    <div className="values-bar shell"><span><Leaf size={19}/> Libanesisk matkultur</span><span><Heart size={19}/> Mat att dela</span><span><Users size={19}/> För små och stora sällskap</span></div>
    <section className="section shell">
      <SectionHeading eyebrow="VÄLJ TILLFÄLLE" title="Ett bord för varje tillfälle." text="Vad planerar ni? Vi hjälper er hitta maten som passar."/>
      <div className="occasion-cards">{occasions.map(({ type, title, text, icon: Icon }) =>
        <Link key={type} href={`/bestall?typ=${type}&val=bygg`} className="occasion-card"><Icon aria-hidden="true"/>
          <h3>{title}</h3><p>{text}</p><span>Utforska <ArrowRight size={17}/></span></Link>)}</div>
    </section>
    {dishes.length > 0 && <section className="section section-sand"><div className="shell">
      <div className="section-title-row"><SectionHeading eyebrow="HITTA DINA FAVORITER" title="Lite av allt det goda." text="Kalla meze, något från grillen eller en söt avslutning. Vad blir din favorit?"/>
        <Link className="text-link" href="/menyer?val=bygg">Se alla rätter <ArrowRight size={17}/></Link></div>
      <div className="popular-grid">{dishes.slice(0, 4).map(dish => <article className="popular-card" key={dish.id}>
        <Link href={`/menyer?val=bygg&ratt=${encodeURIComponent(dish.id)}`} className="popular-image" aria-label={`Välj ${dish.title} i menybyggaren`}>
          <img src={dish.image_url || '/images/mezze.webp'} alt={dish.title} width={320} height={260} loading="lazy"/></Link>
        <div className="popular-copy"><h3>{dish.title}</h3><p>{dish.description}</p><div><strong>{dish.price_ore > 0 ? `${formatSek(dish.price_ore)} / ${dish.portion_label}` : 'Pris på förfrågan'}</strong>
          <Link href={`/menyer?val=bygg&ratt=${encodeURIComponent(dish.id)}`} className="round-link" aria-label={`Bygg en meny med ${dish.title}`}><ArrowRight size={18}/></Link></div></div>
      </article>)}</div>
      {demo && <p className="field-hint">Menyn visas som inspiration. Godkända priser och allergener publiceras av köket innan beställningarna öppnar.</p>}
    </div></section>}
    <section className="section shell" id="menyer"><SectionHeading eyebrow="EN MENY SOM PASSAR ER" title="Färdiga favoriter. Er egen mix." text="Låt oss kombinera smakerna, eller välj själv exakt vad som ska stå på bordet."/>
      <div className="menu-grid">{menus.slice(0, 3).map(menu => <MenuCard key={menu.id} menu={menu} preview={demo}/>)}</div>
      <div className="centered-action"><Cta href="/menyer?val=bygg">Bygg din egen meny</Cta></div>
    </section>
    <section className="split-section build-highlight"><div className="split-photo"><img src="/images/mezze.webp" alt="Libanesisk mezze att dela vid bordet" loading="lazy"/></div>
      <div className="split-copy"><span className="eyebrow">PRECIS SÅ SOM NI VILL HA DET</span><h2>Er kväll.<br/><em>Era favoriter.</em></h2>
        <p>Börja med hur många ni blir. Lägg till rätter och anpassa mängden. Varje pris och totalsumman syns längs vägen.</p><Cta href="/menyer?val=bygg">Bygg din meny</Cta></div></section>
    {campaigns.length > 0 && <section className="section shell" aria-label="Aktuella cateringkampanjer"><SectionHeading eyebrow="SÄSONGEN JUST NU" title="Något extra att samlas kring."/>
      <div className="campaign-grid">{campaigns.map(campaign => {
        const media = safeExternalUrl(campaign.media_url);
        const video = /\.(mp4|webm)(\?|$)/i.test(media || '');
        return <article className="menu-card campaign" key={campaign.id}>
          {media && <div className="campaign-media"><HeroMedia videoUrl={video ? media : null} poster={video ? '/images/hero.webp' : media}/></div>}
          <div className="menu-card-body"><h3>{campaign.title}</h3><p>{campaign.description}</p>
            {campaign.menu_ids.length ? campaign.menu_ids.map(id => { const menu = menus.find(item => item.id === id);
              return menu ? <p key={id}><Link className="text-link" href={`/bestall?meny=${encodeURIComponent(id)}`}>{menu.title} <ArrowRight size={17}/></Link></p> : null;
            }) : <Cta href="/menyer">Se menyer</Cta>}</div></article>;
      })}</div></section>}
    <section className="section shell" id="sa-funkar-det"><SectionHeading eyebrow="FRÅN FÖRSTA VAL TILL DUKAT BORD" title="Enkelt hela vägen."/>
      <div className="steps">{[['Välj mat', 'Ett färdigt paket eller din egen meny.'], ['Datum och plats', 'Antal gäster, tillfälle och leverans eller hämtning.'], ['Kontakt och kontroll', 'Lämna dina uppgifter och kontrollera dina val.'], ['Skicka förfrågan', 'Köket granskar och godkänner innan du betalar.']].map(([title, text], index) =>
        <div key={title}><b>0{index + 1}</b><h3>{title}</h3><p>{text}</p></div>)}</div>
    </section>
    <section className="section review-section"><div className="shell review-layout"><div><span className="eyebrow">VÄLKOMMEN TILL VÅRT BORD</span><h2>Libanesiska smaker.<br/>Nära dig.</h2>
      <p>{settings.service_area}. Har du en idé, en fråga eller ett särskilt önskemål? Berätta, så planerar vi tillsammans.</p>
      <div className="review-actions"><Cta href="/kontakt">Prata catering med oss</Cta>{review && <a className="text-link" href={review} target="_blank" rel="noopener noreferrer"><Star size={18}/> Lämna omdöme på Google</a>}</div></div>
      <div className="review-illustration"><MapPin size={40}/><strong>Yehabibi · Cedar Mezze</strong><span>{settings.location_city}</span></div>
    </div></section>
  </>;
}
