# YEHABIBI V4.1 – Cedar Mezze

Libanesisk catering för hemma, fest och företag. **Expo SDK 57** driver iPhone/Android, Next.js driver webb/admin och båda använder samma API och Supabase/PostgreSQL. V4.1 behåller designen och rättar menybyggaren, datumval, orderbekräftelse, leveransområden och notifieringarnas återförsök.

Det befintliga [EAS-projektet Cedar Mezze](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze) och dess identiteter bevaras. Expo Go är standard på iPhone. Push kräver en egen development build och riktiga APNs/FCM-uppgifter; e-post är reservvägen. Faktiska V4.1-resultat och externa begränsningar finns i [TESTER.md](docs/TESTER.md).

Källan finns på [GitHub](https://github.com/sharbel0022/YEHABIBI/tree/main) och webbplatsen på [Sites](https://yehabibi.asdasdsa213.chatgpt.site). [Felrapporten och ändringsöversikten](docs/V4_FÖRÄNDRINGAR.md) beskriver V4.1. Publika riktiga order och betalningar är fortfarande avstängda: företagskonton och godkända produktuppgifter saknas. Det anslutna inaktiva Supabase-projektet och Stripe-miljön Quick match används inte, enligt användarens beslut.

## Starta

Installera Node.js **22.13 eller senare**, npm och Android Studio om du vill köra Android-emulatorn. Kör i repots rot:

```powershell
npm ci
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

EAS bygger Android development-APK och iOS-simulator från Windows. Kontrollera alltid version och källcommit på byggsidan; V3:s APK bevisar inte V4:s nya native-moduler. Följ [EXPO.md](docs/EXPO.md).

`EXPO_PUBLIC_API_URL` i `apps/mobile/.env.local` är:

| Körning | API-adress |
| --- | --- |
| Android Studio-emulator | `http://10.0.2.2:3000` |
| Fysisk mobil på samma Wi-Fi | `http://DATORNS-LAN-IP:3000` |
| Expo Web | `http://localhost:3000` och tillåten webborigin på servern |
| Publicerad app | Företagets riktiga HTTPS-adress |

Utan anslutna företagskonton visas en demonstration med stängda beställningar. Priser, kontaktuppgifter, recensioner och betalningsresultat hittas inte på.

## Så används plattformen

Kunden väljer paket eller **Alla rätter** → datum/leverans och gästantal → kontakt → kontrollerar och skickar en förfrågan. Valen sparas mellan vyerna. Servern hämtar aktuella priser, kontrollerar leveranszonen och skapar order och rader atomärt en gång även vid återförsök. Bekräftelsen ger ordernummer och en privat statuslänk; förfrågan är ännu obetald och inte godkänd. Ägaren granskar i `/admin` före betalning. Ett ändrat pris kräver kundens uttryckliga godkännande; historiska orderrader bevaras.

Stripe Checkout öppnas i systemwebbläsaren för kontots tillgängliga betalningsmetoder. Betald status kommer från en signerad webhook. Kontant gäller hämtning och registreras av ägaren. Faktura, Klarna och delbetalning är inte aktiverade. Se [BETALNINGAR.md](docs/BETALNINGAR.md).

## Hitta koden

```text
apps/mobile/      Expo: skärmar, API-anrop och säkert orderminne
apps/web/         Next.js: webb, admin, API och betalningar
packages/shared/ TypeScript-typer, priser, statusregler och validering
supabase/        SQL-migrationer som bevarar V2:s databas
tests/           Affärsregler, SQL och isolerat riktigt PostgreSQL/API-test
docs/            Korta svenska förklaringar
```

| Läs | Förklaring |
| --- | --- |
| [ARKITEKTUR.md](docs/ARKITEKTUR.md) | Hur app, webb, API och databas hänger ihop |
| [FIL_FOR_FIL.md](docs/FIL_FOR_FIL.md) | Viktiga filer och varför de finns |
| [DATABAS.md](docs/DATABAS.md) | Tabeller, priser, RLS och adminbehörighet |
| [BETALNINGAR.md](docs/BETALNINGAR.md) | Godkännande, prisförslag, Checkout, kontanter och webhook |
| [EXPO.md](docs/EXPO.md) | Expo Go, Android Studio, development build och EAS |
| [PUBLICERING.md](docs/PUBLICERING.md) | Webb, miljöer, Google Play och App Store |
| [TESTER.md](docs/TESTER.md) | Kommandon, faktiska resultat och återstående tester |

Gamla orderdata och katalog-ID:n bevaras. Kör migrationerna i filnamnsordning; hoppa över redan körda migrationer. V4.1 lägger till en migration efter V4. Se [DATABAS.md](docs/DATABAS.md). V2:s filguide och acceptansdokument finns kvar som historik.

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
| `npm run test:integration` | Eget tillfälligt PostgreSQL/PostgREST/Next-kluster; kräver lokala testverktyg enligt TESTER.md |

Installera alla workspaces från roten. Använd inte `--force` eller `--legacy-peer-deps` för att dölja beroendefel. Delade typer/prisregler ligger i `packages/shared`, medan Expo och Next.js har egna paketfiler.

Hemliga nycklar hör endast hemma i `apps/web/.env.local` eller serverns miljövariabler. Allt som börjar med `EXPO_PUBLIC_` kan läsas ur appen. Skicka aldrig Supabase service-role, Stripe secret eller Resend-nycklar till mobilen.

Före riktiga beställningar behövs företagets konton, godkända priser/allergener, kontaktuppgifter, villkor och verifierade testbetalningar. Butiksuppladdning sker separat efter verifiering; inga automatiska submits är konfigurerade.
