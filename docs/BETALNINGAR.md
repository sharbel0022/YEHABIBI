# Betalningar – V4.3

Stripe är avvecklat som aktiv integration. V4.3 använder ett gemensamt serverkontrakt och en Adyen Pay by Link-adapter enbart för testmiljö. Inget merchant-konto är anslutet/godkänt här och inga livebetalningar aktiveras. Historiska order, betalningsreferenser och migrationer bevaras.

Den fullständiga installationsguiden, leverantörsjämförelsen, verifierade priser och aktuella primärkällor finns i [PAYMENTS_WITHOUT_STRIPE_V4_3.md](PAYMENTS_WITHOUT_STRIPE_V4_3.md). Faktiskt testutfall finns i [TESTER.md](TESTER.md).

## Efter ägargodkännande

Kunden skickar först en obetald förfrågan. Ägaren granskar och godkänner. Ett ändrat belopp sparas som ny revision och kräver kundens uttryckliga godkännande före betalning. Varken godkännande eller prisacceptans skapar automatiskt en extern session. Ägaren kan skicka betalningsbegäran med privat statuslänk; kunden väljer en tillgänglig metod där. Webb och Expo använder samma regler, API och databas.

`/api/catalog` visar bara serverns verifierade betalmetoder. Saknas aktiverad onlineleverantör erbjuds inte Swish/kort/plånböcker. Obetald förfrågan kräver företagets `allow_unpaid_requests`; kontant kräver hämtning och företagets kontantinställning.

| Metod | Villkor |
| --- | --- |
| Swish | Verifierat Adyen-testkonto med Swish för SEK/SE; leverantörens mobilväxling/desktop-QR |
| Visa/Mastercard | Aktiverad metod och säkert hostat formulär, inklusive 3D Secure/SCA när nödvändigt |
| Apple Pay | Aktiverat konto och Adyens certifikat för Pay by Link; hostad sida avgör enhets-/plånboksstöd |
| Google Pay | Aktiverat konto och registrerad hostad domän; stödd plattform/plånbok |
| Kontant | Endast hämtning, ingen extern session, obetald tills behörig ägare kvitterar pengar |

Klarna, faktura och delbetalning aktiveras inte.

## Servern avgör betalstatus

Ett beständigt betalningsförsök reserveras före leverantörsanropet. Samma försök/idempotensnyckel används vid timeout och låser metoden tills försöket avstämts. Backend skapar länken för orderns exakt godkända öresbelopp, SEK och revision. Kunden öppnar endast verifierad HTTPS-adress hos leverantören.

`/api/payments/webhook` verifierar Standard-HMAC och matchar konto, unik merchantreferens, PSP-referens, belopp och valuta innan SQL uppdaterar betalning/notifieringar atomärt. Osignerad metadata och kundens returlänk är aldrig betalningsbevis. GET på en genomförd betalningslänk sätter inte ensamt `paid`.

Adyen-kandidaten kräver verifierad **omedelbar automatisk capture** i testkontot. En signerad lyckad `AUTHORISATION` följer det dokumenterade Pay by Link-flödet; manual capture stöds inte av aktiveringspolicyn. Swish saknar separat capture. Senare capturefel, chargeback eller återförda medel ger ett avstämningsärende för ägaren.

Återbetalning kräver behörig admin, samma verifierade provider/transaction och ett beständigt återbetalningsförsök. API-svar `received` är väntande; leverantörshändelsen avgör status och sena refundfel kräver åtgärd. En gammal Stripebetalning får aldrig återbetalas genom Adyen.

## Kod och databas

`lib/payments/provider.ts` är serverkontraktet, `service.ts` hanterar försök/avstämning och `providers/adyen.ts` har testanrop/HMAC. De generiska `/api/payments/create`, `/status` och `/webhook` återanvänds av webb och Expo. `payment_attempts`, `payment_provider_events` och `payment_refunds` tillkommer additivt med RLS och begränsade serverrättigheter.

`PAYMENTS_ENABLED=false` stoppar nya betalningar. Tom `PAYMENT_PROVIDER` i konfigurationsmallen innebär avstängt läge. En redan utfärdad betalning måste fortfarande kunna stämmas av när nya betalningar stängs; rätt providerhemligheter får därför inte raderas innan alla försök är avstämda. Adaptern innehåller inga live-endpoints.

Lokala signerade testhändelser och kontrollerade HTTP-svar är simulerade leverantörer. Företagets riktiga sandbox, Resend-leverans och fysiska iPhone/Android återstår tills de verifierats separat. Grön CI, Expo-export eller EAS-bygge bevisar inte en betalning.
