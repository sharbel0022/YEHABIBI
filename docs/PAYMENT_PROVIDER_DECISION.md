# Betalningsleverantör – beslut saknas

Granskad 2026-10-19. Företaget har Swish, men bank, Swishprodukt, integratör och vald leverantör är inte identifierade. Inget nytt konto eller betalningsavtal har anslutits. Inga riktiga betalningar har genomförts. **Extern huvudkassa är blockerad tills företaget väljer integrationsspår och godkänner konton, kostnader och tester.**

## Bedömning

| Spår | Företag och Swish | Metoder och teststöd | Drift och avstämning | Kostnad och beslut |
| --- | --- | --- | --- | --- |
| A. Adyen Hosted Checkout | Företagsägt merchant-konto, onboarding och roller för API/webhook. Befintligt Swishavtal innebär inte att Adyen är godkänt. Kontrollera aktivering på just merchant-kontot. | Dokumentationen listar Swish, kort, Apple Pay och Google Pay. Varje metod måste aktiveras och provas på rätt konto och kundplattform. | En server och webhook-inbox kan användas. Checkout API v72 eller senare, separata sessionskontrakt och webhookflöde. Rapporter/Customer Area krävs vid oklara ekonomiska utfall. | Offert och skriftligt konto-/metodgodkännande krävs. Befintlig adapter är inte denna integration. |
| B. Nexi Checkout | Utred först om företagets bank och Swishavtal passar. Nexi anger att Swish kräver avtal med banken och onboarding/aktivering. | Stöd finns för Swish, Visa/Mastercard, Apple Pay och Google Pay. Dokumenterad testbarhet skiljer sig mellan metoder. | Ny adapter först efter val. Gemensam inbox/outbox återanvänds; Nexis egna betalnings-, webhook- och rapportkontrakt måste verifieras. | Offert krävs för konto, metoder och volym. Bankkompatibilitet kan göra detta enklare; det är ännu en bedömning, inte ett valt avtal. |
| C. Direkt Swish Handel + separat kortleverantör | Kräver uttryckligt beslut om Swish Handel och vem som driver integrationen. Uppgiften ”har Swish” är otillräcklig. Separat e-handelsavtal för kort behövs. | Swish är en egen bankbetalning. Kort, Apple Pay och Google Pay måste hanteras av vald kortleverantör. | Högre driftansvar: certifikat/mTLS, förnyelse, callback, status och två avstämningsvägar. Implementeras endast om nyttan motiverar detta. | Två offerter och ansvarsfördelning krävs. Inga nya integrationssystem har byggts för detta alternativ. |

Adyen avråder uttryckligen från Pay by Link som enda betalsätt för en webbutik. Den befintliga `/paymentLinks`-adaptern får därför bara övervägas som kompletterande cateringflöde efter separat beslut. Den är spärrad för riktiga direktorder. [Adyen Pay by Link](https://docs.adyen.com/unified-commerce/pay-by-link/)

Adyens aktuella Hosted Checkout använder `/sessions`, `mode: hosted`, `themeId` och Checkout API v72+. Äldre adapter behåller v71 för befintliga Pay by Link-referenser. Den byter inte tyst API-kontrakt eller URL-tillåtelselista. En framtida implementation behöver egna kontraktstester för de adresser som returneras av det dokumenterade Hosted Checkout-kontraktet. Returparametrar utgör aldrig ekonomisk bekräftelse. För mobilflödet rekommenderas SFSafariViewController respektive Chrome Custom Tabs. [Hosted Checkout](https://docs.adyen.com/standard/integration/hosted-checkout)

Nexis metodlista kräver aktivering och tar hänsyn till land och valuta. Swishavtalet måste kontrolleras med banken. [Betalningsmetoder](https://developer.nexigroup.com/nexi-checkout/en-EU/docs/payment-methods/), [Swish hos Nexi](https://developer.nexigroup.com/nexi-checkout/en-EU/docs/swish/)

Nexis aktuella testmatris markerar Swish, kort och Google Pay som testbara, men Apple Pay som ej testbar. Detta innebär en blockerad sandboxpunkt tills Nexi bekräftat en godkänd testväg; den ersätts inte automatiskt av ett köp med riktiga pengar. [Nexi Test and Deploy](https://developer.nexigroup.com/nexi-checkout/en-EU/docs/test-and-deploy/)

Direkt-Swish-portalen kräver JavaScript och det fullständiga operationskontraktet kunde inte verifieras med läsverktyget. Före eventuell implementation ska aktuella versioner för payment-request och refund, mTLS, `callbackIdentifier`, statusfrågor och återförsök verifieras per operation. Ingen idempotensregel kopieras från Adyen till Swish. [Swish payment request v2](https://developer.swish.nu/api/payment-request/v2)

## Offertfrågor innan val

Begär ett skriftligt prisunderlag för fast kostnad, startavgift, eventuell minimifaktura, procentuell och fast transaktionsavgift per metod, valutaväxling, refund, chargeback, reserver/riskvillkor, utbetalningsintervall och avstämningsrapporter. Ange ordervolym, snittbelopp, största cateringbelopp och tid mellan betalning och leverans. Inga totalsummor eller avgifter i detta projekt är avtalsverifierade; alla dessa poster är **offertkrav**. Publik listprissättning bevisar inte företagets villkor. [Adyen pricing](https://www.adyen.com/pricing)

## Wallets och mobilmodell

Hostad webbkassa och native Apple Pay är olika modeller. Adyens Hosted Checkout använder Adyens Apple Pay-certifikat; en native iOS-integration behöver eget Apple Developer-konto, eget certifikat och tillhörande Merchant ID/entitlements. Ett Expo-skal som öppnar hostad webbkassa blir inte automatiskt native Apple Pay. Kräv endast domänverifiering, certifikat och entitlements som den valda modellen behöver. [Adyens integrationsjämförelse](https://docs.adyen.com/standard/integration/), [Apple Pay-certifikat](https://docs.adyen.com/payment-methods/apple-pay/apple-pay-certificate)

iOS ensamt bevisar inte Apple Pay-tillgänglighet. Metoder måste vara kontoaktiverade och tillåtna för miljö, SEK, belopp och kundens faktiska plattform. Den hostade leverantörssidan avgör slutlig wallet-tillgänglighet. Fysiska enheter och rätt testkonton behövs för verifiering; en lokal simulatorknapp bevisar bara Yehabibis affärsflöde. [Apple sandbox](https://developer.apple.com/apple-pay/sandbox-testing/), [Google Pay-checklista](https://developers.google.com/pay/api/web/guides/test-and-deploy/integration-checklist)

Kontant betalning kvarstår endast för hämtning enligt företagets inställning och kvitteras av behörig personal. Ingen extern session skapas. Klarna, faktura, delbetalning, abonnemang och sparade kort aktiveras inte.

## Spärrar i koden

`PAYMENTS_ENABLED=false` är normalvärdet. Befintlig real Pay by Link-utfärdning kräver dessutom `PAYMENT_INTEGRATION_APPROVED=adyen-pay-by-link-catering`, verifierad capturekonfiguration, konto, metoder och hemligheter; live kräver separat `PAYMENTS_LIVE_APPROVED=true`. Detta värde är en teknisk spärr och är inte i sig företagets godkännande. Lämna integrationens godkännandefält tomt tills ett faktiskt beslut har dokumenterats. Riktiga direktköp kan inte gå via denna adapter.

Verifiering av gamla försök är separat från nyutfärdning. Behåll säkra HMAC-/API-credentials för ursprungligt konto och miljö även under betalningsstopp. Läs `PAYMENT_RECONCILIATION.md` före miljö-/kontobyte. Råa kortnummer och CVC ska aldrig passera eller sparas i Yehabibi. Ingen egen BankID-inloggning byggs.
