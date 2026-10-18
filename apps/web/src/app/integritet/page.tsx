import type { Metadata } from 'next';
export const metadata: Metadata = { alternates: { canonical: '/integritet' }, title: 'Integritetspolicy – utkast', robots:{index:false,follow:false} };
export default function Privacy(){return <section className="shell section inner-page legal"><span className="eyebrow">FÖRE LANSERING</span><h1>Integritetspolicy – utkast</h1>
  <p>Företaget behöver ange personuppgiftsansvarig, juridiskt namn, kontaktadress och godkända rutiner före lansering. Detta är ett tekniskt underlag och ingen färdig integritetspolicy.</p>
  <h2>Uppgifter i beställningar</h2><p>Gästbeställning kräver inget kundkonto. Namn, telefon och e-post används för ordern. Leverans behöver dessutom adress och postnummer. Leveransinstruktioner och andra meddelanden är frivilliga. Undvik att skriva fler personuppgifter än köket behöver.</p>
  <h2>Åtkomst och lagring</h2><p>Orderstatus nås genom en privat orderlänk. Behandla länken som en hemlighet. Kundens kontaktuppgifter och kökets interna anteckningar ingår inte i den publika statusvyn. Behörig personal kan läsa ordern i admin.</p><p>Företaget ska besluta och dokumentera ändamål, rättslig grund, mottagare, lagringstid, rättigheter samt rutiner för åtkomst, rättelse och radering. Ingen automatisk radering är aktiverad innan lagringskrav och bokföringsbehov har granskats.</p>
  <h2>Tekniska leverantörer</h2><p>Hosting, databas, e-post och betalningsleverantör samt relevanta avtal behöver anges när tjänsterna är valda. Testmiljön använder syntetiska uppgifter och fångar meddelanden lokalt.</p>
  <p className="preview-note">Riktiga beställningar ska vara avstängda tills ansvarig godkänt policy, lagringsrutiner och leverantörsavtal.</p>
</section>}
