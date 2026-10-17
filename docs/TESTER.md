# Tester och verifiering – V4

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
