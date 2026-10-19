# Yehabibi V4.4.1 – driftberedskap

Granskad 2026-10-19. `git fetch origin main` verifierade startcommit **419fec1748db476a294da9596a116268774c5873**, samma som angiven referens. Arbetsgren: `production-readiness-v4-4-1`. Slutliga revisions- och testbevis registreras i [TEST_V4_4_1.md](TEST_V4_4_1.md). Historiska prov i äldre guider gäller deras uttryckliga versioner.

## Verifierat nuläge och problem

Next.js, Expo SDK57, gemensamt API, shared/api-client och PostgreSQL är bevarade. Direktpaket använder atomära kapacitetsreservationer; catering kräver ägargranskning och kundacceptans av prisrevision. Kontant är hämtning och kvitteras av behörig personal. Gamla orderrader och finansiella referenser bevaras.

Vid starten väntade betalningswebhooken på notifieringsleverans innan HTTP-svar. Notifieringar hade ingen återtagbar workerlease. `run_kitchen_watchdog` kallades från webbtrafik och kapacitetsfrågor. Ingen separat schemalagd process eller extern heartbeat var verifierad. Länkstatus kunde användas för att markera utgången betalning utan tillräckligt finansiellt bevis. Adyen Pay by Link var inte ett godkänt huvudkassaval för direktköp. Ett migrationsutbyte var känsligt för CRLF på Windows. Säkerhetsaudit och fysiska enhetsprov behövde förnyas.

## Genomförda lokala ändringar

Verifierad webhook sparas i en beständig inbox innan kvittens. Kort transaktion behandlar affärshändelse, kapacitet och outbox; mejl/push körs separat. Jobb och notifieringar har atomär claim, lease-token, kraschåterhämtning, begränsade batcher, Retry-After och synlig felkö. En separat worker använder ett serverautentiserat gemensamt jobbgränssnitt. Kökets regler omfattar orderkvittering, förberedelsepåminnelse, påminnelse, eskalering, godkänd reservadress och valbar hälsospärr för nya direktköp.

Avstämning utgår från ett sparat försök, dess leverantör, merchant och miljö. Den skapar inga nya debiteringar och frigör ingen kapacitet på grund av timeout/404/utgången kundsession. Oföränderliga sessionsresultat är ingen statuspoller. Finansiell sanning och chargeback-/refund-/kapacitetsavvikelser bevaras. Äldre försök utan merchant-snapshot behöver kontrollerad verifiering av ursprungligt konto innan backfill; dagens miljövariabler får inte skriva om historisk identitet.

Nybetalningar förblir avstängda utan företagsbeslut. Pay by Link kan bara uttryckligen godkännas som cateringkomplement och nekas som riktig direktkassa. Externa notifieringar kräver en separat godkännandespärr. Ingen Stripe återinförs.

## Antaganden och saknade uppgifter

Företaget har Swish; bank, Swish Handel/Företag, integratör och godkänd leverantör är okända. Företaget äger framtida betalningskonton och produktionsdata. Katalogens aktiva tillagningstider är konfiguration, inte nya mätningar. Ingen tillgång till fysisk telefon eller verifierad leverantörssandbox antas från äldre tester.

Fyll i [MERCHANT_SETUP.md](MERCHANT_SETUP.md): juridiskt namn, organisationsnummer, bank/Swishprodukt, befintligt kortavtal/e-handel, ordervolymer/belopp/betaltid före leverans, ansvariga, domän/DNS, hosting per miljö, företagsägda konton, utvecklarroller och godkända testmottagare. Hemligheter, certifikat och identitetshandlingar ska aldrig lämnas i chatt/GitHub.

## Lokalt möjligt respektive externt blockerat

| Arbetsdel | Bevis/gräns |
| --- | --- |
| SQL, inbox/outbox, krasch/konkurrens, kapacitet, autentisering | Lokala automatiska tester; slutresultat i testprotokollet |
| Separat schemalagd worker | Lokal verklig process utan webbläsare; ingen installerad produktionsscheduler |
| Företagets betalningsleverantör och konton | Blockerat på identifiering, avtal och godkännande; se beslutsunderlag |
| Swish/kort/Apple Pay/Google Pay sandbox | Blockerat på rätt konto och respektive officiellt teststöd |
| Fysiska iPhone/Android med installerad app | Blockerat på enheter, aktuell build och uttryckligen godkänd skyddad testanslutning |
| Kökskalibrering | Mall färdig; mätningar, separat valideringsurval och köksansvarigs godkännande saknas |
| Extern mail/push/reservkanal/heartbeat | Blockerat på tjänst, mottagare och godkännande; lokalt simulerat |
| Supabase Cron, fjärrmigration, EAS | Separata operationer; inga företagsmiljöer har ändrats |
| Sites | Befintligt projekt identifierat; separat status i testprotokollet, inga privata testdata/simulatorer publiceras |

## Drift och återgång

Se [BACKGROUND_JOBS.md](BACKGROUND_JOBS.md) för start/stopp, övervakning, felkö, reservrutin, backup/återläsning och återgång. [PAYMENT_RECONCILIATION.md](PAYMENT_RECONCILIATION.md) beskriver manuell avstämning och krav på bevis. Vid osäkerhet: stäng nya beställningar/nybetalningar, bevara inbox, historik, säkra verifieringscredentials och kapacitetskarantän. Ett Git-push eller godkänt bygge bevisar inte driftsättning, databasmigration, schedulerinstallation eller fysisk enhetsverifiering.

Detaljerade säkerhetsfynd före/efter finns i [SECURITY_REVIEW.md](SECURITY_REVIEW.md), betalningsval i [PAYMENT_PROVIDER_DECISION.md](PAYMENT_PROVIDER_DECISION.md), mätmall i [KITCHEN_CALIBRATION.md](KITCHEN_CALIBRATION.md) och enhetsmatris i [PHYSICAL_DEVICE_TESTS.md](PHYSICAL_DEVICE_TESTS.md).
