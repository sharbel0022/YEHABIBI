# Fil för fil

Börja med `apps/mobile/app/index.tsx`, följ sedan `lib/store.tsx` → `lib/api.ts` → webbens `api/orders/route.ts`. Det visar flödet från kundens val till server och databas. Koden är TypeScript/TSX, databasen SQL och de få verktygsskripten JavaScript.

## Repots rot

| Fil | Varför den finns |
| --- | --- |
| `package.json` | npm workspaces och korta gemensamma start-/testkommandon |
| `package-lock.json` | Låser installationens beroenden; används av CI:s `npm ci` |
| `.gitignore` | Håller nycklar, genererade native-projekt och byggfiler utanför Git |
| `scripts/check-source.cjs` | Enkel syntaxkontroll av TypeScript i appar och shared |
| `tests/domain.test.mjs`, `tests/v3.test.mjs` | V2/V3-regler, Checkout-regressioner och PostgreSQL/WASM med Node test runner |
| `.github/workflows/check.yml` | Installerar och kontrollerar syntax, tester, typer, webb och Expo i GitHub Actions |

## Expo – `apps/mobile/`

Sex kundskärmar och tre små stödfiler delar på samma katalog och regler. Ingen separat mobilbackend behövs.

| Fil | Ansvar |
| --- | --- |
| `app/_layout.tsx` | Expo Routers navigation och gemensam dataprovider |
| `app/index.tsx` | Hem, matbild/video, Hemma/Fest/Företag och kampanjer |
| `app/menyer.tsx` | Cateringpaket, priser, innehåll och val till beställningen |
| `app/bygg.tsx` | Egna maträtter, plus/minus, antal personer och prisöversikt |
| `app/bestall.tsx` | Datum, leverans/hämtning, kontakt, betalningsönskemål och API-submit |
| `app/ordrar.tsx` | Privata sparade orderreferenser, status och Checkout-länk |
| `app/kontakt.tsx` | Riktiga kontaktuppgifter, Maps, sociala länkar och recensioner |
| `lib/api.ts` | Publika API-anrop, säkert referensminne och öppning av externa länkar |
| `lib/store.tsx` | En enkel React Context för katalog, kundval, prisöversikt och orderreferenser |
| `lib/ui.tsx` | Färger, återanvända knappar/fält/bilder och ljudlös pausbar video |
| `app.config.ts` | Namn, ikon, splash, version, EAS-id, schemes och app-id per miljö |
| `eas.json` | Build-profilerna development, preview och production samt separat submit-profil |
| `.env.example` | Publik API-adress och miljöexempel; kopieras till `.env.local` |
| `package.json` | Exakt SDK-kompatibla mobilberoenden och Expo-kommandon |
| `tsconfig.json` | Mobilens TypeScript-inställningar |
| `expo-env.d.ts` | Expo-typer för TypeScript |
| `assets/icon.png` | Appikon och grund för splash/favikon |
| `assets/{hero,mezze,grill,fest}.webp` | Återanvända demobilder från V2; ersätts med företagets material |

Expo SDK 57 och webben använder båda React 19.2.3; Next.js är uppdaterad till 16.4.2. Shared innehåller ingen React-kod. Standardens `npm run dev:mobile` startar Expo Go för iPhone; mobilens `dev` och `android` använder egen development build.

## Gemensamt – `packages/shared/`

| Fil | Ansvar |
| --- | --- |
| `types/index.ts` | Order, katalog, maträtter, kampanjer, zoner och API-typer |
| `pricing/index.ts` | Pris i öre, totalsummor, postnummerzoner, datum, status och säkra länkar |
| `validation/index.ts` | Zod-scheman för order, admin, maträtter, kampanjer och zoner |
| `index.ts` | Kort offentlig exportyta: `@yehabibi/shared` |
| `package.json` | Namn, version och beroenden för npm-workspacet |

## Webben – `apps/web/`

V2:s URL:er finns kvar. Mapparnas flytt ändrar inte adressen `/bestall`, `/admin` eller Stripe-webhookens URL.

| Fil eller grupp under `src/app/` | Ansvar |
| --- | --- |
| `layout.tsx`, `globals.css` | Gemensam svensk sidram, metadata, färger och mobilanpassning |
| `page.tsx` | Startsidan med matmedia, erbjudande och kampanjer |
| `menyer/page.tsx` | Publika cateringpaket |
| `bestall/page.tsx` | Webbens beställningsformulär |
| `order/[code]/page.tsx` | Privat orderstatus med token |
| `festcatering-vasteras/page.tsx` | Relevant lokal sida för festcatering |
| `foretagscatering-vasteras/page.tsx` | Relevant lokal sida för företagscatering |
| `om-oss/page.tsx`, `kontakt/page.tsx` | Företags- och kontaktinformation |
| `villkor/page.tsx`, `integritet/page.tsx` | Utkast som ägaren ska granska före lansering |
| `sitemap.ts`, `robots.ts` | Publika URL:er och indexeringsregler |
| `admin/page.tsx` | Skyddad adminöversikt |
| `admin/orders/page.tsx` | Order, orderrader, åtgärder och betalstatus |
| `admin/menus/page.tsx` | Paket och paketpriser |
| `admin/ratter/page.tsx` | Bevarad V2-admin med kategori och portionshjälp för samma maträtter |
| `admin/catalog/page.tsx` | Maträtter, kampanjer och leveranszoner i en vy |
| `admin/settings/page.tsx` | Företagsinställningar, media och QR-länkar |
| `auth/callback/route.ts` | Slutför Supabase-inloggningen |

### API – `apps/web/src/app/api/`

| Fil | Ansvar |
| --- | --- |
| `catalog/route.ts` | Publik katalog för Expo och webb |
| `orders/route.ts` | Validerar och skapar en obetald kundförfrågan |
| `orders/[code]/route.ts` | Begränsad JSON-status när kod och token stämmer |
| `admin/orders/[id]/route.ts` | Skyddade orderåtgärder, Checkout och återbetalning |
| `admin/menus/route.ts`, `admin/menus/[id]/route.ts` | Skapar/ändrar paket |
| `admin/items/route.ts`, `admin/items/[id]/route.ts` | Bevarat V2-API mot kompatibilitetsvyn för samma rättkatalog |
| `admin/catalog/route.ts` | Skapar, ändrar eller avpublicerar maträtter, kampanjer och zoner |
| `admin/settings/route.ts` | Sparar företagsinställningar |
| `admin/upload/route.ts` | Behörighetskontrollerad mediauppladdning |
| `admin/push/route.ts` | Registrerar ägarens befintliga Expo-pushtoken efter admininloggning |
| `stripe/webhook/route.ts` | Verifierar betalningshändelser från Stripe |
| `qr/[kind]/route.ts` | Beställnings-QR eller officiell Google-recensions-QR i SVG |
| `health/route.ts` | Enkel kontroll att servern svarar |

### Serverkod – `apps/web/src/lib/`

| Fil | Ansvar |
| --- | --- |
| `config.ts` | Varumärke, demo och grundkonfiguration |
| `data.ts` | Läser katalog/inställningar, filtrerar publika fält och bedömer om order är aktiverade |
| `supabase.ts` | Serverdatabas och cookiebaserad adminsession |
| `auth.ts` | Verifierad admin, origin/CORS för publika API:er och säkra fel |
| `tracking.ts` | Privata orderlänkar, HMAC, hash och tokenkontroll |
| `payments.ts` | Stripe-klient och Checkout efter ägarens godkännande |
| `checkout.ts` | Liten testbar regel för att återanvända öppen session och förnya endast utgången länk |
| `mailer.ts` | Order-, status- och recensionsmejl |
| `push.ts` | Frivillig push och leveranskvittokontroll för redan registrerade ägarenheter, med mejl som separat bas |
| `browser-upload.ts` | Adminformulärens gemensamma uppladdningsanrop |
| `domain.ts`, `validators.ts` | Tunna återexporter som behåller V2:s imports men använder shared |
| `../types/domain.ts` | Återexporterar gemensamma typer för V2:s befintliga komponenter |

### Komponenter, konfiguration och bilder

| Fil eller grupp | Ansvar |
| --- | --- |
| `src/components/OrderForm.tsx` | V2:s webbformulär för cateringpaket |
| `src/components/MenuCatalog.tsx`, `src/components/ItemPicker.tsx` | Bevarad V2-menykatalog, kategorier, portionshjälp och plus/minus |
| `src/components/HeroMedia.tsx` | Ljudlös video, paus, minskad rörelse och bildfallback |
| `src/components/LocalStructuredData.tsx` | Strukturerad företagsdata när indexering är aktiverad |
| `src/components/PwaRegister.tsx` | Registrerar webbens service worker |
| `src/components/{Brand,Header,Footer,Cta,MenuCard,SectionHeading}.tsx` | Små befintliga visuella webbdelar |
| `src/components/admin/AdminLogin.tsx` | Begär engångslänk för inloggning |
| `src/components/admin/{AdminNav,AdminOrders,AdminMenus,AdminSettings,AdminCatalog,AdminItems}.tsx` | Mobilvänliga adminvyer och bevarat V2-gränssnitt för maträtter |
| `public/images/`, `public/brand-mark.svg`, `public/icon-*.png` | Publika webb-/demobilder, logo och PWA-ikoner |
| `public/manifest.webmanifest`, `public/sw.js` | Befintlig PWA; service worker cachar publika bildresurser, inte order/admin/API |
| `.env.example` | Serverinställningar utan hemliga värden |
| `next.config.ts` | Next-konfiguration och säkerhetsheaders |
| `tsconfig.json`, `next-env.d.ts` | Webbens TypeScript- och Next-typer |
| `postcss.config.mjs`, `package.json` | Webbens CSS-verktyg, beroenden och start-/buildkommandon |

Databasmigrationerna förklaras i [DATABAS.md](DATABAS.md), kommandona i [EXPO.md](EXPO.md) och faktiska tester i [TESTER.md](TESTER.md). Konfiguration skrivs i källfilerna; genererade `.next`, `.expo`, `dist`, `android` och `ios` ska inte läsas som handskriven affärslogik.

V2:s ursprungliga filguide och acceptanskrav finns kvar i [FIL_FOR_FIL_V2.md](FIL_FOR_FIL_V2.md) och [V2_ACCEPTANS.md](V2_ACCEPTANS.md). De är historik och regressionsunderlag; V3-guiden ovan beskriver den gemensamma app-/webbstrukturen.
