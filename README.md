# Cedar Mezze – libanesisk catering

**V2 – vit, enkel och mobilanpassad design** med hemcatering även för 5–10 personer, styckrätter och livepris per person.

En **lättläst Next.js-webbapp** för förbeställd libanesisk catering i Västerås. Projektet ligger i repot `YEHABIBI` men använder arbetsnamnet **Cedar Mezze**. Företagets juridiska namn, menypriser, domän och Google-profil måste godkännas innan publicering.

## Välj kodfil och förstå den

**Läs [docs/FIL_FOR_FIL_V2.md](docs/FIL_FOR_FIL_V2.md)** för språk, databas, varför varje fil finns och exempel på prislogiken.

**Teknik:** TypeScript, React/Next.js, ren CSS, PostgreSQL/Supabase, Stripe och Resend.

## Nytt i V2

- Vit layout med cedergrönt träd, enkel toppmeny och kampanjer som kan tidsstyras.
- Välj **Hemma**, **Fest** eller **Företag**. Bygg egen meny även till ett mindre sällskap.
- Lägg till och ta bort ostrullar, hummus och andra rätter. Visa exakt radpris, total och pris per person.
- Färdiga paket finns kvar som alternativ.
- Ägaren får ett separat redigeringsgränssnitt för varje rätt: pris/styck, rekommenderad mängd, allergener och foto.
- Levanszoner via postnummer och val mellan hemleverans/hämtning.
- Migrering `supabase/migrations/0002_cedar_mezze_v2.sql` krävs **efter** grundmigreringen 0001.

## Det här går att göra

- Se en elegant startsida med stor matbild, stöd för ägarens korta ljudlösa video, pausknapp och mobilanpassning.
- Bläddra bland cateringpaket för **hemma, fest och företag**.
- Välja meny, antal personer, datum, tid, leverans/hämtning och betalningsönskemål.
- Skicka en **förfrågan först**; ingen betalning görs förrän ägaren godkänt.
- Få mejl om ordern och en privat länk för att följa status.
- Ägaren kan godkänna/neka, föreslå ändringar, skicka Stripe-betalningslänk, markera kontanter mottagna, redigera menyer och lägga in färdiga bilder/filmer.
- Två QR-koder: beställning och **verifierad Google-recensionslänk**.
- Lokal SEO med sitemap, metadata, strukturerad data och sidor för fest- och företagscatering.
- Installera sidan som en PWA på mobilen.

## Kom igång lokalt

Förutsättningar: **Node.js 22+**, npm och egna Supabase-/Stripe-/Resend-konton om du vill ta emot verkliga ordrar.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Öppna `http://localhost:3000`. Utan inloggnings- och betalningsuppgifter visas en **säker demoversion**, som INTE tar emot riktiga beställningar.

## Aktivera databas och admin

1. Skapa ett Supabase-projekt som ägs av cateringföretaget.
2. Kör `supabase/migrations/0001_cedar_mezze.sql` och sedan `supabase/migrations/0002_cedar_mezze_v2.sql` i SQL Editor.
3. Kopiera projektets URL, publishable/anon-nyckel och **hemliga** service-role-nyckel till `.env.local`.
4. Bjud in ägaren i Supabase Auth. Skriv samma e-postadress i `ADMIN_EMAILS`.
5. Tillåt korrekt inloggnings-redirect `http://localhost:3000/auth/callback` lokalt, och den slutliga domänen i produktion.
6. Gå till `/admin` och begär en engångslänk via e-post.
7. Lägg in **riktiga** cateringpriser, bilder, allergener, hämtadress, leveransområde och kontaktuppgifter.

Dessa fält måste vara korrekt ifyllda före riktiga beställningar.

## Betalningar och e-post

1. Skapa Stripe-kontot i cateringföretagets namn och börja med **testnycklar**.
2. Lägg in `STRIPE_SECRET_KEY` och skapa Stripe-webhook för `https://DIN-DOMÄN/api/stripe/webhook`. Spara `STRIPE_WEBHOOK_SECRET`.
3. Lyssna på `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` och `charge.refunded`.
4. Aktivera Swish **i Stripe-kontot** innan `STRIPE_SWISH_ENABLED=true`. Apple Pay visas av Stripe på kompatibla enheter för kortbetalning.
5. Anslut en verifierad avsändardomän hos Resend. Ange `RESEND_API_KEY`, `EMAIL_FROM` och `OWNER_NOTIFICATION_EMAIL`.
6. Skapa **två olika, långa slumpade hemligheter** för `ORDER_RATE_LIMIT_SECRET` och `ORDER_LINK_SECRET`.
7. Ägaren godkänner sekretesspolicy, villkor, priser, momssatser och rutiner kring kontanter/kassaregister med rådgivare. Först därefter: `ORDERS_ENABLED=true`.

**Säkerhet:** sätt aldrig Stripe secret, Resend API-nyckel eller Supabase service-role i en variabel som börjar med `NEXT_PUBLIC_`.

## Publicering och Google

1. Godkänn namnet *Cedar Mezze* och koppla en riktig domän. Ändra `NEXT_PUBLIC_SITE_URL` till exakt HTTPS-domän.
2. Anslut domänen till Next.js-hosting med stöd för serverfunktioner (t.ex. Vercel).
3. Behåll `NEXT_PUBLIC_INDEXABLE=false` tills både domän, företag, juridik, media och menyer är klara.
4. När webbplatsen är offentlig och färdig, sätt `NEXT_PUBLIC_INDEXABLE=true` och skicka `sitemap.xml` till Google Search Console.
5. Kontrollera att en Google Business Profile är tillåten för det nya namnet. Ange rätt företagskategori, serviceområde, webbplats och kontaktuppgifter. Använd bara officiella Google-länkar.
6. Klistra in den **officiella** Google-recensionslänken i `/admin/settings` och hämta de två SVG QR-koderna där.
7. Testa iPhone, Android, kort, Swish i testläge, kontant, alla mejl och Stripe-webhook med fejkade testordrar.

**Viktigt:** Koden kan förbättra sökmotorernas förståelse av webbplatsen, men Google-betyg, recensioner, ranking och verifiering kan inte skapas/garanteras automatiskt. Du kan inte publicera recensioner på Google åt kunden från den här sidan.

## Tester

```bash
npm run syntax
npm run test
npm run typecheck
npm run build
```

GitHub Actions gör samma kontroller när koden pushas. Se även `docs/V2_ACCEPTANS.md` för testfall till de nya funktionerna. Denna version är **inte en live-produktionsrelease** förrän ägarens konton och innehåll anslutits.

## Hitta rätt fil

**Börja med [`docs/FIL_FOR_FIL.md`](docs/FIL_FOR_FIL.md).** Där beskrivs varje del på enkel svenska.

**Ingen fotografering eller videoproduktion ingår.** Ägaren skickar färdigt material med användningsrätt; administratören väljer när det ska publiceras.
