# Tester och verifiering – V4.3

Lokala slutkontroller körda 2026-10-17. [Betalningsguiden](PAYMENTS_WITHOUT_STRIPE_V4_3.md) skiljer lokal integration, simulerad leverantör, riktig sandbox och fysisk enhet. Ingen Adyen-sandboxtransaktion eller livebetalning har verifierats här.

| Kontroll | Verifierat under V4.3-arbetet |
| --- | --- |
| Anpassade historiska/delade enhetstester | 40/40 godkända i `domain.test.mjs`, `v3.test.mjs`, `v4.test.mjs`, `unified-domain.test.mjs`, inklusive sju historiska SQL-underfall. V4/V4.1-SQL kör avsiktligt till den historiska migrationsgränsen; nya fullkedjeregler ligger i betalningssviten. |
| Ren installation | `npm ci --no-audit --no-fund` godkänd; projektets gamla Next-/Expo-processer stoppades för att frigöra Windows-fillås. Stripe-SDK saknas i den nya beroendekedjan. |
| Syntax, typer och tester | `npm run verify` godkänd: syntax, typkontroll för alla konsumenter och **84/84 tester** inklusive 22 provider-/SQL-fall. |
| Next.js och Expo | Produktionsbygge godkänt; iOS/Android Hermes och åtta Expo-webbrutter exporterade med bibehållen SDK 57. Export är inget signerat nativebygge. |
| Produktions-HTTP/SEO | `npm run test:web` godkänd: nio publika sidor, metadata/canonical, elva SSR-rätter, avstängda order/adminskydd och robots/sitemap. |
| Riktig lokal HTTP/databas | `npm run test:integration` godkänd med PostgreSQL 18.3/PostgREST och Next: **11 syntetiska order, 64 idempotenta testmejl**. Alla fyra onlinebetalningsmetoder använder uttryckligen simulerad leverantör. |
| GitHub/CI, merge, Sites och EAS | Slutligt SHA, PR-/main-CI och externa publicerings-/byggresultat ska kontrolleras i den länkade slutleveransen. Dessa externa steg räknas inte som verifierade av de lokala testerna. |
| Riktig Adyen-sandbox, Swish, Apple Pay, Google Pay, kort/3D Secure | Inte verifierat med företagets konto. Lokala signerade svar och provider-HTTP-dubbel är simuleringar. |
| Fysiska iPhone-/Android-prov | Återstår för aktuell V4.3. Export/EAS-jobb är inte en betalningskontroll. |
| Externa tjänster | Företagets Supabase Auth/Storage, Resend-leverans och APNs/FCM kräver egna verifieringar. |

Historiska Stripe-purehelpers har avvecklats. Deras beteende ersätts av provideroberoende försök-/HMAC-/återbetalningstester; gamla order- och migrationsassertions bevaras. Ingen produktionsdatabas, kundbetalning eller oidentifierat konto används.

HTTP-sviten verifierar ägargranskning utan automatisk extern session, uttrycklig prisacceptans, kundens senare metodval, parallell initiering med samma session, privat token och förbjudna klientbelopp, exakt SEK/revision, nekad betalning och återupptagning, signerade dubbletter, asynkron full återbetalning, spärrad leverans under återbetalning, kontantmottagarens adminreferens och uttrycklig inställning för obetalda förfrågningar. Avstängning av nya betalningar blockerar nya sessioner men tillåter fortfarande verifierade tidigare webhooks. Databassviten täcker även externa/delvisa återbetalningar och chargebacks som kräver avstämning, återförda medel, rollback och bevarade historiska Stripe-referenser.

Produktionskonfigurationen provas endast med injicerade simulerade HTTP-svar: uttrycklig separat live-spärr, låst officiellt Adyen-ursprung, exakt europeisk hostad adress och miljöbindning före status-/refundanrop samt före callback-deduplikering. En sandboxorder kan inte bli en livebetalning genom att miljövariabler byts. Inga riktiga live-endpoints, företagskonton eller produktionsnycklar används i testerna.

---

> Historisk verifiering nedan beskriver dåvarande versioner. Stripe nämns som historisk testtransport och är inte aktiv betalningslösning i V4.3.

# Tester och verifiering – V4.2

Verifierat 2026-10-17. Kodcommit för granskningen: [0b60953563f0e6e40879d1fc91e6453f1068c4b8](https://github.com/sharbel0022/YEHABIBI/commit/0b60953563f0e6e40879d1fc91e6453f1068c4b8). V4.1:s utgångsläge finns i [V4_1_NULAGE.md](V4_1_NULAGE.md). Äldre resultat nedan är historik och räknas inte som nya enhetstester.

| Kontroll | Faktiskt V4.2-resultat |
| --- | --- |
| npm ci | Godkänd. Första försöket blockerades av en gammal Next-process som låste SWC på Windows; servern och Expo stoppades före ren installation. npm 11.4.2 varnade om lockfilens metadata, men installation och npm ls lyckades utan saknade beroenden. |
| npm run syntax | Godkänd |
| npm test | 59/59 godkända; 36 tidigare och 23 nya testfall, inklusive nästlade SQL-fall |
| npm run typecheck | Godkänd för Expo, Next.js och API-klienten; shared kontrolleras genom alla konsumenterna |
| npm run build | Godkänd med Next.js 16.4.2 webpack; publika katalog-/företagssidor serverrenderas med aktuella data |
| npm run export:mobile | Android och iOS Hermes samt webbens åtta routes godkända |
| npm run test:web | Godkänd mot produktionsbygget: nio publika sidor, metadata/canonical, 11 serverrenderade rätter, demo/spärrar, admin401, robots och sitemap. Körs också i CI. |
| npm run test:integration | Godkänd med PostgreSQL 18.3, PostgREST 16.4 och riktiga Next.js-routes: 6 syntetiska order och 30 idempotenta testmejl |
| Browserkontroll | Chrome mot lokal produktionsserver: menykategorier, gästantal 8, manuell kataloguppdatering och navigation till order bevarade utkastet. Fyra ordersteg visades, inga konsolfel eller varningar. En viewportkontroll fann ingen horisontell overflow. |
| Fysiska enheter/EAS | Inga nya fysiska iPhone-/Android-prov eller EAS-nativebyggen har verifierats för V4.2. Export är ett byggtest. |

De nya API-testerna provar samma request-format, katalogprisändring, nätverksfel, timeout inklusive svarsläsning, avbrott, HTTP-fel, felaktiga svar och HTTPS-regler. Domäntesterna provar gemensam demo, styck-/paketpris, portioner, leverans, minimum, orderformat, utkast, kundacceptans och statusflöde. Portionsregressionen 100 × 0,07 ger nu 7 i båda gränssnitten.

Det riktiga HTTP/databastestet gör skyddade adminändringar av pris, bild, zon och kontakt; båda klienternas katalogsvar blir samma. Båda plattformarnas order syns i samma admin. Avpublicering blockerar nya rader men ändrar aldrig äldre priser eller återförsökskvitton. Parallella återförsök, transaktionsrollback, RLS, privata tokens, kundacceptans och signerade dubblettwebhooks verifieras. Signerade händelser med fel belopp, valuta eller session avvisas; en completed-session som fortfarande är obetald bekräftar ingen betalning.

Testtransporter ersätter Supabase Auth, Stripe och Resend. Testmejl är fångade HTTP-svar, inte bekräftad leverans till externa mottagare. Företagets Supabase Auth/Storage, Stripe sandbox/Swish/Apple Pay, Resend samt APNs/FCM återstår att verifiera med företagets egna tjänster. Inga produktionsmigrationer eller livebetalningar har körts.

Kör från roten enligt README. På Windows kan Hermes behöva en skrivbar temporär katalog:

```powershell
New-Item -ItemType Directory -Force .tmp/verify-temp | Out-Null
$env:TEMP = (Resolve-Path .tmp/verify-temp).Path
$env:TMP = $env:TEMP
npm run export:mobile
```

---

# Historik: verifiering av V4.1

## Aktuell V4.1-verifiering, 2026-10-17

V4-resultaten längre ned är historik. V4.1 testas med verklig lokal PostgreSQL **18.3**, officiell PostgREST **16.4** och de riktiga Next.js-API-rutterna. Endast Supabase Auth, Stripe och Resend har isolerade HTTP-testtransporter; inga externa konton eller mejlmottagare används. Testdata är syntetiska och ligger i ett separat nytt kluster under ignorerade `.tmp`.

Kör från roten:

```powershell
npm ci
npm run syntax
npm run test
npm run typecheck
npm run build
npm run export:mobile
npm run test:integration
```

Integrationen kräver PostgreSQLs `initdb`, `pg_ctl`, `psql` och PostgREST. Windows använder som standard `C:/Program Files/PostgreSQL/18/bin` och `.tmp/v41-tools/postgrest.exe`; sätt `PG_BIN`/`POSTGREST_BIN` om verktygen finns någon annanstans. Hämta PostgREST från [officiella version 16.4](https://github.com/PostgREST/postgrest/releases/tag/v16.4). Testet väljer lediga loopbackportar, initierar eget PGDATA och stänger sina processer efteråt. Kör inte samtidigt med en annan Next-utvecklingsserver i samma checkout. `--keep` är bara för separat lokal klient-QA, och avslutas med Ctrl+C. Inga riktiga projekt återställs eller migreras.

GitHub Actions installerar PostgREST 16.4 med verifierad SHA-256 och kör samma integration mot runnerns PostgreSQL efter de vanliga kontrollerna. Testtransporten injiceras bara i testets barnprocess; produktions-API:t har ingen testinloggning eller flagga som hoppar över behörighet.

| V4.1-kontroll | Faktiskt verifierat |
| --- | --- |
| Ren installation | `npm ci` lyckades efter att gamla projektservrars Windows-fillås släppts |
| Full lokal slutkontroll | `npm run verify` PASS efter sista kodrättningen: syntax, båda typerna, 36 tester, Next-produktionsbygge och Expo Android/iOS/webb-export |
| Expo-konfiguration | `expo install --check` och Expo Doctor 21/21 PASS; SDK57 och befintlig projektidentitet bevarade |
| Affärsregler/SQL | 36 tester godkända: pengar, datum, zoner, originalpriser, återförsök, offertacceptans, webhook och RLS; även specifikationens fiktiva fempersonersexempel |
| Riktig lokal integration | Samtidiga HTTP-inskick ger en order; order/rader/notiskö rullas tillbaka tillsammans vid fel; administratörsbehörighet, privata tokens och otillåten direktläsning kontrolleras |
| Order-/betalflöde lokalt | Ren slutkörning: fyra syntetiska order och 26 idempotenta testmejl. Förslag/samtidig acceptans, paketoriginalpriser, signerade parallella webhookar, utgången session/nytt försök, återbetalning, statusar och kontanter passerade med providerersättningar. Efter omstart med PAYMENTS_ENABLED=false blockeras nya sessioner medan redan utfärdad signerad betalning fortfarande avstäms |
| Notiser lokalt | Ägarens adress/rader/kontakt, misslyckat mejl med kvarvarande order, per-mottagare-återförsök och ersatta betalningsbesked kontrolleras |
| Mobil | SDK57-typkontroll och Android/iOS/webb-export godkända. Riktig Expo Go på Android verifierade Alla-rätter-start, fast summa, native kalender/24h-klocka och inskick till samma riktiga lokala PostgreSQL-API |
| Webbläsar-E2E lokalt | Inte verifierad. Browserns originbehörighet avvisades; ingen annan browser/adress användes som omväg |
| Supabase security advisors lokalt | Inga ERROR; en WARN gäller V1:s `pgcrypto` i public. Ingen automatisk flytt av historisk extension |
| Externa tjänster | Supabase Auth/Storage, Stripe-testkonto/Swish/Apple Pay, verklig Resend-leverans och APNs/FCM är inte verifierade |

Webbens produktionsberoenden ger **0** npm-auditfynd. Hela monorepon ger **30** (19 high, 11 moderate), främst SDK57:s Expo/Metro-verktyg och transitiva paket. [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) och [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) saknar publicerad rättning enligt de aktuella advisories. Ingen SDK-nedgradering eller `audit fix --force` används; detta kvarstår som ett dokumenterat beroendeproblem och får inte beskrivas som en ren säkerhetsaudit.

Fysiska iPhone-prov och nya EAS-nativebyggen för V4.1 får inte antas från V4-byggena. Publik aktivering förblir spärrad. Användarens beslut är lokal testdatabas och att inte använda de tillgängliga oidentifierade Supabase-/Stripe-kontona. Se [PUBLICERING.md](PUBLICERING.md) för vad företaget behöver konfigurera.

Det konkreta Android-provet skapade `CM-A2DF85D399`: sex gäster, hämtning, kontant och datum 2026-10-19 kl. 17:00. PostgreSQL bekräftade exakt en order och två rader: 12 × 25 kr + 2 × 90 kr = 480 kr, alltså 80 kr/person. Appen visade kvitto med ordernummer och privat status Mottagen/Obetald. Detta är syntetiska testpriser, inte företagets produkter. Processens aktiva paket kontrollerades som `host.exp.exponent`, så den äldre installerade V4-devappen kunde inte misstas för V4.1. Den första Metro-starten föll på en multiparttransport; efter rätt Expo Go-öppning och verifierat aktivt paket kördes V4.1-flödet.

Efter Android-provet fick KeyboardAvoidingView en enradig `height`-anpassning för Androids kant-till-kant-läge. Den ingår i slutlig typkontroll/bygge/export men är inte visuellt omtestad. Alla separata testservrar och PostgreSQL-kluster stoppades efter provet. Första CI-körningen klarade vanliga kontroller men stoppade vid Linux pg_ctl-start; integrationsharness har därefter fått explicit TCP utan Unix-socket samt synlig databasdiagnostik vid fel. Ny CI måste vara grön före merge och kontrolleras på main efteråt.

## Historisk verifiering av V4

Resultaten avser V4-källan. Tidigare V3-byggen bevisar inte att nya native-moduler fungerar. V3-historiken finns i Git-historiken för detta dokument, bland annat commit 6575987.

## Kör lokalt från roten

```powershell
npm install
npm run syntax
npm run lint
npm run typecheck
npm test
npm run build
npm run export:mobile
```

`npm run verify` kör syntax, typer, tester, Next-produktionsbygge och Expo-export. Lint är projektets syntaxkontroll; det är inte en separat ESLint-installation. TypeScript är en egen kontroll.

## Automatiska kontroller

| Kontroll | Faktiskt resultat |
| --- | --- |
| Syntax/lint | Syntax godkänd för TS/TSX; lint använder samma kontroll |
| TypeScript | Mobil och webb godkända |
| Enhets-/integrationstester | 32 av 32 godkända; Node test runner |
| SQL | Hela migrationskedjan körd i PGlite med Supabase-roller/scheman ersatta lokalt |
| Expo SDK 57-export | Slutlig V4: Android/iOS med Hermes och webb med 8 statiska routes godkända |
| Expo beroenden/Doctor | `expo install --check` godkänd; Doctor 21/21 godkända |
| Webbbygge | Slutligt standardkommando bygger alla routes med Next.js 16.4.2 webpack |
| `npm run verify` | Hela körningen godkänd efter sista funktionella ändringarna |
| GitHub CI | [393cb2c](https://github.com/sharbel0022/YEHABIBI/actions/runs/39040468409) och [sammanslagen main](https://github.com/sharbel0022/YEHABIBI/actions/runs/39040722174) SUCCESS, inklusive ren `npm ci` |
| Android EAS | [V4 APK-jobb](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/121fab5f-cb08-46eb-a03e-5e13f8c4aecb) FINISHED 2026-10-17 kl. 14:32:24 UTC. SDK 57, app 4.0.0, källa `65941bb`. Installation och runtimekontroller redovisas separat nedan |
| iOS EAS | [V4 simulatorjobb](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/10bef8cf-119c-44b7-ad22-57483478318a) FINISHED 2026-10-17 kl. 14:26:25 UTC; [artefakt](https://expo.dev/artifacts/eas/s_f_YK7AzGKZTrPLuA7ZPxTw9tKwgbesQ4Vl3Extpiw.tar.gz). SDK 57, app 4.0.0, källa `65941bb`. Ingen Mac-simulatorkörning verifierad |
| Sites | Version 4 publicerad med lyckat Worker-bygge, typer och 32 tester; [öppna](https://yehabibi.asdasdsa213.chatgpt.site) |

Tester omfattar öresberäkning/radsummor/personpris, ogiltiga mängder, gästminimum, datumfönster, hämtning/zoner, dolda rätter, återförsöksnyckel och ändrat innehåll, offertrevisioner, gamla prisrader, kundacceptans, nekad Checkout före acceptans, kontanter, signerade händelsers databasregler, dubbletter, sen misslyckad betalning efter betald och RLS/indragna funktionsrättigheter.

En oberoende kodgranskning hittade och rättade återförsök efter terminalt misslyckad Stripe-session, oönskade Checkout-metoder, totalsummering efter prisjustering, lagringsfel för återförsöksnyckel och gamla avpublicerade rättval. Den ersätter inte tester mot riktiga leverantörer.

## Manuella kontroller

Webbens startsida granskades visuellt. En tillfällig lokal vy använde syntetiska priser och stängd submit: 8 gäster → portionsförslag 16 → plus 17 → minus 16; 16 × 25 kr = 400 kr och 50 kr/person. 4 gäster blockerades vid minimum 5. Navigation via hem bevarade 8 gäster/16 rätter och överförde dem till beställningen. Postnummer 11111 avvisades; 72212 gav 50 kr leverans, totalt 450 kr och 56,25 kr/person. Alla fyra steg nåddes med testkontakt och datum 2026-11-15. Kontanter doldes för leverans. Ett prisförslag 500 → 600 kr krävde kryssat godkännande. Ingen order skickades, inga betalningar gjordes och konsolens varnings-/fellogg var tom. Testvyn togs bort före commit och är inte del av bygget.

Androids Expo Go kör V4 med SDK 57. Alla sex vyer öppnades: hem, katalog, menybyggare, beställning, privata ordrar och kontakt. Snabbval 6 gäster och minskning till 5 fungerade; minus spärrades vid minimum 5 och valet fanns kvar efter appomstart. Beställningsvyn visar fyra steg och blockerar tom/oprissatt meny. Privat orderlista visar tomt läge. Inga ReactNativeJS/AndroidRuntime-fel syntes i kontrollerad logcat. Demopriser förblir okända och kan inte användas för förfrågan.

V4:s nya EAS-APK hämtades, 252 770 173 byte, och `adb install -r` gav **Success**. Paketet `se.cedarmezze.app.dev` visar version 4.0.0. Den egna development-klienten öppnades mot Metro och lokal API-server; startsida, meny och privat tom orderlista granskades visuellt. Inga fatala AndroidRuntime- eller ReactNativeJS-fel hittades. En icke-kraschande ReactNoCrashSoftException vid fönsterfokus samt emulator/systemvarningar noterades; appen fortsatte fungera. Detta är ett native-bygge med JavaScript hämtat från Metro, inte en verifierad fristående butiksinstallation. APK-filens SHA256: `76b887cd041b12df0d30a70db1536b00769171f938a9191cf5075b8c1b7bb830`.

Publicerad Sites: startsida och kategori/gästreglage fungerar i webbläsaren, katalog och health svarar 200, demo har 11 rätter och stängda beställningar. POST orders ger 503, tillåten CORS-preflight 204 med PATCH och otillåten origin 403. Native iPhone-manifest på LAN svarar 200 med SDK 57.0.0, app 4.0.0 och rätt EAS-projekt. Lokal API-server har startats om till V4 på port 3000 och Expo Go körs på LAN-port 8081.

Vid slutlig överlämning fastnade den egna Android-klienten efter byte till Expo Go-servern 8081. Separat Metro `--dev-client` på 8082 med API `http://10.0.2.2:3000` löste det. Startsidan och `Running main` verifierades igen utan JS-/fatalfel. API 3000, iPhones Expo Go 8081 och Androids development-session 8082 lämnades igång. Stegen finns i [EXPO.md](EXPO.md).

Turbopack misslyckades lokalt i en Windows-underprocess för CSS, utan källdiagnostik. Det dokumenterade `next build --webpack` valdes som stabilt standardkommando och passerade lokalt och i CI. Hermes behövde en skrivbar temporär mapp under den ignorerade `.tmp` i lokal export; omkörning och hela verify passerade. Ingen kodkontroll stängdes av.

## Verifieringsgränser före lansering

Företagets Supabase, Stripe, Resend och FCM/APNs är inte anslutna i demonstrationen. Därför har ingen verklig kundorder, kortbetalning, Swish, Apple Pay, levererad e-post eller push bekräftats. Inga fjärrmigrationer eller skarpa betalningar aktiveras av publiceringen. Supabase-advisors behöver köras i den verkliga testmiljön; lokala SQL-tester ersätter inte detta.

Betalningskö och återförsök testas lokalt. Push tar ett enda sändningsansvar för att undvika dubbletter; en processkrasch efter anspråket kan innebära utebliven push. E-post är reservvägen. Övriga misslyckade statusmejl kan administratören skicka igen; det finns ingen separat bakgrundskö för dessa i V4.

Fysisk iPhone-start bekräftades av användaren för V3/SDK 57. V4 får inte räknas som fysiskt iPhone-testad utan nytt prov. Windows kan starta EAS iOS-build men kan inte köra iOS Simulator. Butiksbehörigheter, riktig företagstext, godkända priser/allergener och leverantörernas testflöden återstår innan lansering.
