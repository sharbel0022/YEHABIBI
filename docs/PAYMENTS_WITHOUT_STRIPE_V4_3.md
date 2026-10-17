# YEHABIBI V4.3 – beställningar och betalningar utan Stripe

Underlag kontrollerat 2026-10-17. **Adyen Pay by Link är integrationskandidaten i koden. Inget företagskonto har valts, anslutits eller godkänts för skarpa betalningar.** Standardläget är avstängt och adaptern använder enbart Adyens testmiljö. Direkt Swish Handel och Nexi Checkout är utvärderade alternativ; de är inte implementerade adaptrar i denna version.

En byggd integration och ett godkänt lokalt HTTP-/databastest bevisar inte en verklig sandboxbetalning. Företagets Adyen-konto, Swish, Apple Pay, Google Pay, verklig Resend-leverans och fysiska iPhone-/Android-prov återstår tills konton och behörigheter finns. Läs [TESTER.md](TESTER.md) för faktiskt körda kontroller. Livebetalningar är spärrade i koden.

## Varför Adyen utvärderas först

Adyen dokumenterar Swish i SEK med appväxling på mobil och QR på dator. Metoden stöder återbetalningar men ingen separat capture. [Adyens Swish-dokumentation](https://docs.adyen.com/payment-methods/swish/).

Pay by Link dokumenterar Swish, Apple Pay och Google Pay för länkar skapade genom API. Varje metod måste först läggas till på rätt merchant-konto. Apple Pay kräver **Adyens Apple Pay-certifikat** för just Pay by Link. Google Pay kräver att `eu.adyen.link` registreras som stödd domän i Google Developer Console. [Metodmatris för Pay by Link](https://docs.adyen.com/unified-commerce/pay-by-link/supported-payment-methods).

Visa och Mastercard erbjuds i Sverige och stöder SEK. Apple Pay och Google Pay använder det bakomliggande kortets betalning. [Visa](https://www.adyen.com/sv_SE/betalningsmetoder/visa), [Mastercard](https://www.adyen.com/sv_SE/betalningsmetoder/mastercard), [Apple Pay](https://www.adyen.com/sv_SE/betalningsmetoder/apple-pay), [Google Pay](https://www.adyen.com/sv_SE/betalningsmetoder/google-pay).

En hostad betalsida passar projektets befintliga webb och Expo: servern skapar länken och kunden betalar hos leverantören i webbläsaren. Råa kortnummer, CVC och plånbokstoken behöver inte passera Yehabibis backend. Företagets avtal, kontoåtkomst, captureinställning och varje metod måste ändå verifieras. Adyens dokumentation bevisar produktstöd, inte att just Cedar Mezze blir godkänt eller att en viss metod redan är tillgänglig.

## Leverantörsjämförelse och verifierade kostnader

Beloppen nedan återger offentliga prisuppgifter utan valutaomräkning. De är inget avtal, ingen offert och ingen fullständig totalkostnad. Företaget ska begära skriftliga villkor för bransch, volym, utbetalning, återbetalning, chargeback, moms, bindningstid och eventuell minsta faktura. Bankpaket, hosting, e-post, utvecklarkonton och integrationsarbete kan tillkomma.

| Alternativ | Offentlig transaktionskostnad | Fast kostnad och krav | Bedömning |
| --- | --- | --- | --- |
| Adyen Swish | `€0.11 + 0,60 % + 2 SEK` enligt den svenska produktsidan | Adyens globala pris-FAQ anger ingen vanlig start-/månads-/integrations-/avslutsavgift men **minsta faktura beroende på bransch eller affärsmodell**. Beloppet är inte offentligt verifierat för detta företag. | Samma hostade flöde som kort/plånböcker. Företagets tillgång måste bekräftas av Adyen. [Swishpris](https://www.adyen.com/sv_SE/betalningsmetoder/swish), [prisvillkor](https://www.adyen.com/pricing). |
| Adyen Visa/Mastercard | `€0.11 + Interchange++`, med offentligt angivet Adyen-påslag `0,60 %`. Interchange och kortnätverksavgifter varierar. | Samma offert/minimifaktura som ovan; ingen generell procentsats kan användas som företagets slutliga kortkostnad. | 3D Secure och återbetalning dokumenteras. [Visa](https://www.adyen.com/sv_SE/betalningsmetoder/visa), [Mastercard](https://www.adyen.com/sv_SE/betalningsmetoder/mastercard). |
| Adyen Apple Pay/Google Pay | `€0.11 + avgiften för kortet som används` på respektive svensk produktsida | Merchant- och metodaktivering, plånbokens tekniska krav samt ovanstående kommersiella villkor. | Ingen separat påhittad plånboksprocent. [Apple Paypris](https://www.adyen.com/sv_SE/betalningsmetoder/apple-pay), [Google Paypris](https://www.adyen.com/sv_SE/betalningsmetoder/google-pay). |
| Direkt Swish Handel genom Swedbank, prisexempel | `3 kr/betalning` | `50 kr/månad/Swishnummer`, `1 000 kr` uppläggningsavgift per nummer enligt bankens tabell. Företagskonto, avtal och teknisk integration krävs. Övriga bank-/återbetalningsavgifter ska banken bekräfta. | Ett verkligt publicerat bankexempel, inte företagets bankval eller prisgaranti. [Swedbanks prislista på produktsidan](https://www.swedbank.se/foretag/betala-och-ta-betalt/swish.html). |
| Direkt Swish Handel genom Handelsbanken, prisexempel | `1,95 kr/transaktion` | `85 kr/månad` enligt produktsidan. Uppläggning och alla övriga kostnader är inte fullständigt verifierade här; be om offert. | Banken beskriver API-återrapportering och avtal via bankkontor/internetbank. Blanda inte ihop priset med Swish Företag. [Handelsbanken](https://www.handelsbanken.se/sv/foretag/konton-betalningar/ta-betalt/swish-for-foretag). |
| Nexi Checkout, tidigare Nets Easy | Svenskt bindande belopp ej verifierat. Officiella svenska sidan beskriver månadsavgift + procent + fast transaktionskostnad. | Begär svensk offert, inlösenavtal, aktiverade kort/plånböcker och bankens Swish Handel-avtal om Swish används. | Trovärdigt reservspår för kort/plånböcker med hostad checkout och mobilt SDK. Utländska eller gamla prislistor används inte som svenska priser. [Svensk prisstruktur](https://ecom.nets.eu/sv/hustle-less-sell-more/), [integrationer](https://developer.nexigroup.com/nets-easy/en-EU/docs/). |

Adyen tar enligt sin fakturaguide processingavgifter även vid betalnings-/återbetalningsbegäran; ytterligare refund-, scheme- och andra produktavgifter kan förekomma. Anta därför inte att avbrutna försök eller återbetalningar är kostnadsfria. De exakta avtalsbeloppen måste bekräftas. [Adyens fakturaavgifter](https://help.adyen.com/knowledge/finance/invoices/what-are-the-fees-on-my-invoice/).

Ingen verifierad leveranstid för kontoöppning finns för cateringföretaget. Bedömningen är att befintlig Adyen-adapter kräver minst ytterligare kodarbete, Nexi kräver en ny adapter och direkt Swish dessutom certifikatdrift och separat kort-/plånboksleverantör. Detta är en teknisk jämförelse av arbetsomfattning, ingen tidsutfästelse.

### Vad som måste kontrolleras före ett leverantörsval

Företaget behöver få skriftligt svar om juridisk enhet, organisationsnummer, verkliga huvudmän/firmatecknare, identifiering, verksamhet/catering, försäljningsländer, orderbelopp, förskottsbetalning före leverans, bankkonto och förväntad volym. Kontrollera att verksamheten accepteras och be om hela prisbilagan inklusive minsta faktura. [Adyens begränsade/förbjudna verksamheter](https://www.adyen.com/legal/list-restricted-prohibited) och [pris-FAQ](https://www.adyen.com/pricing).

Den tidigare direktlänkade Adyen-sidan `get-started-with-adyen/application-requirements` gav 404 vid kontrollen, även när länken följdes från Adyens egen standardguide. Detaljerade aktuella ansökningskrav behöver därför hämtas från Adyens kontaktperson/kontoansökan. Inga krav eller godkännande har hittats på.

### Reservspår: direkt Swish Handel + Nexi Checkout

Vanlig Swish Företag, en statisk QR-kod och ett Swishnummer ger inte den automatiska, orderbundna verifiering som krävs här. Direktflödet ska baseras på **Swish Handel**, bankens avtal/nummer och Swish API med servercertifikat. Kundens kortnummer ska fortfarande hanteras hos en kortleverantör.

Swish dokumenterar PUT v2 för nya betalningsbegäranden, HTTPS-callback, unik `instructionUUID`, betalningsreferens och belopp i SEK. `callbackIdentifier` bör vara en ny hemlig UUID per begäran och ska valideras; det är inte en HMAC-signatur. Vid en framtida direktadapter ska backend även läsa betalningsstatus med certifikatautentiserat API och kontrollera orderreferens, mottagare, belopp, SEK och `PAID` innan ordern betalas. [Swish Payment Request API](https://developer.swish.nu/api/payment-request/v2?trk=public_post_comment-text).

Swish anger att nya create payment/refund-anrop ska använda v2; v1 create avvecklades 2026-01-01. GET/PATCH använder fortfarande v1 enligt referensen. Serverns truststore/certifikat ska följa aktuell kedja och inte kopieras från gamla bloggar. MSS är en leverantörssimulator; ett MSS-svar bevisar inte betalning via riktig bank/BankID. [Swish ändringslogg](https://developer.swish.nu/changelog).

Nexi dokumenterar Swish i SE/SEK, återbetalning och delåterbetalning men kräver Swishavtal med företagets bank och onboarding. Det kravet ska inte automatiskt överföras till Adyens avtalsmodell. [Nexi Swish](https://developer.nexigroup.com/nexi-checkout/en-EU/docs/swish/).

Nexis Apple Pay stöder hostad checkout och Visa/Mastercard, återbetalning och domänverifiering för inbäddad checkout; rätt konto, kort och kompatibel enhet krävs. Nexi Google Pay dokumenterar hostad checkout, Visa/Mastercard och endast stödda plattformar. Den offentliga testmatrisen markerar Apple Pay som **inte testbar**, medan Google Pay, kort och Swish anges testbara. Detta måste utredas före val; inget fullständigt Nexi-sandboxtest utlovas. [Apple Pay](https://developer.nexigroup.com/nexi-checkout/en-EU/docs/apple-pay/), [Google Pay](https://developer.nexigroup.com/nexi-checkout/en-EU/docs/google-pay/), [testmatris](https://developer.nexigroup.com/nexi-checkout/en-EU/docs/test-and-deploy/).

## Ett gemensamt flöde

1. Webb/Expo läser samma `/api/catalog`, menypriser och inställningar genom `packages/api-client` och `packages/shared`.
2. Kunden skickar en förfrågan med datum, hämtning/leverans och kontakt. Servern räknar orderraderna i öre mot databasens priser och skapar en obetald order atomärt.
3. Ägaren godkänner eller nekar. En ändrad totalsumma sparas som prisrevision och kräver kundens uttryckliga acceptans innan betalning. Godkännande och prisacceptans skapar ingen automatisk extern session. Ägaren kan skicka betalningsbegäran med privat statuslänk.
4. Endast en metod som servern verifierat och företaget aktiverat får användas. Onlinebetalning kräver rätt godkänd revision och ett serverreserverat betalningsförsök.
5. Kunden väljer metoden på sin statusvy och initierar betalningen. Backend skapar en orderbunden Adyen-länk med exakt belopp, SEK, SE, tillåten metod och en beständig idempotensnyckel. Kunden öppnar länken i webbläsaren.
6. Backend tar emot autentiserad leverantörshändelse, kontrollerar konto, unik referens, belopp och valuta samt avstämmer i samma databas som ordern.
7. Webb och Expo visar samma serverbekräftade status. Kund/ägare får besked genom befintlig beständig notifieringskö.

Om inga onlinebetalningar är verifierade visas de inte som betalval. En obetald förfrågan kräver företagets uttryckliga orderinställning och godkänd rutin. Kontant erbjuds bara vid hämtning när företaget tillåter det; ingen extern session skapas och bara behörig ägare får registrera mottagna pengar.

### Swish i kandidaten

Servern väljer `swish`; Adyens hostade sida hanterar mobilväxling och desktop-QR. Yehabibi bygger inte en egen statisk betalnings-QR och tolkar inte kundens skärmbild som bevis. Företagets merchant-konto måste kunna erbjuda Swish för SEK/SE; saknas verifierad åtkomst är metoden avstängd.

### Apple Pay, Google Pay och kort

Pay by Link gör plånboks-/enhetskontrollen på leverantörens sida. En aktiverad kontometod är inte ett löfte att plånboken kan användas på alla telefoner. Webb/Expo ska inte öppna en egen låtsasbetalningsruta. Kort hanteras i Adyens hostade formulär, där 3D Secure/SCA kan genomföras. Bara Visa/Mastercard är avsedda i denna version; Klarna, faktura och delbetalning aktiveras inte.

För **Adyen Pay by Link** används leverantörens Apple Pay-certifikat. Ett eget Apple Merchant ID/certifikat är alltså inte automatiskt ett krav i den här hostade modellen. Om integrationen senare ändras till egen webbsida eller native Apple Pay ska Merchant ID, processingcertifikat, eventuell merchant identity, domänverifiering och entitlements konfigureras enligt leverantörens då aktuella instruktioner. [Adyens Apple Pay-certifikat](https://docs.adyen.com/payment-methods/apple-pay/apple-pay-certificate/).

Google Pay ska aktiveras för rätt merchant-konto och hostad domän. Ett eventuellt eget Merchant ID/Google Pay Business Console-godkännande måste följa den valda integrationen, inte läggas in på chans. Fysisk iPhone för Apple Pay och fysisk Android med kompatibel Google Pay-plånbok ingår i den kvarvarande acceptansen.

## Serververifiering och fel

Standardwebhooks verifieras med Adyens dokumenterade HMAC-SHA256-kanonisering och serverns webhooknyckel. Konto, orderbunden merchantreferens, PSP-referens, SEK och heltalsbelopp ingår i kontrollen. Osignerad metadata, `paymentMethod`, kundens returlänk och en öppnad betalsida är inte betalningsbevis. [Adyens HMAC-guide](https://docs.adyen.com/development-resources/webhooks/secure-webhooks/verify-hmac-signatures/).

För Pay by Link beskriver Adyen `AUTHORISATION` med `success=true` som lyckad kundbetalning och säger att ordern kan fortsätta; separat capture krävs om manual capture är aktiverat. Därför ska kandidaten användas enbart med **verifierad omedelbar automatisk capture**. Swish stöder ingen separat capture. Automatiskt omedelbara captures skickar normalt ingen separat `CAPTURE`-webhook. Kontoinställningen måste bekräftas i företagets testmiljö och kan inte bevisas av en miljövariabel. [Pay by Link-resultat](https://docs.adyen.com/unified-commerce/pay-by-link/create-payment-links/api), [capturebeteende](https://docs.adyen.com/online-payments/capture/).

Adaptern skickar uttryckligen `manualCapture:false` och `captureDelayHours:0`. Dessa fält finns i Adyens officiella Checkout v71-schema. Kortlänken begränsas till `visa`/`mc`; metoderna i övrigt är `swish`, `applepay`, `googlepay`. Efter skapandet läses länken med autentiserad GET och valideras mot det reserverade försöket. `url`, `status`, `merchantAccount`, belopp och referens stöds av responsschemat. Schemat innehåller också status `paid`, vilket behandlas som ett slutet resultat som inväntar webhook, inte som en rätt att skapa ny debitering. [Officiellt Adyen OpenAPI v71](https://github.com/Adyen/adyen-openapi/blob/main/json/CheckoutService-v71.json).

`paid` betyder verifierat lyckat betalningsresultat enligt leverantörens flöde, inte bevis på slutlig bankavräkning utan möjlighet till senare avvikelse. Capturefel, återförda medel och chargebacks sätter ett avstämningskrav som blockerar förberedelse, återbetalning och nya försök. Kontrollera utbetalnings-/settlementrapporten vid ekonomisk bokföring.

Återbetalning är asynkron. Ett API-svar `received` betyder bara mottagen begäran. `REFUND success=true` betyder lyckad validering/vidarebefordran och kan följas av `REFUND_FAILED` eller `REFUNDED_REVERSED`; ägaren måste då åtgärda avvikelsen. Full återbetalning får först `payment_refund_status=confirmed`; ett senare fel ger `needs_review` och tydlig varning medan historisk `refunded` bevaras. En återbetalning får inte bekräftas av ett knapptryck i admin. [Återbetalningssemantik](https://docs.adyen.com/online-payments/refund/).

Betalningsförsöket reserveras i databasen före leverantörsanropet. Ett timeout-/processavbrott återanvänder samma försök, metod och idempotensnyckel; ett oklart resultat får inte automatiskt skapa en andra debitering. Dubbla händelser tillämpas en gång. Sena negativa händelser återställer inte en betald order utan uttrycklig avvikelsehantering. En utgången länk eller ett osäkert läge kräver avstämning innan ett nytt försök öppnas. En sen verifierad lyckad betalning kan lösa ett avstämningskrav som endast gällde länkens utgång.

## Databas och historik

V4.3 lägger till en separat tilläggsmigration; den befintliga kedjan och tidigare order/prisrevisioner finns kvar. Orderstatus hålls separat från `payment_status`: `unpaid`, `pending`, `paid`, `failed`, `refunded`.

| Datadel | Ansvar |
| --- | --- |
| `orders` | Orderns godkända belopp/revision, aktuell betalstatus och begränsade publika referenser |
| `payment_attempts` | `provider`, `order_id`, `amount_ore`, SEK, metod, prisrevision, unik providerreferens/idempotensnyckel, hostad länk och leverantörens betalnings-id |
| `payment_provider_events` | Verifierade leverantörshändelser och unik idempotens per händelse |
| `payment_refunds` | Beständigt återbetalningsförsök och asynkron status |
| `order_notifications` | Samma beständiga kund-/ägarbesked som övriga orderflödet |
| Äldre Stripefält/`payment_events` | Historiska betalningsreferenser som bevaras; de är inte en aktiv integration |

Fältnamn och RPC:er ska läsas mot den faktiska migrationen `supabase/migrations/20261017203703_generic_payments_without_stripe_v43.sql`; de nya fälten ersätter inte historiska orderrader. Det finns ingen destruktiv rensning av gamla kundbetalningar.

Betaltabellerna ska ha RLS och explicita serverrollsbehörigheter. RPC:er använder `SECURITY INVOKER` med körningsrättighet enbart för `service_role`; det är server-API:t som verifierar admin eller privat kundtoken. Att en funktion är invoker innebär inte automatiskt att vem som helst ska få anropa den. [Supabase funktionsrättigheter](https://supabase.com/docs/guides/database/functions).

Supabases [changelogindex](https://supabase.com/changelog.md) lästes vid arbetet. Följande aktuella förändringar berör installation/drift:

- Nya `public`-tabeller behöver explicita GRANT även till serverrollen; RLS och SQL-rättigheter är skilda kontroller. Kontrollera migrationen i en ny testdatabas med begränsade standardrättigheter. [Ändrad Data API-exponering](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
- Äldre TLS 1.2-chiffer stängs enligt ändringsloggen 2026-11-10. Använd projektets moderna Node 22+ och verifiera den faktiska hostens HTTPS-anrop. [TLS-förändring](https://supabase.com/changelog/cbc-tls-ciphers-deprecated).
- PostgreSQL 15.19/17.11 har särskilda åtgärder för vissa extensioner/äldre pgcrypto-PGP-chiffer. Projektets nya betalningskod använder inga sådana PGP-krypteringsanrop; befintlig företagsdatabas måste ändå inventeras före uppgradering. [Databasrelease](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).

Ingen migration har här körts i ett oidentifierat fjärrprojekt. Supabase Auth/Storage och advisors måste verifieras i företagets godkända testprojekt före aktivering.

## Säker installation i rätt ordning

1. Företaget godkänner juridiskt namn, organisationsnummer, kontakt, bankkonto, riktiga produktpriser i öre, allergener, portionsstorlekar, hämtadress, leveranszoner och villkor.
2. Identifiera företagets egen backend/HTTPS-domän och separata utvecklings-, test- och produktionsmiljöer. Alla klienter i samma miljö pekar på samma API/databas.
3. Skapa/verifiera företagets Supabase Auth, PostgreSQL och `catering-media` Storage. Ta backup och tillämpa endast saknade migrationer i ordning. Bjud in/bekräfta admin och ange `ADMIN_EMAILS`. Testa obehörig orderläsning och uppladdning.
4. Företaget granskar offerter och godkänner leverantör. Anslut inget merchant-konto i detta steg utan ägarens uttryckliga beslut. Dokumentera tillgång till Swish, Apple Pay, Google Pay, Visa/Mastercard och SEK.
5. Efter beslut: konfigurera en **företagsägd testmiljö**, API-nyckel med minsta nödvändiga rättigheter och rätt merchant account. Lägg till önskade metoder, Pay by Link-villkor, Adyens Apple Pay-certifikat och Google Pay-domänen. Bekräfta omedelbar automatisk capture hos Adyen.
6. Lägg serverhemligheterna i hostingens godkända secret-hantering. Kopiera bara variabelnamnen från `apps/web/.env.example`; lämna produktionsbetalningar avstängda. Lägg aldrig API-nycklar, certifikatnycklar, webhookhemligheter eller service-role i chatt, GitHub, `.env.example`, appen eller en publik fil.
7. Konfigurera Standard-webhook med HMAC till `/api/payments/webhook`, rätt testkonto och relevant händelseuppsättning. Testa riktig leverans, dubletter, fel och asynkrona negativa händelser. Bevara hemligheter separat för varje miljö.
8. Konfigurera Resend med verifierad avsändardomän, `EMAIL_FROM`, ägaradress och godkända testmottagare. Verifiera faktisk mottagning, inte bara HTTP 200. Push kräver företagets FCM/APNs och en installerad app.
9. Aktivera order-/betalspärrar enbart i den godkända testmiljön och kör acceptansen nedan. Inga live-endpoints finns i den här Adyen-adaptern; en framtida produktionsaktivering kräver eget godkänt arbete.

`EXPO_PUBLIC_*` och `NEXT_PUBLIC_*` kan byggas in i klienten. Mobilen behöver endast den publika API-adressen och projektkonfigurationen. Serverns service-role, betalnings-API-nyckel/HMAC och Resendnyckel får aldrig ligga där. De två orderhemligheterna ska vara olika slumpvärden med minst 32 tecken.

| Servervariabel | Testkonfiguration efter kontogodkännande |
| --- | --- |
| `PAYMENTS_ENABLED` | `false` som standard, `true` endast i godkänd testmiljö |
| `PAYMENT_PROVIDER` | Tomt i konfigurationsmallen (avstängt); `adyen` för verifierat testkonto |
| `ADYEN_ENVIRONMENT` | `test`; andra miljöer har inga stödda endpoints i adaptern |
| `ADYEN_CAPTURE_MODE` | `automatic`, efter verifiering av omedelbar capture på rätt konto |
| `ADYEN_API_KEY` | Hemlig företagsägd test-API-nyckel i godkänd secret-hantering |
| `ADYEN_MERCHANT_ACCOUNT` | Exakt företagsägt testkontonamn |
| `ADYEN_HMAC_KEY` | Hemlig webhooknyckel, 64 hextecken, för rätt testwebhook |
| `ADYEN_ENABLED_METHODS` | Endast faktiskt verifierade val bland `swish,card,apple_pay,google_pay` |

Att stänga nya betalningar med `PAYMENTS_ENABLED=false` stoppar inte signerad avstämning av redan skapade försök. Behåll rätt testkonto/HMAC och webhook tills alla försök är avstämda. Ändra inte hemligheter eller radera historik för att försöka nollställa en oklar betalning.

## Testa själv och anteckna bevisnivå

Kör från repots rot:

```powershell
npm ci
npm run syntax
npm test
npm run typecheck
npm run build
npm run test:web
npm run export:mobile
npm run test:integration
```

Integrationssviten använder separat tillfälligt lokalt PostgreSQL/PostgREST/Next-kluster och syntetiska order. Leverantörs-/Auth-/mejltransporter ersätts kontrollerat. Det är **lokal integration med simulerad leverantör**, inte Adyen-sandbox och inte en verklig Swish-, Apple Pay- eller Google Pay-transaktion. Resultat och antal redovisas först när slutkörningen finns i [TESTER.md](TESTER.md).

| Acceptans | Lokal kodkontroll | Verklig extern kontroll som återstår |
| --- | --- | --- |
| Order från webb och Expo | HTTP → riktig isolerad PostgreSQL, historiska priser, idempotens, ägargodkännande och kundacceptans | Företagets katalog, verklig Auth/Storage och egen HTTPS-testbackend |
| Swish | Signerade testhändelser, exakt belopp/SEK, avbrutet/väntande/fel | Adyen-testkonto, tillgänglig metod, mobilappväxling och desktop-QR enligt leverantörens officiella testförfarande |
| Apple Pay | Metodspärr, hostad URL och serveravstämning | Aktiverat Adyencertifikat, kompatibel plånbok/testmiljö och fysisk iPhone |
| Google Pay | Metodspärr och serveravstämning | Företagskonfiguration, rätt domän, kompatibel Google Pay-testplånbok och fysisk Android |
| Visa/Mastercard | Skapat belopp, nekade/avbrutna/pending-händelser, otillåten metod | Officiella Adyen-testkort och 3D Secure/SCA i riktig sandbox |
| Säkerhet | Fel signatur/konto/belopp/valuta/referens, parallella/dubbla och sena händelser | Riktiga webhookleveranser, timeout/återförsök och konto/captureinställningar |
| Återbetalning | Begäran/idempotens, pending/confirmed, sena fel/återföring | Verklig Adyen-testrefund och avstämning i Customer Area |
| Kontant | Bara hämtning, obetald, adminbehörighet och manuell kvittens | Företagets mottagnings- och bokföringsrutin |
| Besked | Beständig kö och kontrollerad testtransport | Levererad Resend-e-post samt APNs/FCM på fysiska enheter |

Vid extern testning: notera miljö, commit-SHA, tid, orderkod, leverantörens testreferens, metod, belopp, förväntad/faktisk status och om en fysisk enhet användes. Publicera inte privata ordertoken, kunduppgifter eller hemligheter i rapporten. En simulerad webhook ska uttryckligen märkas simulerad, även när den är HMAC-signerad.

## Sites och EAS

Sites ska synkroniseras från **godkänd main efter merge**, med samma webbkälla, `packages/shared`, `packages/api-client` och backendkontrakt. Befintligt projekt `appgprj_6ace628740b88191ab7cae7e9704a5f2`, design och SEO bevaras. Inga hemligheter eller testdatabaser får följa med källarkivet. Betalningar ska förbli avstängda om merchant/sandbox inte är verifierat.

Om Sites-verktyget inte kan nås: följ [PUBLICERING.md](PUBLICERING.md), öppna befintlig Site med source-helper, kör `node scripts/sync-sites.mjs <öppnad-site-katalog> origin/main`, installera beroenden, verifiera, bygg/paketera med Sites-helper och spara/publicera på befintligt projekt. Verifiera terminal deploymentstatus och publika `/api/catalog`/orderstatus, inte bara en sparad version. Gamla Stripe-rutter och SDK får inte ligga kvar aktiva i Site-arkivet när de tagits bort ur main.

Expo SDK 57 och EAS-projektets identitet behålls. `development`, `preview`, `production` och iOS-simulatorprofiler finns i `apps/mobile/eas.json`. Androids developmentprofil använder debugbygge utan distributionscredentials; ett sådant bygge bevisar inte produktionssignering. Signerat Android/iOS kräver rätt kontoägarskap, certifikat/provisioning och behörighet. En lokal export bevisar endast paketering.

Efter att signering och rätt backendmiljö verifierats kan ansvarig bygga från `apps/mobile`:

```powershell
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
```

Butiksuppladdning är ett eget steg efter verifiering och ägarbeslut. Läs [EXPO.md](EXPO.md) och [PUBLICERING.md](PUBLICERING.md). Tidigare V4-/V4.1-/V4.2-byggen eller Sites-versioner är inte bevis för V4.3.

## Kodöversikt och avveckling

| Del | Förändring i V4.3 |
| --- | --- |
| `apps/web/src/lib/payments/provider.ts` | Gemensamt serverkontrakt för betalning, status, verifierade händelser och refund |
| `apps/web/src/lib/payments/service.ts` | Beständiga försök, exakta belopp, idempotens och återbetalningslivscykel |
| `apps/web/src/lib/payments/providers/adyen.ts` | Avstängd testadapter, Pay by Link, kontometoder, HMAC och refund |
| `apps/web/src/app/api/payments/**` | Generiska serverrutter för initiering, status och verifierad webhook |
| `apps/web/src/lib/payments.ts` | Befintlig orderkoppling återanvänds genom providergränssnittet; gamla `checkout.ts` avvecklas |
| `packages/shared`, `packages/api-client` | Samma metod-/statuskontrakt för webb och Expo, inklusive Google Pay och obetald förfrågan när tillåten |
| Webb-/Expo-/adminvyer | Serverstyrda betalval, verifierad status, historisk transaktionsreferens och refund/avvikelseinformation |
| `supabase/migrations/20261017203703_generic_payments_without_stripe_v43.sql` | Additiv betalningsmodell, serverbehörigheter och atomär avstämning; orderhistorik bevaras |
| Konfiguration, paket, tester och Sites-synk | Aktiv Stripekonfiguration/SDK och oanvända rutter avvecklas efter regressionskontroll; provideroberoende tester och stängd standardkonfiguration |
| `README.md`, `docs/**` | Aktuella guider hänvisar till V4.3; äldre verifieringsrapporter märks som historik |

Historiska SQL-migrationer, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `checkout_url` och gamla `payment_events` kan finnas kvar för spårbarhet/kompatibilitet. De ska inte rensas ur kunddata och kan inte starta nya Stripebetalningar. Avstämning/återbetalning av en gammal riktig Stripebetalning kräver separat ekonomisk hantering i dess ursprungliga system; den får inte skickas till Adyen.

Den faktiska diffen och [TESTER.md](TESTER.md) är facit för borttagna filer, slutliga tester, commit, CI, merge och extern publiceringsstatus. Ett påbörjat eller dokumenterat steg räknas inte som utfört.
