# Betalningar i V4.1

Betalning kommer efter ägarens granskning. Alla belopp anges i heltalsöre och kommer från serverns databas; gamla orderrader ändras inte när katalogpriserna ändras.

## Flödet

1. Kunden skickar en obetald förfrågan med en återförsöksnyckel.
2. Ägaren granskar, godkänner, nekar eller lämnar ett förklarat prisförslag.
3. Ett prisförslag kräver kundens acceptans av exakt revision och belopp via den privata orderlänken. Ett gammalt förslag kan inte accepteras efter en ny ändring.
4. Först efter godkännande kan servern skapa Stripe Checkout. Kontantorder går aldrig till Stripe.
5. Kunden öppnar Checkout i systemwebbläsaren. Återkomsten hämtar aktuell orderstatus och markerar aldrig själv ordern betald.
6. Servern verifierar webhookens signatur, order, session, valuta och belopp. Händelse-ID förhindrar dubbel hantering.

Orderstatus och betalningsstatus är separata. En godkänd order kan fortfarande vara obetald. Förberedelse av en onlineorder kräver betalning; kontant vid hämtning kan förberedas innan ägaren registrerat mottagna pengar.

## Tillgängliga metoder

| Metod | Villkor |
| --- | --- |
| Visa/Mastercard | Stripe-konto, testnyckel och fungerande webhook |
| Apple Pay | Kort-Checkout, kompatibel enhet/webbläsare och tillgänglig plånbok |
| Swish | SEK och metoden aktiverad/stödd i Stripe-kontot |
| Kontant | Företaget tillåter det, enbart hämtning; ägaren registrerar mottagna pengar |
| Faktura | Reserverad framtida möjlighet för verifierade företag; inte aktiverad |

Stripe visar de metoder som faktiskt är tillgängliga. Ett önskemål i formuläret garanterar inte att Apple Pay eller Swish visas. Samma hostade Checkout fungerar från Expo och webb och undviker att en separat native PaymentSheet begränsar metodstödet. Inga kortuppgifter lagras i appen.

## Konfiguration och test

Använd en separat företagsägd Stripe-sandbox och testnyckel. Lägg nycklar endast på servern enligt `apps/web/.env.example`. `PAYMENTS_ENABLED=false` blockerar sessioner även om en nyckel råkar finnas; sätt true bara i den godkända testmiljön. `STRIPE_LIVE_ENABLED` ska förbli false tills företagets lansering godkänts separat. Sites bevarar båda spärrarna. Quick match-kontot används inte enligt användarens beslut.

`payments.ts` skapar sessionen, `checkout.ts` återanvänder en öppen session och `api/stripe/webhook/route.ts` tar emot beviset. Utgången session ger failed; en ny verifierad session kan därefter skapas. SQL låser och kontrollerar ändringen atomärt så sena händelser inte kan återställa betald status till väntande. En redan avstämd webhook är idempotent även efter sessionsbyte. Alla besked köas atomärt och kvitteras per mottagare; ordern försvinner inte vid mejlfel.

Om nya betalningar stängs av med `PAYMENTS_ENABLED=false` måste redan utfärdade sessioner fortfarande kunna stämmas av. Webhooken verifierar därför signaturen direkt med SDK:t och sin signeringshemlighet, oberoende av spärren för att skapa sessioner. Livehändelser kräver fortfarande uttrycklig liveaktivering. Detta kontrolleras genom serveromstart med spärren avstängd i det isolerade testet.

Lokala tester använder riktig PostgreSQL/PostgREST och Stripe-SDK:ns signaturverifiering men en separat HTTP-testtransport för Stripe och Resend. De verifierar kodens flöde, inte ett verkligt Stripe-konto, Swish, Apple Pay eller levererad e-post. Externa tester är fortfarande blockerade tills företagskontona konfigurerats.

Före skarp drift: verifiera lyckad/nekad betalning, avbruten och utgången Checkout, Swish, Apple Pay på riktig enhet, dubbla webhooks, återbetalning och kontanter i företagets miljö. Automatiska lokala tester ersätter inte detta. Se [TESTER.md](TESTER.md).

Officiella referenser: [Checkout](https://docs.stripe.com/payments/checkout), [Swish](https://docs.stripe.com/payments/swish/accept-a-payment?payment-ui=checkout), [Apple Pay](https://docs.stripe.com/apple-pay), [webhooks](https://docs.stripe.com/webhooks).
