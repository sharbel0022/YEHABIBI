# Verifiering av kompletta V4.4

Detta protokoll fylls med faktiska resultat under genomförandet. Endast syntetiska uppgifter och den isolerade `TestPaymentProvider` används. Ingen simulering är en verklig Swish-, Apple Pay-, Google Pay- eller korttransaktion.

## Windows – prova själv

```powershell
Set-Location 'C:\Users\sharbel\Downloads\YEHABIBI'
npm ci
npm run test:server
```

Öppna adressen som terminalen visar. Testadmin och lokala inkorgen använder det slumpade testlösenordet. Behåll terminalen igång. Krav: Node.js minst 22.13, PostgreSQL-verktyg i `C:/Program Files/PostgreSQL/18/bin` eller `PG_BIN`, och PostgREST i `.tmp/v41-tools/postgrest.exe` eller `POSTGREST_BIN`. Riktiga miljönycklar ärvs inte.

För Expo, i en separat terminal från samma rot:

```powershell
npm run test:mobile
```

Följ startkommandots anvisningar. Test-API:t binds till loopback och Expo startas med `--localhost`; detta provar Expo Web och lokal emulator. En fysisk enhet kräver en separat säkrad, nåbar privat API-anslutning och anpassad isolering; att bara skriva datorns LAN-adress räcker inte. Simulatorn flyttar inga pengar. Fysiska iOS-/Androidtester redovisas separat från Expo Web/export.

## Automatiska kontroller

```powershell
npm run syntax
npm test
npm run typecheck
npm run build
npm run export:mobile
npm run test:web
npm run test:integration
npm run test:mode
npm run test:direct
```

Kör HTTP-sviterna efter bygg-/smokekontrollen; integrationens utvecklingsserver får inte skriva samtidigt som Next-produktionsbygget. Testservern skapar egna temporära databaser och webbkopia och stoppar sina egna processer vid avslut.

## Praktiska acceptansfall

| Fall | Kontroll |
| --- | --- |
| A hämtning | Paket/storlek/antal → granska rätt paketpris → testkontakt → Swish → bekräftad/betald → tillaga → packa → klar → slutförd |
| B leverans | Paket + tillbehör → postnummer/zon/avgift → leveransfönster → Apple Pay/kort → packa → på väg → levererad |
| C catering | Egen meny, 20 personer, framtida dag → granska → offertrevision → kundacceptans → simulerad betalning → köksflöde |
| D sista kapacitet | Samtidiga HTTP-anrop → endast en reservation ryms → övriga får ny tillgänglighet |
| E fel/refund | Avslag/avbrott/expiry → uttryckligt säkert återförsök med samma betalningsidentitet → verifierad refund |
| Sen händelse | Spara fördröjd händelse → order fortfarande pending → leverera sparad signerad händelse → bekräftelse eller tydligt kapacitetsproblem |

Dessutom: DST fram/bak, midnatt, undantag/stängning, framtida standardköp, prisbyte, slutsålt, paus, zonbegränsning, manuella/cateringreservationer, kampanjkvot, ack-larm, packspärr, privata token/adminrättigheter och interna anteckningar.

## Faktiskt genomförd verifiering

- `npm ci`: genomfört. Befintlig låsfil rapporterar 30 npm-advisories (11 moderate, 19 high; inga critical), främst Expo/Metro-kedjan. Ingen beroendeversion tillförs av denna funktion. Föreslagna automatiska majorbyten skulle bryta kravet att behålla Expo SDK 57; separat kompatibilitetsgranskning krävs före produktionsdrift.
- `npm run syntax`, `npm run typecheck`, `npm run build`, `npm run export:mobile`: godkända. Expo SDK 57 bevaras; iOS/Android/Web exporterades, nio statiska webbrutter.
- `npm test`: 142 tester passerade i granskad körning. Omfattar katalog/arbetsenheter, kampanjkvot, gamla framtida bokningar, separata priser, sparad transporttid, manuella/catering-/leveransreservationer, DST och betalningsskydd.
- `npm run test:web`: godkänd produktionssmoke, tio sidor, serverrenderad katalog, demo/off och ingen simulator.
- `npm run test:integration`: godkänd, 11 order och 64 lokalt fångade e-postmeddelanden.
- `npm run test:mode`: godkänd utökad HTTP/PostgreSQL-svit, 25 kontroller, 89 e-postmeddelanden och 28 simulerade pushhändelser. Inget externt nätverk eller riktiga pengar.
- `npm run test:direct`: nio kontroller godkända, fyra betalningsmetoder, direktleverans med faktiska tillbehörsrader, sparad packning och verklig samtidig konkurrens: en skapad och sju konflikter vid sista kapaciteten.
- Nya kapacitets-/betalningsfall omfattar utgång utan försök, pinning under pågående betalning, verifierat avslag/återförsök, sen betalning/återbetalning och dubbelt besked efter förberedelsestart. Sen betalning efter avbokning behåller avbokningen men registrerar betalt + avvikelse. Historiska spärrar bevaras; dubblett kan inte radera en senare chargeback-spärr.
- Simulatorns SQL-tester: fördröjt sparat besked, återstart, exakt signerad återleverans och alla fyra metoder passerade i fokuserad körning.

## Praktiska webb- och Expo-prov

Samtliga testkontakter, priser och adresser är syntetiska.

| Prov | Faktiskt resultat |
| --- | --- |
| A `CM-F4FA102A92` | Webbens tre steg, 2 paket × 129 kr = 258 kr, simulerad Swish. Betald och kapacitetsbekräftad. Admin kvitterade, tillagade, sparade fem packpunkter, markerade klar och slutförd. |
| B `CM-E5F046B820` | Webb: 129 kr paket + 2 × 25 kr tillbehör + 100 kr leverans = 279 kr. Konfigurerat fönster 16:15–16:30. Simulerad Apple Pay. Kvitterad, tillagad, packad, på väg och slutförd. |
| C `CM-3467527FCA` | Egen meny till 20 personer, 40 ostrullar + 4 hummusfat + 20 kaftaspett. 2 660 kr → offertrevision 2 800 kr, kunden accepterade. Simulerat kort, betald, kvitterad, packad och slutförd. Ursprungliga produktpriser bevarades; 140 kr visades separat. |
| Expo `CM-7A70C581FA` | Samma backend och tre steg, 129 + 25 = 154 kr. Nekat kort → uttryckligt återförsök med samma betalningsidentitet → sparat fördröjt besked. Appen visade väntande tills händelsen levererades, därefter verifierat betald och tidsbekräftad. |

Ett praktiskt prov hittade att hela orderkvittot skickades till strikt betalningsvalidering. Webb/Expo och API-klienten rättades att skicka endast code/token/metod och fick regressionstest. Ett annat prov hittade råa mellanslagsnoder i React Native; de togs bort. Köksknappen Slutför fick samma synliga packspärr som servern redan tillämpade.

Skärmbilder finns lokalt i ignorerade `.tmp/v44-complete-*.png`/`.jpg`; privata token ska inte versionshanteras. Fysiska iPhone-/Androidtelefoner och riktiga wallet-/Swishtransaktioner är inte provade. Expo Web är ett praktiskt UI-prov; exporter är byggbevis.

## Driftgränser och publicering

Windows-binären PostgREST 16.4 avslutades intermittent med kod 3 före HTTP-start, även med explicit `+RTS -N1 -RTS`. Misslyckade testsessioner städades och friska omstarter gav godkända verkliga HTTP-/databasflöden. Ingen automatisk omkörning döljer startfel. Exakt upstream-orsak är inte fastställd.

Watchdog kontrollerar sparade okvitterade order vid serveranrop och kan då pausa nya köp även när admin är stängd. Det finns ingen fristående bakgrundstimer som garanterar larm vid en exakt sekund utan trafik. Pågående/oklara betalningar kan avsiktligt hålla kapacitet tills verifierad händelse eller manuell leverantörsavstämning; ingen bakgrundspoller har uppfunnits.

PR, senaste main-CI och faktisk Sites-status kompletteras efter verifierad merge/driftsättning. Publik drift behåller orders/payments/indexering avstängda.

## Kvar före företagslansering

Företagets godkända sortiment/exakta matbilder, allergener, öppettider/zoner, juridiska uppgifter, moms/villkor, retention, leverantörsavtal och personliga administratörskonton. Betaltjänstavtal och faktiska enhetstester av Swish/wallets krävs separat. Riktiga Adyen-/Swish-konton ansluts inte här. Extern leverans kräver avtal och verifierad integration.
