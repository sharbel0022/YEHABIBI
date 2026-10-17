# YEHABIBI V3 – Cedar Mezze

En cateringplattform med **Expo för Android/iPhone**, en Next.js-webbplats och samma beställningssystem i Supabase/PostgreSQL. V2:s webbplats och adminpanel finns kvar i `apps/web`. Appens arbetsnamn är **Cedar Mezze**.

Mobilappen är ett riktigt Expo-projekt med Expo Router, Expo Go och stöd för egna development builds. Det riktiga [EAS-projektet](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze) har skapats under `sharbel1423` och lagts in i konfigurationen. Signering och faktiska molnbyggen verifieras separat. Se [EXPO.md](docs/EXPO.md).

## Starta

Installera Node.js **22.13 eller senare**, npm och Android Studio om du vill köra Android-emulatorn. Kör i repots rot:

```powershell
npm install
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/mobile/.env.example apps/mobile/.env.local
npm run dev
```

Kopiera miljöfilerna bara första gången. Webben och API:t finns på `http://localhost:3000`. Öppna en andra terminal i roten:

```powershell
npm run dev:mobile
```

Starta Android-emulatorn. Första gången installeras din egen **Cedar Mezze Dev** med `npm run build:android`; därefter öppnar `npm run android` appen mot utvecklingsservern. Exakta SDK-/Java-kommandon finns i [EXPO.md](docs/EXPO.md).

Lokal Android-kompilering på denna Windows-dator har stoppats av CMake/Ninja-sökvägar, både från Downloads-mappen och med `subst Y:`. En kort sökväg är alltså ingen verifierad lösning här. [EXPO.md](docs/EXPO.md) beskriver EAS-alternativet för en development-APK som kan installeras i samma Android-emulator.

Expo Go är ett separat alternativ: `npm run go --workspace @yehabibi/mobile`. Dess SDK-version måste passa projektet. Standardkommandona använder development build så att appens riktiga identitet kan verifieras.

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
| `npm run dev:mobile` | Startar Expo för installerad development build |
| `npm run android` | Öppnar Cedar Mezze Dev på Android |
| `npm run build:android` | Bygger och installerar Android development build lokalt |
| `npm run go --workspace @yehabibi/mobile` | Startar alternativet Expo Go |
| `npm run export:mobile` | Exporterar Expo för konfigurerade plattformar |
| `npm run verify` | Syntax, TypeScript, enhetstester, webbbygge och Expo-export |

Installera alla workspaces från roten. Använd inte `--force` eller `--legacy-peer-deps` för att dölja beroendefel. Mobil och webb har var sin React-version eftersom Expo och Next.js kräver olika versioner.

Hemliga nycklar hör endast hemma i `apps/web/.env.local` eller serverns miljövariabler. Allt som börjar med `EXPO_PUBLIC_` kan läsas ur appen. Skicka aldrig Supabase service-role, Stripe secret eller Resend-nycklar till mobilen.

Före riktiga beställningar behövs företagets konton, godkända priser/allergener, kontaktuppgifter, villkor och verifierade testbetalningar. Butiksuppladdning sker separat efter verifiering; inga automatiska submits är konfigurerade.
