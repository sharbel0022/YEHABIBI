# Fil för fil – V4.3

Följ en förfrågan från `OrderForm.tsx` eller `bestall.tsx` → `packages/shared/ordering` → `packages/api-client` → `api/orders/route.ts` → SQL-funktionen `create_catering_order`. Det är samma kontrakt på webb och mobil.

`.tsx` är TypeScript med React-vyer, `.ts` är TypeScript, `.sql` är PostgreSQL och `.mjs/.cjs` är JavaScript. Genererade `node_modules`, `.next`, `.expo`, `dist`, `android` och `ios` ska inte redigeras som affärskod.

## Gemensam kod

| Fil | Varför den finns och var du ändrar |
| --- | --- |
| `packages/shared/types/index.ts` | Gemensamma katalog-, order-, matvals- och svarstyper. Lägg till ett fält här och hantera det i server och berörda vyer. |
| `packages/shared/pricing/index.ts` | Heltalsöre, paket/styckpriser, leveranszoner, datum, statusövergångar och svenska kronor. Ändra gemensamma pris- och statusregler här. |
| `packages/shared/ordering/index.ts` | `quoteSelection`, `suggestedQuantity`, `buildOrderPayload`, minimiantal, betalval, formulärfel, utkast och kundens orderförlopp. Här ska webb och mobil få samma beteende. |
| `packages/shared/validation/index.ts` | Zod-scheman för kund, admin och katalog. Servern validerar även när ett gränssnitt kringgås. |
| `packages/shared/limits.ts` | En källa för gästantal, antal olika rätter, mängder och högsta totalbelopp. |
| `packages/shared/design/index.ts` | `designColors`, `categoryLabels` och `orderSteps`. Delade värden, inga React-komponenter. |
| `packages/shared/catalog/index.ts` | `previewCatalog`, paket, rätter och grundinställningar för avstängd förhandsvisning. Riktiga produkter/priser kommer från databasen. |
| `packages/shared/index.ts` | Paketets publika exporter. Inga databasnycklar, React- eller Expo-beroenden. |
| `packages/api-client/index.ts` | `createApiClient`, typade katalog-/orderanrop, URL-kodning, timeout och `ApiError`. Ny publik HTTP-hantering placeras här. |
| `packages/api-client/tsconfig.json` | Kontrollerar klienten självständigt utan Next.js eller Expo. |
| `packages/*/package.json` | Workspaces och beroenden. Installera och uppdatera låsfil från roten. |

`getMenu` och `getSettings` i API-klienten läser ur `/api/catalog`; de inför inga parallella rutter. `getOrderStatus` returnerar serverns `PublicOrder`, inklusive eventuell godkänd Checkout-länk. Prisacceptans och pushregistrering använder befintlig PATCH på samma orderresurs.

## Mobil – `apps/mobile/`

Sex kundskärmar, en layout och tre stödfiler behåller Expo som native frontend.

| Fil | Ansvar |
| --- | --- |
| `app/_layout.tsx` | Navigation, flikar och `CateringProvider`. |
| `app/index.tsx` | Startsida, tillfällen, favoriter, kampanjer och cateringpaket. |
| `app/menyer.tsx`, `app/bygg.tsx` | Kategorier, matval, gäster och löpande summering med delade regler. |
| `app/bestall.tsx` | Formulärsteg, native datum/tid, kontakt, granskning och submit genom API-klienten. |
| `app/ordrar.tsx` | Privata order, delat statusförlopp, prisacceptans, Checkout och pushknapp. |
| `app/kontakt.tsx` | Företagets verkliga kontaktuppgifter och externa länkar. |
| `lib/store.tsx` | React Context, matval, kataloghämtning vid start/återkomst/refresh och lagringskoppling. `getQuote` återexporterar shared. |
| `lib/api.ts` | Mobilens API-basadress, SecureStore/webblagring, beständig återförsöksnyckel och native länk/pushfunktioner. HTTP-regler ligger i API-paketet. |
| `lib/ui.tsx` | Återanvända native vyer: `Screen`, `Button`, `Field`, `DateTimeField`, `MenuCard`, `DishCard`, `Stepper` och `Amount`. Färger och portionsregler hämtas från shared. |
| `app.config.ts`, `eas.json` | Befintlig Expo-identitet, plugins och EAS-profiler. Välj API-miljö separat; ändra inte projekt-ID av misstag. |
| `.env.example`, `assets/` | Publik API-konfiguration och befintliga bilder. Hemligheter hör inte hit. |

Native navigation, tangentbord, datumväljare, enhetslagring och pushbehörighet stannar i mobilen. Samma `DishCard` och `Stepper` används på flera mobilskärmar.

## Webb – `apps/web/src/`

| Fil eller grupp | Ansvar |
| --- | --- |
| `app/layout.tsx`, `app/globals.css` | Dynamisk serverrenderad sidram, metadata och responsiv V4-design. Sidramen sätter CSS-variabler från `designColors`. |
| `app/page.tsx`, `app/menyer/page.tsx`, `app/bestall/page.tsx` | Serverrenderat publikt innehåll. Serverkatalogen kommer direkt från `lib/data.ts`. |
| `components/use-catalog.ts` | Uppdaterar katalog när fliken åter blir aktiv/synlig, anslutningen återkommer eller kunden uppdaterar manuellt. |
| `components/CatalogRefresh.tsx` | Gemensam uppdateringsknapp och katalogfel för webbens kundvyer. |
| `components/MenuCatalog.tsx` | Paket/egen meny, gäster och summering. Återanvänder `ItemPicker` och shared-regler. |
| `components/ItemPicker.tsx` | Återanvända rättkort, kategorier och antalsreglage i katalog och orderformulär. |
| `components/OrderForm.tsx` | Fyrstegsformulär, delad validering, granskning och `api.createOrder`. |
| `components/order-draft.ts` | Webbens URL-/lagringsadapter för matval och beständig återförsöksnyckel. Kontaktuppgifter sparas inte. |
| `components/OrderTracking.tsx` | Kundens delade statusförlopp och uttryckliga acceptans av rätt prisrevision. |
| `app/order/[code]/page.tsx` | Privat serverläst orderöversikt som kräver rätt kod/token. |
| `components/{Brand,Header,Footer,Cta,MenuCard,SectionHeading,HeroMedia}.tsx` | Befintliga små återanvända webbkomponenter. |
| `components/{LocalStructuredData,PwaRegister}.tsx` | Företagets strukturerade data och PWA. Privata API-anrop ska inte cachas. |
| `app/{kontakt,om-oss,villkor,integritet}` | Företagsinformation och juridiska sidor. |
| `app/{festcatering-vasteras,foretagscatering-vasteras}`, `app/{sitemap,robots}.ts` | Lokala landningssidor och sökmotorernas publika adresser. |
| `app/admin/**`, `components/admin/**` | En responsiv, serverkontrollerad adminpanel för båda kundplattformarna. |
| `app/{global-error,loading}.tsx` | Begripliga laddnings-/felvyer även vid serverfel. |

### API och server – `apps/web/src/`

| Fil eller grupp | Ansvar |
| --- | --- |
| `app/api/catalog/route.ts` | Säker publik katalog för samtliga plattformar. |
| `app/api/orders/route.ts` | Validering, rate-limit, serverpriser och atomär orderskapning. |
| `app/api/orders/[code]/route.ts` | Privat status, prisacceptans och kundpush. |
| `app/api/admin/orders/[id]/route.ts` | Skyddade ägaråtgärder, prisförslag, Checkout, kontanter och återbetalning. |
| `app/api/admin/{catalog,items,menus,settings}` | Ändra/avpublicera i samma katalog. `items` bevarar V2-kompatibilitet. |
| `app/api/admin/{upload,push}` | Kontrollerade mediafiler och ägarens notisregistrering. |
| `app/api/payments/{create,status,webhook}/route.ts` | Generisk betalningsinitiering, privat status och HMAC-verifierad avstämning. |
| `app/api/health/route.ts`, `app/api/qr/[kind]/route.ts` | Beredskapskontroller och företagets riktiga QR-länkar. |
| `lib/api-client.ts` | Webbens same-origin-instans av `createApiClient`. |
| `lib/data.ts` | Gemensamma databasläsningar och uttryckligt begränsade publika svar. |
| `lib/config.ts` | Serverkonfiguration och återexport av delad förhandsvisning. |
| `lib/supabase.ts`, `lib/auth.ts` | Serverklient, cookies, verifierad admin, origin och CORS. |
| `lib/tracking.ts` | Privat ordertoken, HMAC och säker jämförelse. |
| `lib/payments.ts`, `lib/payments/{provider,service}.ts`, `lib/payments/providers/adyen.ts` | Orderkoppling, providerkontrakt, beständiga försök och avstängd Adyen-adapter med separat produktionsspärr. Gamla `checkout.ts` är avvecklad. |
| `lib/mailer.ts`, `lib/push.ts` | Köade besked och separat leveranskvittens till kund/ägare. |
| `lib/browser-upload.ts` | Återanvänt uppladdningsanrop i admin. |
| `lib/domain.ts`, `lib/validators.ts`, `types/domain.ts` | Tunna kompatibilitetsexporter av shared. Lägg ny gemensam logik i paketet. |

## Databas, tester och drift

| Fil/grupp | Varför den finns |
| --- | --- |
| `supabase/migrations/*.sql` | Historik för tabeller, transaktioner, lås och RLS samt additiv V4.3-migration med generiska betalningsförsök, händelser och refunds. |
| `tests/unified-domain.test.mjs`, `tests/api-client.test.mjs` | Gemensamma regler, båda plattformarnas kontrakt, uppdaterade priser och nätverksfel. |
| `tests/domain.test.mjs`, `tests/v2.test.mjs`, `tests/v3.test.mjs`, `tests/v4.test.mjs` | Regressionsskydd för priser och validering samt historiska SQL-kontrakt. Nya provider-/SQL-regler provas i `payments.test.mjs` och `payment-db.test.mjs`. |
| `tests/integration.mjs` | Isolerat PostgreSQL/PostgREST/Next-HTTP-flöde; se TESTER.md för verktyg och verkliga resultat. |
| `scripts/check-source.cjs` | Syntaxkontroll för appar och paket. |
| `scripts/sync-sites.mjs` | Kopierar granskad main-källa till ett öppnat befintligt Sites-projekt och bevarar dess bygglager. Publicerar inte i sig. |
| `package.json`, `package-lock.json` | Workspaces, kommandon och låsta versioner. |
| `.github/workflows/check.yml` | CI-kontroller; se TESTER.md för aktuell körning. |
| `apps/web/next.config.ts` | Pakettranspilering, monorepo-sökvägar och säkerhetsheaders. |
| `apps/web/.env.example`, `apps/web/public/` | Konfigurationsnamn utan hemligheter och befintliga publika resurser. |

Det finns inget `packages/ui`. Domänregler och designvärden delas; plattformarnas befintliga små komponenter fortsätter återanvändas där de passar.
