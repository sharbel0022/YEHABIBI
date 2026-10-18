# YEHABIBI V4.4 – direktbeställningar och lediga tider

V4.4 använder samma Next.js-backend, PostgreSQL, orderhistorik och betalningsservice som V4.3. Expo SDK 57 och webben hämtar samma katalog och samma serverberäknade tider. Ingen extra backend eller databas införs. Den lokala testservern skapar, precis som tidigare, en isolerad PostgreSQL-databas för varje testsession.

## Direktbeställning och catering

**Beställ nu** gäller publicerade färdiga paket. Kunden väljer antal paket, hämtning eller hemleverans och en tillgänglig tid. `menus.price_ore` är priset **per paket** i detta flöde. `package_portions` beskriver hur många portioner paketet innehåller. Till exempel blir två paket à 250 kr totalt 500 kr före eventuell leveransavgift.

**Boka catering** behåller datumval, gästantal, egna maträtter, offert, ägargranskning och uttrycklig acceptans av prisändringar. I cateringflödet används paketmenyns befintliga pris per gäst. Ägaren bör därför använda separata katalogposter om portionspaket och cateringmeny ska ha olika prissättning. Befintliga order och frysta orderrader räknas inte om när katalogen ändras.

Administratören styr `direct_order_enabled` och `catering_enabled` för varje meny. En post kan användas i ett eller båda flödena. `active=false` avpublicerar posten. Direktbeställning är avstängd som standard i den ordinarie databasen. Testservern publicerar ett tydligt syntetiskt testpaket.

## Tillagning och tidigaste tid

Alla auktoritativa tidsbeslut görs på servern/databasen med tidszonen `Europe/Stockholm`. Mobilens klocka används inte för att avgöra om en beställning får göras. API-svaret innehåller `server_now`, tidszon och tidsstämplar för valbara tider.

Paketets tillagningstid är `preparation_minutes + floor((antal − 1) / extra_preparation_every) × extra_preparation_minutes`. Exempel: grundtid 30 minuter, 10 extra minuter per fem tillkommande paket ger 30 minuter för 1–5 paket, 40 minuter för 6–10 och 50 minuter för 11–15. Samma formel används både när tider visas och när ordern sparas. Bufferten `capacity_buffer_minutes` ger köket konfigurerad marginal. `min_advance_minutes` anger minsta framförhållning.

För hämtning behövs tillagningstid och köksbuffert. För hemleverans tillkommer zonens uttryckligt konfigurerade `travel_minutes`. Den är en företagsinställd planeringsmarginal, inte en uppmätt eller utlovad körtid. Saknas konfigurerad transporttid erbjuds ingen direktleverans i zonen.

Tider väljs på restaurangens intervall, exempelvis 15 minuter, och avrundas framåt. En tid måste rymmas inom kökets öppettider, stopptid, valt upphämtnings-/leveransfönster, framförhållning och bokningshorisont. Om köket inte hinner färdigt erbjuds nästa lediga tid en annan dag. Ett stängt datum eller särskilda öppettider ersätter veckodagens normala schema.

Tidigaste upphämtning är den senare av minsta framförhållning och tillagning plus buffert, räknat från aktuell servertid eller kökets öppning om köket ännu inte öppnat. Leverans lägger till konfigurerad transportmarginal. På så sätt antas inte att köket förbereder mat före öppning.

Tidsstämplar lagras som `timestamptz`; lokala datum och klockslag används för schemareglerna. PostgreSQLs tidszonsdata hanterar sommar- och vintertid. Vid upprepad hösttimme är UTC-tidsstämpeln den entydiga bokningen och tidsvalet visar UTC-offset. En lokal tid som inte finns på våren erbjuds inte. En stängningstid som ligger före öppningstiden hör till följande natt, exempelvis 22:00–02:00.

Om en gränstid upprepas på hösten används första förekomsten för öppning och sista förekomsten för stängning/stopptid. Det ger ett sammanhängande öppet fönster. Datumundantag ersätter också nattöppet som annars skulle ha fortsatt in på det aktuella datumet. Förberedelsen måste vara färdig före kökets stopptid; systemet antar ingen okonfigurerad varmhållning för senare hämtning.

## Hur kapaciteten reserveras

Listan med lediga tider är ett aktuellt förslag. Att visa eller välja en tid reserverar ingen plats. När kunden trycker **Skicka beställning** kontrollerar servern återigen paketets publicering, pris, antal, aktuell tid, öppettider, paus, zon och ledig kapacitet.

PostgreSQL-funktionen sparar ordern och tidsreservationen i samma transaktion. Lås gör att samtidiga beställningar kontrolleras i turordning: den sista platsen kan bara tilldelas en av dem. Kunden får ett läsbart fel och kan hämta nya tider om tiden hunnit bli full eller otillåten. `expected_total_ore` förhindrar att ett ändrat paketpris accepteras utan att kunden ser den nya totalsumman.

Reservationen lagras på ordern: `scheduled_at` är start och `slot_interval_minutes` fryser intervallets längd. Överlappande reservationer räknas även om ägaren senare ändrar intervallen eller en hösttimme upprepas. En gemensam kapacitet gäller hämtning och leverans; varje beställning tar en plats. Paketantalet påverkar tillagningstiden.

Varje inskick har ett `request_id`. Ett identiskt återförsök ger samma order och privata orderlänk, utan en andra reservation. Ändrat innehåll kräver en ny förfrågningsnyckel. Nekade eller avbrutna order ska inte fortsätta ta upp ledig kapacitet. Vanliga rate limits och skydd av privata orderlänkar finns kvar.

## Hämtning och hemleverans

Vid **Hämtning** visar kunden restaurangens sparade `pickup_address`, lediga tider och totalen utan leveransavgift. Företaget måste ange sin riktiga adress innan det aktiverar riktiga beställningar. Testserverns `Testgatan 1, Teststad` är syntetisk och får inte användas som företagets adress.

Vid **Hemleverans** anger kunden adress, postnummer och ort. Servern väljer en aktiv leveranszon som matchar postnumret. Direktleverans kräver också att zonen tillåter detta och har en transportmarginal. Servern räknar zonens avgift i öre. Utanför området, vid saknad konfiguration eller när det inte finns lediga tider får kunden ett begripligt besked och kan välja hämtning.

Vald tid och aktuell totalsumma visas tillsammans med paketantal och leveranssätt. Kunden skickas därefter till samma privata orderuppföljning som tidigare.

## Ägarens inställningar

Logga in i admin och öppna sidan för tider. Där går det att:

- Aktivera eller tillfälligt pausa direktbeställning och välja automatiskt godkännande.
- Ställa in öppning, stängning, kökets stopptid samt hämtnings- och leveransfönster per veckodag.
- Lägga in särskilda öppettider eller stängda datum.
- Ändra intervall, kapacitet, bokningshorisont, framförhållning och köksbuffert.
- Blockera ett visst tidsintervall.
- Konfigurera vilka leveranszoner som tillåter direktbeställning och ange deras transportmarginaler.

Paketets tillagningstid, portionsstorlek, innehåll, allergener, bild, pris och flöden ändras under menyer/paket. Orderlistan skiljer direktbeställningar från catering. Ägaren använder de befintliga åtgärderna för godkännande, nekande, förberedelse, klar för hämtning respektive på väg.

Automatiskt godkännande skapar **ingen betalning och startar ingen produktion**. Betalningssessionen initieras uttryckligen av kunden. Köket startar förberedelsen genom den befintliga adminåtgärden med befintliga betalningskontroller.

## Komplett testbeställning utan riktiga pengar

1. Kör `npm ci` och sedan `npm run test:server` i repots rot. PostgreSQL/PostgREST ska vara installerade enligt [testguiden](TEST_ORDER_PAYMENT_GUIDE.md). Terminalen visar den nya serveradressen och testadmin-inloggningen.
2. Öppna testwebben och kontrollera bannern **TESTLÄGE – INGA RIKTIGA BESTÄLLNINGAR**. Välj det publicerade testpaketet och **Beställ nu**.
3. Välj antal paket och **Hämtning**. Kontrollera testadressen, priset och nästa lediga tid. För leverans använder du syntetisk adress och ett postnummer i testzonen `721…`.
4. Välj en servererbjuden tid och fyll i en syntetisk kund, `.test`-e-post och testtelefon. Välj önskad testbetalningsmetod och skicka beställningen.
5. Följ den privata orderlänken. Ordern finns nu i den isolerade riktiga PostgreSQL-databasen. Om automatiskt godkännande är avstängt godkänner testadmin först ordern.
6. Kunden väljer Swish, Apple Pay, Google Pay eller kort och öppnar den lokala simulatorn. Välj lyckat utfall eller prova nekande/avbrott och återförsök. Inga kortuppgifter, bankappar eller riktiga pengar används.
7. Kontrollera **Betald** i ordervyn. Testadmin markerar **Under förberedelse**, sedan **Klar för hämtning** eller **På väg**, och till sist slutförd. Kunden ser samma serverbekräftade status.
8. Prova också **Boka catering** med den tidigare testguidens fem personer, 12 ostrullar och två hummusfat för 480 kr. Det ska fortfarande kräva cateringflödets granskning.

Expo ansluts till samma körande testsession med `npm run test:mobile`, eller emulatorinstruktionerna i [testguiden](TEST_ORDER_PAYMENT_GUIDE.md). En export verifierar paketeringen; den är inget fysiskt iPhone-/Android-prov.

## Filer och databas

| Del | Ansvar |
| --- | --- |
| `supabase/migrations/*direct*` | Additiv V4.4-migration med schemaregler, funktioner och reservationer |
| `menus` | Befintliga paket plus flöden, portioner och tillagningstid |
| `delivery_zones` | Befintliga postnummer/avgifter plus direktleverans och transportmarginal |
| `direct_order_settings` | Köksregler, veckoschema, datumundantag och blockerade intervall |
| `orders`, `order_items` | Samma order/rader som catering; `order_type`, `package_quantity`, `scheduled_at`, `slot_interval_minutes` reserverar tiden utan en extra reservationstabell |
| `packages/shared/types`, `packages/shared/validation` | Gemensamma TypeScript-kontrakt och validering |
| `packages/api-client/index.ts` | Samma tillgänglighets- och orderanrop för webb och Expo |
| `apps/web/src/app/api/availability` | Serverberäknade lediga tider |
| `apps/web/src/app/api/orders/direct` | Direktorder med serverkontroll och atomär lagring |
| `apps/web/src/app/api/admin/scheduling` | Skyddade läs-/skrivanrop för ägarens inställningar |
| `apps/web/src/components`, `apps/mobile/app` | Kund- och ägargränssnitt |
| `test-support/local/environment.mjs` | Isolerad testserver, syntetiskt paket och zon |

Betalningar använder fortsatt `payment_attempts`, `payment_provider_events` och befintlig notifieringskö. Nya tabeller ska ha RLS och begränsade rättigheter; inga service-role-nycklar skickas till kunderna. Funktionernas transaktioner och tidszonshantering bygger på [PostgreSQLs lås](https://www.postgresql.org/docs/current/explicit-locking.html) och [tidszonshantering](https://www.postgresql.org/docs/current/functions-datetime.html). Se också [Supabases RLS-dokumentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Publik webb och verifiering

`ORDERS_ENABLED=false`, `PAYMENTS_ENABLED=false` och `PAYMENTS_LIVE_APPROVED=false` ska bevaras publikt tills företagsmiljön har konfigurerats och godkänts. Simulatorn installeras bara i den isolerade testkopian och publiceras aldrig till Sites. En lyckad lokal simulering bevisar inte ett riktigt betalningskonto eller en fysisk plånboksbetalning.

Faktiskt körda kontroller och begränsningar redovisas i [TESTER.md](TESTER.md). GitHub/CI och publicering redovisas i slutleveransen samt [PUBLICERING.md](PUBLICERING.md).
Den kompletta V4.4-utbyggnaden med viktade reservationer, paketstorlekar, tillbehör och tre steg dokumenteras i [DIRECT_ORDERS_AND_TIMES.md](DIRECT_ORDERS_AND_TIMES.md). Nedan bevaras den första V4.4-versionens bakgrund; dess gamla orderräknade kapacitet har ersatts.

