import type { Metadata } from 'next';
import { getCatalog } from '@/lib/data';
import { Cta } from '@/components/Cta';
import { safeExternalUrl } from '@/lib/domain';
export const metadata: Metadata = {alternates:{canonical:'/kontakt'},title:'Kontakt, öppettider och leveransområde',description:'Företagets publicerade kontaktuppgifter, öppettider, hämtning och leveransområde.'};
const days=['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag'];
export default async function Contact() {
  const catalog=await getCatalog(),s=catalog.settings,map=safeExternalUrl(s.google_maps_url),hours=catalog.opening_hours;
  return <section className="shell section inner-page"><span className="eyebrow">VI FINNS HÄR</span><h1>Kontakta oss</h1>
    <p className="intro">Välj ett färdigt paket eller kontakta köket för catering till ditt tillfälle.</p>
    <div className="contact-cards"><div><h2>Kontakta köket</h2>
      {s.contact_email?<p>E-post: <a href={`mailto:${s.contact_email}`}>{s.contact_email}</a></p>:<p>Kontaktuppgifter publiceras efter att ägaren har bekräftat dem.</p>}
      {s.contact_phone&&<p>Telefon: <a href={`tel:${s.contact_phone}`}>{s.contact_phone}</a></p>}
      <Cta href="/menyer">Se meny och paket</Cta>
    </div><div><h2>Var levererar vi?</h2><p>{s.service_area}</p>
      {s.pickup_address&&<p>Hämtning: {s.pickup_address}. Välj en tillgänglig tid före köp.</p>}
      {map&&<a href={map} target="_blank" rel="noopener noreferrer" className="text-link">Visa på Google Maps ↗</a>}
    </div></div>
    <h2>Hämtnings- och leveranstider</h2>
    {hours?<><p>Företagets konfigurerade tider. Lediga beställningstider påverkas också av framförhållning, kapacitet och tillfällig paus.</p>
      <div style={{overflowX:'auto'}}><table><caption>Ordinarie tider</caption><thead><tr><th>Dag</th><th>Hämtning</th><th>Leverans</th></tr></thead><tbody>
        {[...hours.weekly_hours].sort((a,b)=>(a.weekday+6)%7-(b.weekday+6)%7).map(day=><tr key={day.weekday}><th scope="row">{days[day.weekday]}</th><td>{day.closed?'Stängt':`${day.pickup_from}–${day.pickup_until}`}</td><td>{day.closed||!s.delivery_enabled?'Stängt':`${day.delivery_from}–${day.delivery_until}`}</td></tr>)}
      </tbody></table></div>
      {!!hours.special_hours.length&&<><h3>Avvikande tider</h3><ul>{[...hours.special_hours].sort((a,b)=>a.date.localeCompare(b.date)).map(day=><li key={day.date}>{day.date}: {day.closed?'Stängt':`hämtning ${day.pickup_from}–${day.pickup_until}${s.delivery_enabled?`, leverans ${day.delivery_from}–${day.delivery_until}`:''}`}</li>)}</ul></>}
    </>:<p>Öppettider publiceras när företaget har godkänt dem.</p>}
  </section>;
}
