# Fil för fil – V4.1

Börja med mobilen `app/index.tsx` → `lib/store.tsx` → `lib/api.ts` → webbens `api/orders/route.ts` → SQL. Då följer du kundens val hela vägen till databasen.

**Språk:** `.tsx` är TypeScript med React-vyer, `.ts` är TypeScript, `.sql` är PostgreSQL, `.mjs/.cjs/.js` är JavaScript och `.json/.yml` är konfiguration. Genererade `.next`, `.expo`, `dist`, `android`, `ios` och `node_modules` ska inte redigeras som handskriven affärskod.

Tabellerna nedan beskriver varför varje viktig fil finns, dess funktioner, kontakter och var du gör ändringar. Filändelsen visar språket enligt ovan.

## Mobil – `apps/mobile/`

Vi behåller sex skärmfiler och tre stödfiler. Fyra synliga bottenflikar håller navigationen enkel; beställning och kontakt öppnas från relevanta knappar.

| Fil | Ansvar och funktioner | Pratar med | Ändra själv |
| --- | --- | --- | --- |
| `app/_layout.tsx` | Router, flikar och CateringProvider | Alla skärmar, store/ui | Fliknamn och ikoner |
| `app/index.tsx` | Hero, tillfällen, populära rätter, datumstyrda kampanjer | store, ui, Router | Rubriker och startsidans ordning |
| `app/menyer.tsx` | Paket och kategoriserade styckrätter | store, ui | Kategorier och kortens presentation |
| `app/bygg.tsx` | Gästantal, rättmängder, portionsförslag och radtotaler | store, shared, ui | Presentation av summeringen; prisregler ändras i shared |
| `app/bestall.tsx` | Fyra steg, native datum/tid, kontakt, styckpriser/kontroll och beständig återförsöksnyckel | store, api, shared | Fälttexter och steg; servervalidering måste fortfarande gälla |
| `app/ordrar.tsx` | Privat status, godkänna förslag, öppna Checkout och aktivera push | api, store, shared | Statuspresentation och förklaringar |
| `app/kontakt.tsx` | Verklig kontakt, Maps, recensioner och sociala länkar | store, api, ui | Layout; företagets länkar ändras i admin |
| `lib/store.tsx` | Context, katalog, menyutkast, getQuote och orderreferenser | api, shared, alla skärmar | Hur val sparas eller uppdateras |
| `lib/api.ts` | HTTP med timeout, SecureStore, utkast, privat token, säkra externa länkar, native pushregistrering | API, Expo-moduler | API-adress i `.env.local`; behåll HTTPS/Stripe-kontrollerna |
| `lib/ui.tsx` | Screen med tangentbord/retry/fast summering, datumväljare, reglage och rättkort | Alla skärmar | Gemensamt utseende, avstånd och tillgänglighet |
| `app.config.ts` | Appnamn/version, ikon, plugins, EAS-projekt och miljöidentitet | Expo/EAS | Varumärke; byt inte projekt-id av misstag |
| `eas.json` | Android/iOS development-, simulator-, preview- och produktionsprofiler | EAS | Byggmiljö eller profil; inga hemliga värden |
| `package.json`, `tsconfig.json` | SDK57-beroenden, kommandon och typkontroll | npm, Expo, TypeScript | Installera native-paket med `expo install` |
| `.env.example`, `assets/` | Publik API-konfiguration och befintliga bildresurser | api, ui, app config | Kopiera env första gången; ersätt bilder med godkänt material |

## Gemensamt – `packages/shared/`

| Fil | Ansvar och funktioner | Pratar med | Ändra själv |
| --- | --- | --- | --- |
| `types/index.ts` | Katalog, order, betalstatus, prisförslag och API-typer | Mobil, webb, API | Lägg till ett fält och hantera det i båda gränssnitten |
| `pricing/index.ts` | Öresberäkning, formatSek, datum, zoner och canTransition | Alla gränssnitt, API, tester | Ändra en affärsregel här och testa gränsfallen |
| `validation/index.ts` | Zod-scheman för kund, admin och katalog | Formulär och API | Ändra fältgränser och motsvarande test |
| `index.ts` | Export av de tre ämnesfilerna | `@yehabibi/shared`-importer | Exportera bara sådant apparna behöver |
| `package.json` | Workspace-namn, version och Zod | Rotens npm workspaces | Håll beroendet i webb synkroniserat |

Shared får inte importera React, databas eller hemligheter. Samma funktion kan då köras i både mobil och server.

## Webb – `apps/web/`

Alla följande sökvägar utgår från `src/`.

| Fil eller befintlig grupp | Ansvar och funktioner | Pratar med | Ändra själv |
| --- | --- | --- | --- |
| `app/layout.tsx`, `app/globals.css` | Sidram, metadata och gemensam responsiv V4-design | Header, Footer, alla sidor | Färger/avstånd i CSS-variabler, sidmetadata i layout |
| `app/page.tsx` | Hero, tillfällen, populärt, kampanjer och beställningssteg | data, visuella komponenter | Startsidesordning och text |
| `app/menyer/page.tsx`, `app/bestall/page.tsx` | Läser serverkatalog och visar katalog/formulär | data, MenuCatalog, OrderForm | Sidrubriker; kundinteraktion i komponenterna |
| `components/MenuCatalog.tsx` | Paket eller egen meny, gästantal, summering | ItemPicker, menyutkast, shared | Katalogens kundflöde |
| `components/ItemPicker.tsx` | Kategorier, bilder, plus/minus och kökets portionsförslag | Catalog/Form, shared | Rättkort och reglage; priser från data |
| `components/OrderForm.tsx` | Fyra steg, validering, summering och API-submit | API, shared, menyutkast | Formulär och stegnavigation |
| `components/order-draft.ts` | Gemensamt sparande av menyval utan kundens kontaktuppgifter | Catalog, Form, webblagring | Utkastets format och återställning |
| `app/order/[code]/page.tsx` | Privat serverläst orderöversikt | data, tracking, OrderTracking | Sidram; inga kontaktuppgifter i publikt svar |
| `components/OrderTracking.tsx` | Statusförlopp och uttrycklig acceptans av prisförslag | Privat order-API | Kundens status och acceptansvyn |
| `app/global-error.tsx`, `app/loading.tsx` | Små laddnings-/felvyer med återförsök även vid fel i sidramens databasläsning | App-router | Begripliga texter; dölj tekniska fel för besökaren |
| `components/{Brand,Header,Footer,Cta,MenuCard,SectionHeading}.tsx` | Befintliga små återanvända vyer | Sidor, CSS | Logo, navigering, paketkort och rubriker |
| `components/HeroMedia.tsx` | Bild/video, paus och minskad rörelse | Home, inställningar | Mediapresentation; materialet väljs i admin |
| `components/LocalStructuredData.tsx`, `components/PwaRegister.tsx` | Riktig företags-JSON-LD och service worker | Layout, settings | Metadata/caching; privata API-anrop får inte cachas |
| `app/kontakt`, `om-oss`, `villkor`, `integritet` | Kontakt och juridiska sidor | data, settings | Faktiska företagsuppgifter och granskade villkor |
| `app/festcatering-vasteras`, `foretagscatering-vasteras` | Tillfällessidor | data, visuella komponenter | Relevant innehåll för verksamheten |
| `app/sitemap.ts`, `robots.ts` | Sökmotorernas publika adresser | config | Aktivera indexering först efter godkänd lansering |
| `app/admin/**/page.tsx` | Serverkontrollerad adminöversikt/katalog/order/inställningar | auth, data, admin-komponenter | Få tydliga adminvyer; återanvänd befintliga API:er |
| `components/admin/AdminOrders.tsx` | Filtrera, granska, godkänna, föreslå pris, kontanter och status | Admin order-API, shared | Åtgärdernas UI; regler gäller också på servern |
| `components/admin/{AdminLogin,AdminNav,AdminMenus,AdminItems,AdminCatalog,AdminSettings}.tsx` | Inloggning, paket, samma rättkatalog, zoner, kampanjer/media | Admin API, browser-upload | Fält och tydlighet; V2:s rättvy är kompatibilitet |

Om en komponent får ett annat filnamn vid vidareutveckling följer du importen från sidan. Det behövs ingen komponentfil per liten text eller knapp.

### API-rutter – `src/app/api/`

| Fil/grupp | Ansvar och funktioner | Pratar med | Ändra själv |
| --- | --- | --- | --- |
| `catalog/route.ts` | Publik aktiv katalog och faktiskt tillgängliga metoder | data, auth | Vilka säkra katalogfält som publiceras |
| `orders/route.ts` | Validera, prisberäkna, rate-limit och skapa en order atomärt | shared, DB-RPC, mailer/push | Inkommande orderflöde; bevara idempotensen |
| `orders/[code]/route.ts` | Privat status, acceptera rätt prisrevision och registrera kundpush | tracking, DB-RPC, push | Kundåtgärder; kod+token måste alltid kontrolleras |
| `admin/orders/[id]/route.ts` | Behörighet, status, prisförslag, Checkout och återbetalning | auth, payments, DB, notiser | Adminåtgärder med SQL-kontroll |
| `stripe/webhook/route.ts` | Verifiera och tillämpa en Stripe-händelse en gång | Stripe, DB-RPC, mailer/push | Nya händelser efter dokumentationskontroll och test |
| `admin/catalog`, `admin/items`, `admin/menus`, `admin/settings` | Skapa/ändra/avpublicera i samma katalog | auth, shared, DB | Adminfält; behåll gamla orderdata |
| `admin/upload`, `admin/push` | Kontrollerade mediafiler och ägarens pushtoken | auth, Storage/DB | Tillåtna filer eller tokenvalidering |
| `qr/[kind]/route.ts`, `health/route.ts` | Verkliga QR-länkar och serverhälsa | settings, config | Officiella mål/beredskapskontroller |

### Serverkod – `src/lib/`

| Fil | Ansvar och funktioner | Pratar med | Ändra själv |
| --- | --- | --- | --- |
| `config.ts` | Varumärke, grundvärden och stängd demo | data, sidor | Demotext; riktiga priser sparas i databasen |
| `data.ts` | Databasläsning, säker publik projektion och tjänstens beredskap | supabase, shared | Gemensamma serverfrågor och publicerade fält |
| `supabase.ts` | Serverklient och sessionsklient | Supabase, auth | Anslutning/cookies; exponera inte servernycklar |
| `auth.ts` | Verifierad admin, origin och CORS | API, Supabase Auth | Allowlist via servermiljö; inga publika wildcard |
| `tracking.ts` | HMAC, tokenhash, jämförelse och privat länk | Order-API, mailer | Behörighetsnycklar kräver extra granskning |
| `payments.ts`, `checkout.ts` | Stripe efter godkännande och återanvändning av session | Stripe, admin-API | Betalregler och retries med test |
| `mailer.ts`, `push.ts` | Leverera köade snapshot-besked och kvittera mottagare; kund-/ägarpush | Resend, Expo, DB | Meddelandetext och tjänstekonfiguration; behåll idempotens |
| `browser-upload.ts` | Återanvänt adminuppladdningsanrop | Admin, upload-API | Klientens filvalidering |
| `domain.ts`, `validators.ts`, `../types/domain.ts` | Tunna kompatibilitetsexporter av shared | Gammal V2-kod | Lägg ny affärslogik i shared, inte här |

## Databas, tester och konfiguration

| Fil/grupp | Varför/språk och funktioner | Pratar med | Ändra själv |
| --- | --- | --- | --- |
| `supabase/migrations/*.sql` | SQL i filnamnsordning; tabeller, priser, lås, RPC och RLS | Serverns Supabase-klient | Skapa en ny additiv migration, ändra inte körd historik |
| `tests/*.test.mjs` | Node-tester för priser, validering, Checkout och riktiga SQL-transaktioner i PGlite | Shared, testbar serverlogik, migrationer | Lägg till beteendet och relevanta gränsfall |
| `tests/integration.mjs` | Separat riktigt PostgreSQL/PostgREST/Next-HTTP-test; endast Auth/Stripe/Resend har lokal testtransport | Installerade PG/PostgREST-verktyg, produktionsrutter | Kör enligt TESTER.md; ingen testbypass finns i produktionskoden |
| `scripts/check-source.cjs` | JavaScript som syntaxkontrollerar TypeScript | Källmappar, TypeScript | Utöka bara om nya källmappar tillkommer |
| `package.json`, `package-lock.json` | Workspaces, kommandon och låsta versioner | npm, CI, apparna | Ändra paketfil, låt npm uppdatera låsfil |
| `.github/workflows/check.yml` | YAML för CI-installation/test/bygge/export | GitHub Actions | Samma kontroller som lokalt |
| `apps/web/next.config.ts` | Säkra headers och monorepo-sökvägar | Next.js | Nödvändiga ramverksinställningar |
| `apps/web/.env.example` | Konfigurationsnamn utan nycklar | Servermiljön | Kopiera första gången; committa aldrig `.env.local` |
| `apps/web/public/` | Godkända befintliga bilder, SVG-logo och PWA | Webbläsaren | Byt material utan att bryta använda URL:er |

Fler instruktioner: [ARKITEKTUR](ARKITEKTUR.md), [DATABAS](DATABAS.md), [BETALNINGAR](BETALNINGAR.md), [EXPO](EXPO.md) och [TESTER](TESTER.md). V2-dokumenten är historiskt regressionsunderlag.
