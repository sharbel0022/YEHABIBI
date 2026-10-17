# YEHABIBI V3 – Cedar Mezze

En cateringplattform med **Expo för Android/iPhone**, en Next.js-webbplats och samma beställningssystem i Supabase/PostgreSQL. V2:s webbplats och adminpanel finns kvar i `apps/web`. Appens arbetsnamn är **Cedar Mezze**.

Mobilappen använder **Expo SDK 57 för din iPhone i Expo Go**, med Expo Router och samma backend som webben. Det riktiga [EAS-projektet](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze) är kopplat till `sharbel1423`. Appstart på fysisk iPhone har bekräftats av användaren, och alla sex skärmar har testats i Androids Expo Go. Kodkontroller och export för Android/iOS/webb är godkända; detaljer finns i [TESTER.md](docs/TESTER.md). Tidigare SDK 58-byggen sparas som historiska tester.

Kodgranskning finns i [PR #2](https://github.com/sharbel0022/YEHABIBI/pull/2) på [branchen expo-mobile-v3](https://github.com/sharbel0022/YEHABIBI/tree/expo-mobile-v3). Lokal `npm run verify` och [GitHub Actions](https://github.com/sharbel0022/YEHABIBI/actions/runs/39035790398) är godkända för SDK 57 och Next.js 16.4.2. Native-körning och molnbyggen redovisas separat i teststatusen.

## Starta

Installera Node.js **22.13 eller senare**, npm och Android Studio om du vill köra Android-emulatorn. Kör i repots rot:

```powershell
npm install
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/mobile/.env.example apps/mobile/.env.local
```

Kopiera miljöfilerna bara första gången. Anslut iPhone och dator till samma Wi-Fi. Kör `ipconfig` och sätt `EXPO_PUBLIC_API_URL=http://DATORNS-LAN-IP:3000` i `apps/mobile/.env.local`. Android-emulatorns `10.0.2.2` fungerar inte på din iPhone.

Starta webben/API:t i en terminal och Expo i en andra, båda från repots rot:

```powershell
# Terminal 1
npm run dev
# Terminal 2
npm run dev:mobile
```

`npm run dev:mobile` visar **Expo Go-QR för SDK 57**. Skanna med iPhones Kamera och öppna Expo Go. Logga in på samma Expo-konto i CLI och telefonen, här `sharbel1423`; vid behov kör du `npx expo login` från `apps/mobile`. [EXPO.md](docs/EXPO.md) beskriver Wi-Fi, inloggning och felsökning.

SDK 57 har även färdiga EAS-byggen för Android development-APK och iOS-simulator. Hämta rätt artefakt och följ installations-/teststatus i [EXPO.md](docs/EXPO.md). Den äldre SDK 58-APK:n är historik. Lokal native-kompilering med SDK 58 stoppades av Windows-sökvägsproblem; SDK 57 har inte byggts lokalt.

`EXPO_PUBLIC_API_URL` i `apps/mobile/.env.local` är:

| Körning | API-adress |
| --- | --- |
| Android Studio-emulator | `http://10.0.2.2:3000` |
| Fysisk mobil på samma Wi-Fi | `http://DATORNS-LAN-IP:3000` |
| Expo Web | `http://localhost:3000` och tillåten webborigin på servern |
| Publicerad app | Företagets riktiga HTTPS-adress |

Utan anslutna företagskonton visas en demonstration med stängda beställningar. Priser, kontaktuppgifter, recensioner och betalningsresultat hittas inte på.

## Så används plattformen

Kunden väljer cateringpaket eller egna maträtter och skickar en förfrågan. Servern hämtar aktuella priser och kontrollerar totalsumman. Ägaren granskar förfrågan i webbens `/admin` innan kunden betalar.

Stripe Checkout öppnas i webbläsaren för kort, Swish när kontot stöder det och Apple Pay på stödd enhet. Betald status kommer från en signerad webhook. Kontant gäller hämtning och registreras manuellt av ägaren. Se [ARKITEKTUR.md](docs/ARKITEKTUR.md).

## Hitta koden

```text
apps/mobile/      Expo: skärmar, API-anrop och säkert orderminne
apps/web/         Next.js: webb, admin, API och betalningar
packages/shared/ TypeScript-typer, priser, statusregler och validering
supabase/        SQL-migrationer som bevarar V2:s databas
tests/           Tester av gemensamma affärsregler
docs/            Korta svenska förklaringar
```

| Läs | Förklaring |
| --- | --- |
| [ARKITEKTUR.md](docs/ARKITEKTUR.md) | Hur app, webb, API och databas hänger ihop |
| [FIL_FOR_FIL.md](docs/FIL_FOR_FIL.md) | Viktiga filer och varför de finns |
| [DATABAS.md](docs/DATABAS.md) | Tabeller, priser, RLS och adminbehörighet |
| [EXPO.md](docs/EXPO.md) | Expo Go, Android Studio, development build och EAS |
| [PUBLICERING.md](docs/PUBLICERING.md) | Webb, miljöer, Google Play och App Store |
| [TESTER.md](docs/TESTER.md) | Kommandon, faktiska resultat och återstående tester |

V2:s styckrätter, portionshjälp, menykatalog, admin och gamla orderdata bevaras i uppgraderingen. Databasen kör migrationerna **0001 → 0002 → 20261017121516** i ordning; befintlig V2 hoppar över redan körda migrationer. Se [DATABAS.md](docs/DATABAS.md) för kompatibiliteten. [FIL_FOR_FIL_V2.md](docs/FIL_FOR_FIL_V2.md) och [V2_ACCEPTANS.md](docs/V2_ACCEPTANS.md) finns kvar som V2-historik, med webbens flyttade sökvägar.

## Vanliga kommandon

Kör från repots rot:

| Kommando | Gör |
| --- | --- |
| `npm run dev` | Startar Next.js och API på port 3000 |
| `npm run dev:mobile` | Startar Expo Go-QR för iPhone, SDK 57 |
| `npm run android` | Öppnar separat installerad SDK 57 development build på Android |
| `npm run build:android` | Försöker lokalt Android-bygge; se Windows-begränsningar i EXPO.md |
| `npm run go --workspace @yehabibi/mobile` | Startar Expo Go uttryckligt |
| `npm run export:mobile` | Exporterar Expo för konfigurerade plattformar |
| `npm run verify` | Syntax, TypeScript, enhetstester, webbbygge och Expo-export |

Installera alla workspaces från roten. Använd inte `--force` eller `--legacy-peer-deps` för att dölja beroendefel. Delade typer/prisregler ligger i `packages/shared`, medan Expo och Next.js har egna paketfiler.

Hemliga nycklar hör endast hemma i `apps/web/.env.local` eller serverns miljövariabler. Allt som börjar med `EXPO_PUBLIC_` kan läsas ur appen. Skicka aldrig Supabase service-role, Stripe secret eller Resend-nycklar till mobilen.

Före riktiga beställningar behövs företagets konton, godkända priser/allergener, kontaktuppgifter, villkor och verifierade testbetalningar. Butiksuppladdning sker separat efter verifiering; inga automatiska submits är konfigurerade.
