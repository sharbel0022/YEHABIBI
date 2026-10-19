# Avstämning och betalningsbevis

Granskad 2026-10-19. Ingen riktig betaltjänst eller rapportåtkomst har verifierats för företaget. Lokala tester använder syntetiska data. Den verkliga leverantörsanslutningen och den manuella rapportvägen måste godkännas före drift.

## Mottagning och beständighet

`POST /api/payments/webhook` läser högst 64 KiB, kontrollerar hela batchens Standard HMAC, merchant och test/live-miljö och skickar normaliserade bevis till `enqueue_catering_payment_events`. Transaktionen kontrollerar sparat försök, belopp, valuta, referens, miljö och merchant innan hela batchen lagras i inbox. Unikt `(provider,event_id)` gör återleverans säker. Först därefter returneras HTTP 200. Ogiltigt bevis får 400; databasfel får 500 och måste återlevereras.

Webhooken väntar inte på orderbehandling, e-post eller push. En worker med lease behandlar inboxen senare och använder befintlig notifierings-outbox. Kvittensen betyder beständig mottagning, inte mänsklig kökskvittering eller garanterad notifieringsleverans. [Adyens webhookhantering](https://docs.adyen.com/development-resources/webhooks/handle-webhook-events)

Stödd eventlista är `AUTHORISATION`, `CAPTURE`, `CAPTURE_FAILED`, `REFUND`, `REFUND_FAILED`, `REFUNDED_REVERSED`, `CHARGEBACK`, `SETTLED_REVERSED`. Andra event avvisas och kräver explicit kontrakt/hanterare innan prenumeration utökas. Prenumerationen och leverantörens eventaktivering ska granskas i sandbox före drift. Ett okänt event tappas inte tyst med en lyckad kvittens.

Inboxen sparar signaturverifierade referenser och belopp, utan råkortdata, kundnamn, e-post, privata ordertoken, URL:er eller råa sessionResult. Eventtid från osignerat `eventDate` används inte som betalningsbevis; `occurred_at` är serverns mottagningstid. Felmeddelanden/loggar innehåller inga råa leverantörssvar. Service-role begränsar åtkomst, och externa loggar ska maskera token och betalningssessioner. Ekonomiska referenser och bokföringsbevis behöver en företagsgodkänd retention; för lokal testdata gäller radering med den isolerade testmiljön. Föreslagen operativ retention för färdigbehandlad inbox är 90 dagar och felkö tills ärendet lösts. Schemalagd gallring och juridiskt fastställd bokföringsretention är inte aktiverade genom denna kod.

## Ekonomiska steg

| Bevis | Betydelse och kodens policy |
| --- | --- |
| Lyckad `AUTHORISATION` | Auktorisering. Befintlig affärsstatus `paid` används för orderbekräftelse endast under den uttryckliga förutsättningen om omedelbar automatisk capture. Detta är inget bevis på utbetalning. |
| Lyckad `CAPTURE` | Capturebegäran godkänd/vidarebefordrad; senare fel kan fortfarande inträffa. En separat webhook krävs inte när leverantören inte skickar den i automatisk capture. |
| `CAPTURE_FAILED`, chargeback, reversering eller refundfel | Bestående avvikelse och spärr för ny betalning/automatisk normalisering. Äldre authorisation får inte radera avvikelsen. |
| Refund-API med `received` | Begäran mottagen, fortfarande väntande. Endast verifierat refundevent bekräftar återbetalning. |
| Utbetalnings-/avstämningsrapport | Separat bevis för utbetalning och bokföring. Hämtas inte genom ett generiskt payment-GET. Automatisk rapportimport är inte implementerad. |

Adyen skiljer auktorisering, capture och senare capturefel. Omedelbar automatisk capture ger normalt ingen separat `CAPTURE`-webhook. Nuvarande adapter stöder bara denna capturepolicy; manuell eller fördröjd capture kräver en separat beslutad implementation och nya tester. Kontrollera både ursprungligt merchant-konto och metodens kontrakt innan policyn aktiveras. [Adyen capture](https://docs.adyen.com/online-payments/capture/)

## Återkommande kontroll

Bakgrundsjobbet väljer förfallna oklara försök och använder `reconcileExistingPayment` i `payments/service.ts`. Funktionen är läsande: den kan varken skapa en debitering, begära refund, lösa en avvikelse eller släppa kapacitet. Publik statusläsning hämtar enbart serverns sparade orderstatus och kör ingen leverantörspollning.

För befintliga Pay by Link-försök används dokumenterade `GET /paymentLinks/{linkId}` för länkmetadata. Belopp, valuta, merchant, miljö och referens måste fortfarande matcha det sparade försöket. `active` eller `paymentPending` planerar ny kontroll om fem minuter. `expired`, `completed` eller `paid` leder till manuell avstämning/webhookåterleverans, utan att statusen tolkas som bevis för obetalt eller som ny verifierad betalning. [Pay by Link API](https://docs.adyen.com/unified-commerce/pay-by-link/create-payment-links/api/)

Hosted Checkout har ett annat sessionskontrakt. Resultatet från `/sessions/{id}?sessionResult=...` förändras inte och får inte användas för återkommande betalningsstatusfrågor. Den gemensamma hjälpfunktionen spärrar uttryckligen sådana försök från pollning. En framtida Hosted Checkout-adapter måste använda webhook och dokumenterad rapport-/Customer Area-process för ekonomisk avstämning. [Hosted Checkout – resultat](https://docs.adyen.com/standard/integration/hosted-checkout)

Timeout, 404, stängd kundsida eller utebliven callback planerar ny kontroll, inte en ny debitering. Efter 24 timmar föreslås manuell avstämning. HTTP 429 respekterar ett begränsat Retry-After (minst fem minuter, högst ett dygn). Tiderna är konservativa startvärden för test och måste beslutas för driften. Saknad eller avvikande kontosnapshot ger omedelbar manuell spärr utan nätverksanrop. Sen verifierad betalning ska bevaras även om kapaciteten redan är upptagen; köket måste ordna ny överenskommen tid eller behörigt initierad korrekt återbetalning.

Ett försök sparar order/prisrevision, belopp/valuta, leverantör/miljö/merchant, referenser, idempotensnyckel, senaste verifierade event, senaste kontroll, nästa kontroll och avvikelseorsak. Leasen och transaktionerna beskrivs i `BACKGROUND_JOBS.md`. Färdigt jobb betyder genomförd kontroll, inte automatiskt löst ekonomiskt ärende.

## Gamla försök och miljöbyte

`PAYMENTS_ENABLED=false` och återkallat nybetalningsgodkännande stoppar nyutfärdning, men låser inte HMAC-verifiering eller autentiserad GET för gamla referenser. API-nyckel behövs för läsningen; HMAC krävs för webhook. Nycklar ska vara miljöspecifika och hållas i serverns skyddade hemlighetslager, aldrig i chatt/GitHub.

En nuvarande konfigurationsuppsättning används per backend. Det finns ingen automatisk fallback som provar gamla referenser med ett annat merchant-konto. Vid byte behålls en säkert konfigurerad verifieringsprocess för det ursprungliga kontot/miljön tills väntande försök är avstämda, eller håll nyutfärdningen avstängd i samma miljö. Att starta en sådan extern process kräver identifierad hosting och godkännande. Fel konto/miljö ger manuell spärr, inte en tyst omtolkning. Test och live får aldrig blandas genom att bara ändra en miljövariabel mot samma databas.

Historiska försök utan merchant-snapshot avvisas av inboxen. En behörig operatör måste först verifiera ursprungligt konto mot leverantörens referenser och dokumentera en kontrollerad backfill i rätt databas. Dagens miljövariabler är inte bevis för historiskt konto. Ingen sådan produktionsändring har gjorts här.

## Manuell rutin och återställning

1. Pausa nyutfärdning; behåll verifieringscredentials och inkommande inbox. Kontrollera rätt konto och miljö innan felsökning.
2. Läs det sparade försöket och avvikelsen med behörigt service-/adminverktyg. Jämför exakt merchant, orderreferens, prisrevision, belopp, valuta och PSP-referens med Customer Area och relevant rapport.
3. Be leverantören återleverera saknade signerade event när det stöds. Inboxens dubblettkontroll bevarar idempotens. Ett API-timeout i skapande/refund återförsöks bara inom dokumenterad idempotensperiod med samma sparade nyckel och begäran.
4. Vid bestående avvikelse: dokumentera underlag och behörig ekonomiansvarigs beslut. Ny betalning, ny kapacitetsreservation eller avspärrning får inte improviseras som kompensation för en saknad callback.
5. Rätta orsaken till felkö, kontrollera senaste jobbkörning och återuppta en kontrollerad återleverans. Använd aldrig en gammal workerlease efter omstart; worker måste göra nytt claim.
6. Återuppta nya order först när konton, inbox/outbox, kökshälsa och eventuell ändrad tid är verifierade. Säker rollback stänger nyutfärdningen men fortsätter verifiera redan gjorda försök.

Adyen dokumenterar minst sju dagars idempotenslagring; nuvarande kod stoppar tvetydiga skapande-/refundreplays efter sex dagar. Detta är inte en allmän regel för andra leverantörer eller varje Swishoperation. [Adyen API idempotency](https://docs.adyen.com/development-resources/api-idempotency/)
