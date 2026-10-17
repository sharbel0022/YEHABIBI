# Tester och verifieringsstatus

Kör alla kommandon från repots rot. En godkänd build visar att kod kan byggas; den bekräftar inte externa konton, betalningar eller fysisk enhet.

```powershell
npm install
npm run syntax
npm run typecheck
npm test
npm run build
npm run export:mobile
```

`npm run verify` kör samma kodkontroller i följd efter installation. `npm run lint` använder syntaxkontrollen. Syntaxkontroll ersätter inte TypeScript-kontroll. Använd inte `--force` eller `--legacy-peer-deps` om installationen hittar versionskonflikter.

## Aktuell SDK 57-verifiering

Användaren har begärt SDK 57 för sin fysiska iPhone. Alla SDK 58-resultat nedan är historik och gäller inte automatiskt SDK 57 eller uppdaterade webbberoenden.

| Kontroll | Resultat för SDK 57 |
| --- | --- |
| npm-installation och SDK-beroenden | Ren installation godkänd, 696 paket; Expo 57.0.30, React Native 0.86.3 och React 19.2.3 |
| Mobilens TypeScript | Godkänd med TypeScript 6.0.3 och `@types/react` 19.2.4 |
| `npm run verify` | **Hela körningen godkänd** efter den rena SDK 57-installationen |
| Syntax, webbtyper och 22 affärs-/SQL-tester | Godkända; båda TypeScript-kontrollerna och **22 av 22** tester passerar |
| Next.js production build och Expo-export | Next.js **16.4.2** godkänd; Expo Android/iOS med Hermes samt webb med 8 statiska routes godkända |
| Expo beroendekontroll/Doctor | `expo install --check` godkänd; Expo Doctor **21 av 21** godkända |
| GitHub Actions | Ny SDK 57-körning ännu ej rapporterad; den gröna SDK 58-körningen finns i historiken |
| Expo Go på fysisk iPhone | Kräver SDK 57-kompatibel Go samt samma Expo-inloggning i CLI och telefon; faktisk telefonkörning ännu ej verifierad |
| ADB/emulator | ADB-servern svarar igen efter avgränsad serveromstart; `emulator-5554` är `device`. Inget SDK 57-UI-resultat ännu |
| Android Expo Go / development-APK | Ny SDK 57-körning/build ännu ej rapporterad |
| iOS EAS-build | Ingen SDK 57-build rapporterad; SDK 58-simulatorbuild finns i historiken |

Startkommandot `npm run dev:mobile` använder Expo Go för iPhone. Kodkontrollerna för SDK 57 är godkända. Faktisk appkörning, nya native-byggen och ny CI-körning följs upp separat nedan.

## Historik: SDK 58, 2026-10-17

Här skiljs körda kontroller från pågående byggen och tester som behöver externa konton. **Pågående är inte ett godkänt resultat.**

**Versionsgräns:** Detta avsnitt beskriver den verifierade SDK 58-källan efter V2-sammanslagningen och dess äldre iOS-snapshot. Det bevaras som faktisk historik efter användarens byte till SDK 57.

**Sammanslagen V2 + V3:** Hela `npm run verify` är godkänd: syntax, båda TypeScript-kontrollerna, **22 av 22** tester, Next.js production build och Expo-export för Android/iOS/webb. Där ingår backendens 14 kompatibilitetstester och 0001 → 0002 → V3 med befintliga V2-data i PGlite. Efter två små UI-ändringar kördes syntax/typer igen och webbläsarkontroll av mobilvy samt offline-regression godkändes.

[PR #2](https://github.com/sharbel0022/YEHABIBI/pull/2) har en godkänd [GitHub Actions-körning](https://github.com/sharbel0022/YEHABIBI/actions/runs/39033639715), inklusive `npm ci`, syntax, 22 tester, typer, Next.js-build och Expo-export för alla tre plattformar. Den verifierade källcommitten är `0a38d2682887fb92f5afb7d20c036659b3f5ba5e`. Ingen automatisk sammanslagning till `main` har gjorts.

| Kontroll | Resultat |
| --- | --- |
| `npm install` | Godkänd utan `--force` eller `--legacy-peer-deps` |
| `npm run syntax` | Godkänd från roten efter V2-sammanslagningen |
| TypeScript | Godkänd från roten efter V2-sammanslagningen för webb och mobil, inklusive mobilens TypeScript 6.0.3 |
| V2-/V3-kompatibilitet | 14 av 14 godkända, inklusive SQL och Checkout-regressioner |
| Samlad `npm test` | 22 av 22 godkända efter V2-sammanslagningen |
| Next.js production build | Godkänd efter V2-sammanslagningen |
| Expo export | Android/iOS/webb godkända efter V2-sammanslagningen |
| GitHub Actions | Alla steg godkända i körning `39033639715` |
| Slutligt Next.js-bygge efter UI-ändringar | Godkänt igen, cirka 9 sekunder |
| Expo `install --check` | Godkänd, beroendena är uppdaterade för SDK:n |
| Expo Doctor | 20 av 20 kontroller godkända |
| Android prebuild | Godkänd |
| Android-emulator | `emulator-5554` startad, `sys.boot_completed=1` |
| Metro för native-test | Development-manifest svarar 200 på port 8081; LAN-bindning med annonserad `127.0.0.1` för emulatorns portkoppling |
| Lokal Android `assembleDebug` | Båda försöken stoppade: först `MAX_PATH`, sedan blandade `Y:`/`C:`-sökvägar med `subst` |
| Android EAS development-APK | **FINISHED**; Gradle `BUILD SUCCESSFUL in 17m 38s`; [bygge](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/ef9ac62b-9472-4e7b-8ed5-7468b52b929e), [APK](https://expo.dev/artifacts/eas/uiCZlGu9EXS-xBJQHV7UfHEkC_Y0nY3PIiQdTFHqU-w.apk) |
| Appens SDK 58-UI i Android-emulator | APK-installation gav `Success`; native Hem, Menyer och menyval → beställning har körts. Detta är inte SDK 57-verifiering |
| EAS-konto och projekt | `whoami` och `project:info` godkända; rätt konto `sharbel1423` och projekt-id |
| iOS EAS simulatorbuild | **FINISHED**, Expo SDK 58, app 3.0.0 (1), `se.cedarmezze.app.dev`; [öppna bygget](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/1753e7c0-e7db-4627-adb1-0d6ed520def0) |
| SQL/RLS lokalt | Godkänt i PGlite med Supabase-plattformens roller/scheman ersatta i testet |
| Stripe sandbox, mejl, riktig Supabase | Ännu ej verifierade mot företagets tjänster |
| Fysisk iPhone/Android, Apple Pay och Swish | Ännu ej verifierade |

Miljögranskningen hittade Android Studio, Android 36-AVD och Studio-JDK. Första nätverkskontrollerna i begränsad miljö fick DNS-fel; installation och EAS-inloggning lyckades sedan med fungerande nätverksåtkomst. Första Expo-exporten fick ett behörighetsfel för Hermes temporära filer. Omkörning med `TEMP` och `TMP` till appens `.expo/tmp` lyckades. Emulatorn startade senare korrekt trots den inledande varningen från `emulator -accel-check`.

Android-försöket installerade SDK 37, NDK 27.1 och CMake 3.22.1 korrekt men nådde Windows sökvägsgräns i Reanimateds native-bygge. Projektet mappades därför till korta `Y:` och prebuild därifrån lyckades. Även Gradle-omkörningen stoppades när codegen blandade `Y:` och `C:`. `subst` är alltså ingen verifierad fix. Inga globala Java-miljövariabler ändrades. SDK 58-bygget lyckades sedan i EAS enligt tabellen ovan.

Efter uttryckligt användargodkännande, ”Ja, bygg Android i Expo”, granskades ett 1,1 MB källarkiv utan hemligheter och Android-bygget startades i det befintliga projektet `sharbel1423/cedar-mezze`. Build-id är `ef9ac62b-9472-4e7b-8ed5-7468b52b929e`, profil `development`, app 3.0.0 (1), `se.cedarmezze.app.dev`, Git-snapshot `b13d2c6` inklusive V2-sammanslagningen. Detta är en development-APK för emulatorn, ingen butiksuppladdning.

EAS bekräftade **FINISHED** med APK-artefakt. Jobbet skapades kl. 14:42:12 och slutfördes kl. 15:01:06 svensk tid den 2026-10-17. APK:n installerades och ovan nämnda native-vyer kördes innan SDK 57-bytet. Native-kompilering, APK-paketering och faktisk installation/appstart är separata kontroller.

Läsning via Supabase-anslutningen hittade inget aktivt projekt kopplat till denna app. Ingen extern databas eller dess schema har ändrats. Lokal PGlite och stängd demo ersätter inte verifiering av företagets riktiga Supabase-/Stripe-/mejltjänster.

iOS-bygget ovan har id `1753e7c0-e7db-4627-adb1-0d6ed520def0` och slutfördes 2026-10-17 kl. 14:29 svensk tid. Det bygger en snapshot före den senaste mediefallbacken, bytet till systemwebbläsare för Checkout och V2-sammanslagningen. Medie-/webbläsarändringarna exporterades och typkontrollerades separat. Ett lyckat äldre molnbygge bekräftar därför inte automatiskt slutkällan efter V2-sammanslagningen.

### Lokala HTTP-kontroller som körts

| Anrop | Verkligt resultat |
| --- | --- |
| GET `/`, `/menyer`, `/bestall`, `/kontakt`, `/festcatering-vasteras`, `/foretagscatering-vasteras` | Alla 200 |
| GET `/admin`, `/admin/catalog`, bevarad `/admin/ratter` utan inloggning | 200 med inloggningssida |
| GET `/robots.txt`, `/sitemap.xml`, `/api/health` | Alla 200 |
| GET `/api/catalog` | `demo:true`, `orders_enabled:false`, 11 demomaträtter, `custom_min_people:5`, tillåten CORS för `localhost:8081` |
| OPTIONS från otillåten respektive tillåten origin | 403 respektive 204 |
| POST `/api/orders` utan tjänstekonfiguration | 503, ingen verklig order accepterad |
| Ogiltig privat orderreferens | 404 |
| Admin-POST utan inloggning | 401 |
| Bevarat V2-admin-API utan inloggning | 401 |
| Stripe-webhook utan signatur | 400 |
| GET `/api/qr/bestall` | 200, SVG |
| GET `/api/qr/google` utan verifierad recensionslänk | 404 |

Production-serverns sista kontroll efter V2-sammanslagningen bekräftade åter kund-/adminsidorna, den stängda demokatalogen, behörighetsskyddat V2-admin-API, orderstopp med 503 och ogiltig privat orderreferens med 404.

## Affärsregler att testa automatiskt

`tests/` använder Nodes testverktyg och importerar TypeScript från `packages/shared`. Täck särskilt:

- Paketpris × personer, egna maträtters styck-/radpris, avrundat pris per person och total i heltalsöre.
- Leveransavgift, matchande postnummerzon och ingen avgift vid hämtning.
- Negativa/för stora belopp, dubbla maträtter, felaktiga antal och datum.
- Kontant bara vid hämtning och aldrig automatiskt betald.
- Statusövergångar: obetald onlineorder kan inte slutföras som betald.
- Formulärschema, säkra länkar och att klientpris inte avgör serverns pris.

### SQL- och Checkout-testen

`tests/v3.test.mjs` kör migrationerna i PGlite, PostgreSQL via WASM. Testmotorn är ett låst **utvecklingsberoende** i roten och körs även i CI efter vanlig installation:

```powershell
npm test
```

PGlite följer inte med produktappen. Testet skapar ersättningar för Supabases `auth`, `storage` och roller och utelämnar endast `pgcrypto`-extensionsraden i den inlästa testkopian. Migrationsfilerna ändras inte. Det verifierar aktuella databaspriser, orderrader, zoner, obetald kontantstatus, nekad `anon`-åtkomst och att fel efter order-INSERT rullar tillbaka hela transaktionen.

Checkout-testen använder en kontrollerad Stripe-ersättning: öppen session återanvänds, slutförd session får ingen ny länk och utgången session får ett stabilt nytt försök. SQL-testet verifierar dessutom att `attach_catering_checkout` inte skriver över en betalning eller en nyare session vid samtidig webhook. Testkonfigurationen är ingen aktiv extern databas och detta är ingen verklig Stripe-testtransaktion. Riktig Supabase, Auth, Storage, Stripe och mejlleverans återstår att kontrollera separat.

## Manuell kontroll med anslutna testtjänster

Använd en separat testdatabas och Stripe sandbox. Dessa kontroller bekräftar hela orderflödet.

Vid uppgradering från V2: lägg först in representativa rätter, kategorier, portionshjälp, order med `items_snapshot`, postnummerzoner och kampanj i en testdatabas med 0001 + 0002. Kör sedan V3-migrationen och kontrollera att id:n, historiska belopp och inställningar finns kvar. Redigera en rätt via V2-admin och kontrollera samma värde i Expo och V3-admin. Den gamla ordern ska behålla sitt historiska pris.

1. Öppna webben och Expo. Kontrollera demo när backend saknas och att formuläret då är stängt.
2. Lägg in ett testpaket och enskilda maträtter. Ändra serverpriset efter klientens kataloghämtning och kontrollera att ordern får serverns aktuella pris.
3. Testa för få gäster, fel datum, ogiltigt postnummer/zon och saknad leveransadress. Ogiltiga API-anrop ska stoppas även utan UI.
4. Skicka paketorder och egen cateringorder. Kontrollera orderrader, totalsumma, ägarmejl och kundens privata referens.
5. Öppna giltig orderreferens, fel token och någon annans orderkod. Fel kombination ska inte lämna ut kunduppgifter. Kontrollera att adminnotering och hemliga fält inte finns i publik JSON.
6. Testa okänd/ej tillåten admin. Bara godkänd och verifierad ägare ska kunna läsa och ändra order, priser, media, kampanjer och inställningar.
7. Godkänn onlineorder. Öppna Checkout, avbryt och återvänd. Ordern ska fortfarande vara obetald. Betala sedan i sandbox och kontrollera signerad webhook, dubblettleverans och återbetalning.
8. Testa Swish om kontot tillåter det. Testa Apple Pay på kompatibel fysisk Apple-enhet; emulator eller en knapp i formuläret bevisar inte Apple Pay-stöd.
9. Godkänn kontantorder, markera under förberedelse/klar, registrera mottagna pengar och slutför. Ingen tidigare åtgärd ska automatiskt sätta betald status.
10. Testa kampanj före, under och efter dess tidsfönster på båda klienterna. Kontrollera menyanknytning, video/bild och tomt läge.
11. Testa mobil video med ljud av, paus, minskad rörelse och bild vid nätverksfel. Kontrollera navigation, stora texter, tangentbord och att totalen går att läsa på liten skärm.
12. Skanna QR-koderna. Öppna kontakt-/Maps-/recensionslänkar och kontrollera officiell destination. Kontrollera sitemap, canonical och privata sidors noindex.
13. Om ägarpush används: testa riktig prenumeration, ny order, avregistrering, felande push och fungerande mejlreserv.

Spara testmiljö, datum och observerat resultat när du bockar av ett test. Använd inga riktiga kunduppgifter i rapporten. Äldre [TESTPLAN.md](TESTPLAN.md) finns kvar som kort ägarchecklista.
