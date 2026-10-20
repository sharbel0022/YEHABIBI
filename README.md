# YEHABIBI V4.4 – Cedar Mezze

V4.4.1:s [driftberedskap](docs/READINESS_V4_4_1.md) tillför beständig webhook-inbox, schemalagda bakgrundsjobb och säkrare avstämning. Betalningsleverantör, företagsmiljöer och fysiska telefonprov är fortfarande separata godkännanden. Nybetalningar och externa notifieringar är avstängda som standard. [Bakgrundsjobb och Windows-kommandon](docs/BACKGROUND_JOBS.md).

Libanesisk catering för hemma, fest och företag. Next.js driver webb, admin och den gemensamma backendservern. Expo SDK 57 driver iPhone och Android. Alla plattformar använder samma katalog, orderkontrakt och Supabase/PostgreSQL inom respektive miljö.

V4.4 lägger till **Beställ nu** för färdiga paket, antal paket, hämtning/hemleverans och serverberäknade lediga tider i `Europe/Stockholm`. Kapacitet och aktuellt pris kontrolleras igen i samma transaktion som ordern sparas. Catering med offert och ägargodkännande finns kvar. Läs [direktbeställningsguiden](docs/DIRECT_ORDERS_V4_4.md) för inställningar, tidsberäkning och ett komplett testköp utan riktiga pengar.

V4.3 ersätter aktiv Stripe-kod med ett gemensamt betalningsgränssnitt och en avstängd Adyen Pay by Link-adapter med testmiljö och separat spärrad produktionskonfiguration. Swish, Apple Pay, Google Pay och Visa/Mastercard kräver företagets verifierade konton och riktiga sandboxprov. Inga livebetalningar aktiveras. Orderhistoriken bevaras genom en additiv migration.

Läs [V4.3-guiden](docs/PAYMENTS_WITHOUT_STRIPE_V4_3.md) för betalningsflöde, leverantörsjämförelse, verifierade priser, installation och kvarvarande företagskrav. [V4.2-guiden](docs/UNIFIED_ARCHITECTURE_V4_2.md) bevarar refaktoreringens bakgrund. [TESTER.md](docs/TESTER.md) redovisar faktiskt testutfall. GitHub/CI och Sites senaste verifierade publicering beskrivs i [PUBLICERING.md](docs/PUBLICERING.md).

För kompletta orderflöden utan riktiga pengar finns en separat lokal testmiljö med PostgreSQL/PostgREST, syntetisk meny, egen testadmin, testinkorg och simulerade betalningar. Start, återställning och mobilanslutning beskrivs i [TEST_ORDER_PAYMENT_GUIDE.md](docs/TEST_ORDER_PAYMENT_GUIDE.md). Testadaptern och dess sidor kopieras endast till en isolerad arbetskopia; de ingår inte i produktionsappen eller den publika Site-versionen.

## Privat fjärrtest med Expo Go

V4.4.3 använder Expo Tunnel för utvecklingsappen och privat Tailscale HTTPS för samma isolerade testbackend. Telefonen registreras och godkänns på datorn en gång, sparar sin enhetscredential i SecureStore och återansluter med kortlivade kundsessioner. Anslut datorn och telefonen till samma Tailscale-konto och kör från repots rot:

```powershell
npm run dev:remote
# Första gången: välj Registrera denna telefon i appen och jämför koden.
npm run dev:remote:devices -- list
npm run dev:remote:devices -- approve <enhets-id> <jämförelsekod>
npm run dev:remote:doctor
# Stoppa från en andra PowerShell; testdatabasen behålls.
npm run dev:remote:stop
```

Starten visar aktuell Expo Go-länk och den riktiga privata API-adressen. Ingen mobil sessionsnyckel behöver kopieras. Testadmin och betalningssimulator behåller separat webbinloggning med `.tmp/remote-credentials.txt`. Återkalla en telefon med `npm run dev:remote:devices -- revoke <enhets-id>`. Läs [V4.4.3-guiden](docs/REMOTE_DEVELOPMENT_V443.md) för exakta Windows-kommandon, säkerhetsmodell och verifieringsgränser. [V4.4.2-guiden](docs/REMOTE_DEVELOPMENT_V442.md) beskriver tidigare implementation, SDK 57/Expo Go, installation och ngrok-fixen.

## Starta i Windows

Använd Node.js 22.13 eller senare. Kör i repots rot:

```powershell
npm ci
# Kopiera bara miljöfiler som inte redan finns.
if (!(Test-Path apps/web/.env.local)) {
  Copy-Item apps/web/.env.example apps/web/.env.local
}
if (!(Test-Path apps/mobile/.env.local)) {
  Copy-Item apps/mobile/.env.example apps/mobile/.env.local
}
```

Starta webb/API i första terminalen och Expo i en andra:

```powershell
# Terminal 1, från repots rot
npm run dev
# Terminal 2, från repots rot
npm run dev:mobile
```

Webben öppnas på `http://localhost:3000`. Expo visar QR för Expo Go med SDK 57. För en fysisk mobil på samma Wi-Fi anger du datorns IPv4-adress från `ipconfig` i `apps/mobile/.env.local`:

```dotenv
EXPO_PUBLIC_API_URL=http://DATORNS-LAN-IP:3000
```

| Körning | API-adress i mobilen |
| --- | --- |
| Android Studio-emulator | `http://10.0.2.2:3000` |
| Fysisk iPhone eller Android på samma Wi-Fi | `http://DATORNS-LAN-IP:3000` |
| Expo Web | `http://localhost:3000`; tillåt dess webborigin på servern |
| Publicerad app | Företagets riktiga HTTPS-adress |

Starta om Expo efter ändrad API-adress. `APP_ENV` väljer appidentitet; API-adressen väljer backendmiljö. EAS-projektet [sharbel1423/cedar-mezze](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze) bevaras. Fler instruktioner finns i [EXPO.md](docs/EXPO.md).

## Ett gemensamt system

Kunden väljer catering → anpassar → anger datum/plats och kontakt → granskar → skickar förfrågan. Servern läser aktuella priser och skapar order och rader i en databastransaktion. Samma `request_id` återanvänder ordern vid identiska återförsök.

Ägaren granskar i `/admin`. Ett nytt pris kräver kundens uttryckliga godkännande av rätt revision. Ägaren skickar betalningsbegäran med privat statuslänk; kunden väljer därefter en serververifierad metod och skapar den hostade betalningen i vald miljö. Bara autentiserad leverantörsbekräftelse kan bekräfta onlinebetalning. Kontant gäller bara hämtning och kvitteras av behörig administratör. Ursprungliga orderrader och priser bevaras när katalogen ändras.

Adminändringar läses från samma `/api/catalog` på båda plattformar. Webbens meny/formulär uppdaterar vid fokus, återkomst till synlig flik, återställd anslutning och knappen Uppdatera menyn. Expo uppdaterar vid återkomst till appen och när kunden drar för att uppdatera. Ett nätverksfel behåller matvalen men stänger möjligheten att skicka från en obekräftad katalog.

## Hitta koden

```text
apps/web/           Next.js: webb, SEO, admin, API och serverintegrationer
apps/mobile/        Expo: native skärmar, navigation och enhetslagring
packages/shared/    Typer, regler, validering, designvärden och avstängd demo
packages/api-client/ Typade publika fetch-anrop för webb och Expo
supabase/migrations/ Befintlig historik plus additiv V4.3-betalningsmigration
tests/              Gemensamma regler, API-kontrakt, SQL och integration
docs/               Svenska guider och verifieringsresultat
```

| Läs | Förklaring |
| --- | --- |
| [UNIFIED_ARCHITECTURE_V4_2.md](docs/UNIFIED_ARCHITECTURE_V4_2.md) | Före/efter, systemflöde och underhåll utan dubbla regler |
| [V4_1_NULAGE.md](docs/V4_1_NULAGE.md) | Verifierad utgångspunkt, tidigare CI och beroendekarta inför refaktoreringen |
| [ARKITEKTUR.md](docs/ARKITEKTUR.md) | Beroenden, säkerhet och gränser mellan paketen |
| [FIL_FOR_FIL.md](docs/FIL_FOR_FIL.md) | Viktiga filer och var du gör en ändring |
| [DATABAS.md](docs/DATABAS.md) | Tabeller, historiska priser, idempotens och behörigheter |
| [PAYMENTS_WITHOUT_STRIPE_V4_3.md](docs/PAYMENTS_WITHOUT_STRIPE_V4_3.md) | Adyen-kandidat, bank-Swish/Nexi, kostnader och installation |
| [BETALNINGAR.md](docs/BETALNINGAR.md) | Godkännande, prisförslag, hostad betalning och webhook |
| [EXPO.md](docs/EXPO.md) | Windows, Expo Go, Android och EAS |
| [REMOTE_DEVELOPMENT_V442.md](docs/REMOTE_DEVELOPMENT_V442.md) | Privat fjärrtest, Tailscale, Expo Tunnel, start/stopp och fysiskt testprotokoll |
| [TESTER.md](docs/TESTER.md) | Körda tester och kvarvarande externa kontroller |
| [PUBLICERING.md](docs/PUBLICERING.md) | GitHub, miljöer och faktisk Sites-status |

## Kontrollera en ändring

Kör från roten:

```powershell
npm run syntax
npm test
npm run typecheck
npm run build
npm run test:web
npm run export:mobile
```

`npm run verify` samlar syntax, tester, typkontroll, produktionsbygge och Expo-export. Kör även `npm run test:web`, `npm run test:integration` och `npm run test:mode` för produktionsspärrar och isolerade HTTP-/databasflöden enligt [TESTER.md](docs/TESTER.md) och [testguiden](docs/TEST_ORDER_PAYMENT_GUIDE.md). Expo-export verifierar paketering för Android, iOS och webb; den bevisar inte ett nytt signerat EAS-bygge eller test på fysisk telefon.

Installera workspaces från roten och uppdatera låsfilen med npm vid beroendeändringar. Använd inte `--force` eller `--legacy-peer-deps` för att dölja beroendefel.

## Inför riktiga beställningar

Utan konfigurerade företagstjänster visas samma avstängda förhandsvisning på webb och mobil. Företagets priser, allergener, kontaktuppgifter, villkor, databasmiljö och externa tjänster måste verifieras före lansering. Obetald förfrågan kräver uttrycklig företagsinställning. Order- och betalningsspärrarna aktiveras inte automatiskt. Det tidigare anslutna inaktiva Supabase-projektet används inte. Stripe är ingen aktiv betalningslösning; historiska fält/migrationer bevaras för spårbarhet.

Serverhemligheter hör hemma i webbserverns godkända secret-hantering. Allt med prefixet `EXPO_PUBLIC_` kan läsas ur appen. Lägg aldrig Supabase service-role, betalnings-API-/HMAC- eller Resendnycklar där och skicka dem aldrig i chatt/GitHub. Separera utveckling, staging och produktion; webb och mobil inom samma miljö ska peka på samma system.
