# Fil för fil – enkelt förklarat

Det här är en karta över projektet. Läs i ordningen **startsida → beställning → databas → admin → betalningar → Google**.

## Projektets startfiler

| Fil | Vad gör den? |
|---|---|
| `package.json` | Lista över bibliotek och kommandon som `npm run dev`. |
| `.env.example` | Mall för inställningar och API-nycklar. Kopieras till hemliga `.env.local`. |
| `next.config.ts` | Grundläggande säkerhetsrubriker och cache-regler. |
| `tsconfig.json` | Inställningar för TypeScript. |
| `.gitignore` | Förhindrar att lösenord och byggfiler sparas i GitHub. |
| `.github/workflows/check.yml` | Kör kontroller på GitHub vid varje ändring. |

## Hemsidan – `src/app/`

| Fil | Vad gör den? |
|---|---|
| `layout.tsx` | Sidornas gemensamma meny, sidfot, SEO och mobilstöd. |
| `globals.css` | All färg, stil, layout och mobilanpassning. |
| `page.tsx` | Startsidan med matvideo, menyer, hem/fest/företag och beställningsknappar. |
| `menyer/page.tsx` | Listar cateringpaket och deras priser. |
| `bestall/page.tsx` | Laddar meny och inställningar för beställningsformuläret. |
| `om-oss/page.tsx` | Kort beskrivning av företaget. |
| `kontakt/page.tsx` | Kontakt, område och officiell Google Maps-länk. |
| `festcatering-vasteras/page.tsx` | Enkel sida för sökningar om festcatering. |
| `foretagscatering-vasteras/page.tsx` | Enkel sida för företagscatering. |
| `integritet/page.tsx` | Utkast som måste godkännas av företaget före lansering. |
| `villkor/page.tsx` | Utkast till beställnings- och avbokningsvillkor. |
| `order/[code]/page.tsx` | Privat orderstatus med en säker länk som bara kunden får. |
| `admin/page.tsx` | Ägarens översikt med enkel statistik. |
| `admin/orders/page.tsx` | Ägaren granskar beställningar. |
| `admin/menus/page.tsx` | Ägaren ändrar cateringmenyer. |
| `admin/settings/page.tsx` | Ägaren ändrar kontakt, video, sociala länkar och QR-koder. |
| `auth/callback/route.ts` | Tar emot administratörens engångsinloggning. |
| `robots.ts` | Ber Google låta bli att indexera en ofärdig sida. |
| `sitemap.ts` | Talar om för Google vilka offentliga sidor som finns. |

## Små byggklossar – `src/components/`

| Fil | Vad gör den? |
|---|---|
| `Brand.tsx` | Logotyp och namn i menyn. |
| `Header.tsx` | Navigering på dator och mobil. |
| `Footer.tsx` | Kontaktlänkar och sidfot. |
| `HeroMedia.tsx` | Bakgrundsvideo med stillbild, ljudlös loop och paus. |
| `MenuCard.tsx` | Ett snyggt kort för varje cateringmeny. |
| `OrderForm.tsx` | Hela kundens beställning i tre steg. |
| `Cta.tsx` | Återanvändbar beställningsknapp. |
| `SectionHeading.tsx` | Enhetliga rubriker. |
| `LocalStructuredData.tsx` | Hjälper sökmotorer att förstå verksamheten. |
| `PwaRegister.tsx` | Aktiverar installation som mobilwebbapp. |
| `admin/AdminLogin.tsx` | Logga in med engångslänk. |
| `admin/AdminNav.tsx` | Navigering mellan adminavsnitt. |
| `admin/AdminOrders.tsx` | Godkänn/avvisa/markera kontant betalad/återbetala. |
| `admin/AdminMenus.tsx` | Formulär för menyer, priser och allergener. |
| `admin/AdminSettings.tsx` | Formulär för video, bilder, länkar och QR-koder. |

## Bakom kulisserna – `src/lib/`

| Fil | Vad gör den? |
|---|---|
| `config.ts` | Arbetsnamn, startsidans demomenyer och standardinställningar. |
| `data.ts` | Hämtar menyer och inställningar från databas; ger demo om ingen databas finns. |
| `domain.ts` | Små rena regler: prissumma, kontanter, orderstatus, datum och Swish. |
| `validators.ts` | Kontrollerar inskickad data så att orimliga värden stoppas. |
| `supabase.ts` | Kopplar servern till databasen och inloggningen. |
| `auth.ts` | Kontrollerar att endast ägaren har adminåtkomst. |
| `tracking.ts` | Skapar privata länkar för att följa en order. |
| `payments.ts` | Skapar Stripe-betalningslänk **efter** ägarens godkännande. |
| `mailer.ts` | Skickar mejl om ny förfrågan och ägarens beslut. |
| `browser-upload.ts` | Laddar upp ägarens färdiga media med en kortlivad säker länk. |
| `types/domain.ts` | Beskriver datatyper för meny, order, betalning och inställningar. |

## API – `src/app/api/`

| Fil | Vad gör den? |
|---|---|
| `orders/route.ts` | Tar emot och sparar en ny förfrågan säkert. |
| `admin/orders/[id]/route.ts` | Ändrar orderstatus endast efter kontroll av ägarinloggning. |
| `admin/menus/route.ts` | Skapar nya cateringmenyer. |
| `admin/menus/[id]/route.ts` | Uppdaterar en befintlig meny. |
| `admin/settings/route.ts` | Sparar företagets inställningar. |
| `admin/upload/route.ts` | Godkänner uppladdning av färdiga bilder/videor. |
| `stripe/webhook/route.ts` | Tar emot signerad bekräftelse från Stripe innan ordern markeras som betald. |
| `qr/[kind]/route.ts` | Skapar en riktig skanningsbar QR-kod för beställning eller Google. |
| `health/route.ts` | Enkel kontroll av att webbtjänsten svarar. |

## Databas, media och tester

| Fil/mapp | Vad gör den? |
|---|---|
| `supabase/migrations/0001_cedar_mezze.sql` | Skapar databasens tabeller, orderstatus och skydd. |
| `public/images/` | Tillfälliga designbilder som ersätts av ägarens riktiga bilder. |
| `public/brand-mark.svg` | Enkel cederlogo i SVG-format. |
| `public/manifest.webmanifest` | Visas när mobilwebbappen installeras. |
| `public/sw.js` | Sparar bara offentliga bilder offline, aldrig kunduppgifter. |
| `public/icon-*.png` | Appikoner. |
| `tests/domain.test.mjs` | Automatiska tester för priser, datum, kontanter, orderstatus och säkerhet. |
| `scripts/check-source.cjs` | Enkel syntaxkontroll för TypeScript-filer. |
| `docs/TESTPLAN.md` | Manual testlista före lansering. |
| `docs/LANSERING.md` | Exakt vad som måste ordnas med ägarens konton och Google. |

### Tre filer att börja läsa

1. **`src/app/page.tsx`** – hur startsidan är uppbyggd.
2. **`src/components/OrderForm.tsx`** – vad kunden fyller i.
3. **`src/app/api/orders/route.ts`** – vad som händer när kunden trycker Skicka.

Ändra inte hemliga nycklar i kodfilerna. Alla sådana ska ligga i `.env.local` lokalt och i den valda hostingtjänstens hemliga miljövariabler.
