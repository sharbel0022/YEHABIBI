# Betalningar i V4.2

Webb och Expo använder samma serverflöde för Stripe Checkout. V4.2 ändrar klienternas återanvändning och inför ingen separat native betalningsintegration. Orderbelopp kommer från databasen och sparas i heltalsöre.

## Från förfrågan till betald order

1. Kunden skickar en obetald förfrågan genom `api.createOrder` med en stabil återförsöksnyckel.
2. Servern beräknar priset mot aktuella data och sparar order/rader atomärt.
3. Ägaren granskar, godkänner, nekar eller lämnar ett förklarat prisförslag.
4. Ett prisförslag kräver kundens uttryckliga acceptans av exakt revision genom `api.acceptPriceChange`. Ursprungliga rader bevaras och en godkänd prisjustering redovisas separat.
5. Efter godkännande skapar servern Checkout och kopplar länken atomärt till rätt orderrevision/session.
6. Kunden öppnar serverns länk. Frontend hämtar sedan aktuell status och markerar aldrig själv onlinebetalningen betald.
7. En signerad webhook verifieras mot rätt order, belopp, SEK och session innan betalningsstatus uppdateras.

Orderstatus och betalningsstatus är separata fält. En godkänd order kan vara obetald. Onlineorder kräver betalning före förberedelse. Kontantorder kan förberedas före betalning vid hämtningen och ägaren registrerar pengarna när de tagits emot.

## Tillgängliga metoder

| Metod | Villkor i systemet |
| --- | --- |
| Kort | Serverns godkända Stripe-testmiljö, betalningar aktiverade och webhook konfigurerad |
| Apple Pay | Ingår i kort-Checkout när Stripe, enheten, webbläsaren och plånboken stöder det |
| Swish | Serverns `STRIPE_SWISH_ENABLED=true` och metoden aktiverad/verifierad för företagets Stripe-konto |
| Kontant | Företaget tillåter det och kunden väljer hämtning |

`/api/catalog` anger aktuella betalval. `availablePaymentMethods` i shared tillämpar samma kontantregel i webb och Expo. Ett önskemål i formuläret garanterar inte att en viss plånbok eller metod visas hos Stripe. Faktura, Klarna och delbetalning är inte implementerade.

Checkout-länken läses ur `PublicOrder` genom `getOrderStatus`. `canPayOrder` delar visningsregeln mellan plattformarna. Mobilen kontrollerar HTTPS och `checkout.stripe.com` innan betalningslänken öppnas i systemwebbläsaren. Inga kortuppgifter eller Stripe-hemligheter finns i API-klienten eller appen.

## Filer och skydd mot dubbel hantering

| Fil/funktion | Ansvar |
| --- | --- |
| `apps/web/src/lib/payments.ts` | Skapar och kontrollerar serverns Stripe-sessioner efter godkännande |
| `apps/web/src/lib/checkout.ts` | Återanvänder rätt öppen session och väljer idempotensnyckel för orderns revision |
| `apps/web/src/app/api/stripe/webhook/route.ts` | Verifierar signatur, belopp, valuta och session |
| `attach_catering_checkout` i SQL | Kopplar session bara om förväntad status/betalstatus/session fortfarande stämmer |
| `apply_stripe_event` och `payment_events` | Tillämpa en betalhändelse atomärt och avvisa fel session/dubbla händelser |
| `order_notifications`, `mailer.ts`, `push.ts` | Köa rätt besked atomärt och kvittera leverans separat |

Frontendens dubbeltrycksskydd kompletteras av databasens idempotens. En sen händelse får inte återställa `paid` till väntande eller misslyckad. Ett redan avstämt webhookevent är idempotent även efter sessionsbyte. En prisacceptans markerar inte ordern betald.

## Miljöer och verifiering

`PAYMENTS_ENABLED=false` stoppar nya sessioner. `STRIPE_LIVE_ENABLED=false` ska behållas tills separat produktionsgodkännande. Företagsägd Stripe-sandbox/testnyckel, signeringshemlighet och övriga serveruppgifter konfigureras enligt `apps/web/.env.example`. Den tidigare Stripe-miljön Quick match används inte enligt tidigare beslut.

När nya sessioner stängs av måste redan utfärdade sessioner fortfarande kunna stämmas av. Webhooken verifieras därför oberoende av spärren för att skapa sessioner. Livehändelser kräver fortfarande uttrycklig liveaktivering.

De lokala integrationstesterna använder isolerad databas och kontrollerad transport för externa tjänster. De kan bevisa kodens belopps-, signatur- och idempotensregler, men bevisar inte en verklig debitering, Swish, Apple Pay eller levererad e-post. Aktuellt testutfall finns i [TESTER.md](TESTER.md).

Före riktiga betalningar behöver företagets miljö verifiera lyckad/nekad betalning, avbruten/utgången Checkout, återbetalning, dubbla webhooks, Swish och Apple Pay på kompatibla fysiska enheter. En Expo-export, ett EAS-jobb eller en grön CI är inte ett sådant betalningstest. V4.2 aktiverar inga skarpa betalningar och ändrar inte befintliga kundbetalningar.
