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

## Faktiskt körda kontroller, 2026-10-17

Här skiljs körda kontroller från pågående byggen och tester som behöver externa konton. **Pågående är inte ett godkänt resultat.**

| Kontroll | Resultat |
| --- | --- |
| `npm install` | Godkänd utan `--force` eller `--legacy-peer-deps` |
| `npm run syntax` | Godkänd från roten |
| TypeScript | Godkänd från roten för webb och mobil, inklusive mobilens TypeScript 6.0.3 |
| V3-tester | 9 av 9 godkända, inklusive SQL och Checkout-regressioner |
| Samlad `npm test` | 17 av 17 godkända, inklusive SQL och två nya Checkout-regressioner |
| Next.js production build | Godkänd igen efter slutliga webbändringar |
| Expo export | Godkänd för Android, iOS och webb efter ändrad mediefallback; sista omkörning pågår |
| Expo `install --check` | Godkänd, beroendena är uppdaterade för SDK:n |
| Expo Doctor | 20 av 20 kontroller godkända |
| Android prebuild | Godkänd |
| Android-emulator | `emulator-5554` startad, `sys.boot_completed=1` |
| Android `assembleDebug` | Pågår; Gradle installerar SDK 37/NDK |
| Appens UI i Android-emulator | Ännu ej verifierat; startad emulator är ett separat resultat |
| EAS-konto och projekt | `whoami` och `project:info` godkända; rätt konto `sharbel1423` och projekt-id |
| iOS EAS simulatorbuild | Startad, `IN_PROGRESS`; [öppna bygget](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/1753e7c0-e7db-4627-adb1-0d6ed520def0) |
| SQL/RLS lokalt | Godkänt i PGlite med Supabase-plattformens roller/scheman ersatta i testet |
| Stripe sandbox, mejl, riktig Supabase | Ännu ej verifierade mot företagets tjänster |
| Fysisk iPhone/Android, Apple Pay och Swish | Ännu ej verifierade |

Miljögranskningen hittade Android Studio, Android 36-AVD och Studio-JDK. Första nätverkskontrollerna i begränsad miljö fick DNS-fel; installation och EAS-inloggning lyckades sedan med fungerande nätverksåtkomst. Första Expo-exporten fick ett behörighetsfel för Hermes temporära filer. Omkörning med `TEMP` och `TMP` till appens `.expo/tmp` lyckades. Emulatorn startade senare korrekt trots den inledande varningen från `emulator -accel-check`.

iOS-bygget ovan har id `1753e7c0-e7db-4627-adb1-0d6ed520def0` och bygger en snapshot från före den senaste mediefallbacken. Senaste källan har exporterats och typkontrollerats separat. Ett lyckat äldre molnbygge bekräftar därför inte automatiskt senaste ändringarna.

### Lokala HTTP-kontroller som körts

| Anrop | Verkligt resultat |
| --- | --- |
| GET `/`, `/menyer`, `/bestall`, `/kontakt`, `/festcatering-vasteras`, `/foretagscatering-vasteras` | Alla 200 |
| GET `/admin`, `/admin/catalog` utan inloggning | 200 med inloggningssida |
| GET `/robots.txt`, `/sitemap.xml`, `/api/health` | Alla 200 |
| GET `/api/catalog` | `demo:true`, `orders_enabled:false`, 11 demomaträtter, tillåten CORS för `localhost:8081` |
| OPTIONS från otillåten respektive tillåten origin | 403 respektive 204 |
| POST `/api/orders` utan tjänstekonfiguration | 503, ingen verklig order accepterad |
| Ogiltig privat orderreferens | 404 |
| Admin-POST utan inloggning | 401 |
| Stripe-webhook utan signatur | 400 |
| GET `/api/qr/bestall` | 200, SVG |
| GET `/api/qr/google` utan verifierad recensionslänk | 404 |

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
