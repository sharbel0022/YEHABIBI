import type { Metadata } from 'next';
export const metadata: Metadata = { alternates: { canonical: '/villkor' }, title: 'Beställningsvillkor – utkast', robots:{index:false,follow:false} };
export default function Terms(){return <section className="shell section inner-page legal">
  <span className="eyebrow">FÖRE LANSERING</span><h1>Beställningsvillkor – utkast</h1>
  <p>Företagets ansvariga behöver godkänna sortiment, mängder, priser, momshantering, öppettider, leveransområden samt köp-, avboknings- och återbetalningsvillkor innan riktiga beställningar öppnas. Detta är ett ofärdigt utkast.</p>
  <h2>Färdiga paket</h2><p>Du granskar paket, tillbehör, totalpris och serverns tillgängliga tid före betalning. En tillfällig tidsreservation är ännu ingen betalningsbekräftelse. Onlinebetalning och tid bekräftas efter verifiering. Om ett sent betalningsbesked gör att tiden inte kan hållas behöver köket ordna en ny tid eller återbetalning. Kontant vid hämtning kan erbjudas separat när företaget aktiverat det.</p>
  <h2>Specialcatering</h2><p>En skickad förfrågan är inte automatiskt en bekräftad cateringbeställning. Köket granskar tillgänglighet och återkommer med godkännande eller ändringsförslag. Kunden accepterar aktuell prisrevision före betalning.</p>
  <h2>Allergener och portionsstorlek</h2><p>Kontrollera paketets innehåll, mängder och allergener före köp. Ansvarig livsmedelsverksamhet måste verifiera uppgifterna och hanteringen av särskilda behov. Paketkomponenter byts inte automatiskt; använd cateringförfrågan för anpassning.</p>
  <p className="preview-note">TESTLÄGE innebär simulerade betalningar och inga riktiga beställningar. Slutliga företagsvillkor ska finnas här före lansering.</p>
</section>}
