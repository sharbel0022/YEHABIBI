# Databasen

Supabase kör PostgreSQL. Webben, mobilappen och admin använder samma server-API. Mobilen gör inga direkta databasfrågor och har ingen service-role-nyckel.

## Migrationer

1. `supabase/migrations/0001_cedar_mezze.sql` är grunden: inställningar, paket, order, betalningshändelser, spamgräns och mediabucket.
2. `supabase/migrations/0002_cedar_mezze_v2.sql` är V2:s ursprungliga tillägg: `menu_items`, ordernas JSON-snapshot och företagsinställningar för kampanjer/leverans.
3. `supabase/migrations/20261017121516_v3_catalog_and_orders.sql` uppgraderar vidare till delad katalog, atomära orderrader, leveranszoner, kampanjer och frivilliga ägar-pushtokens. Den lägger också till orderstatusen `preparing` och behåller V2-data.

På en tom testdatabas körs alla tre i ordning. På en befintlig V2-databas där 0001 och 0002 redan körts tillämpas bara V3-migrationen efter backup. Kör inte filerna upprepade gånger: de är versionsändringar, inte seed som ska köras vid varje start. Använd företagets Supabase SQL Editor eller projektets ordinarie migrationsflöde. Lokalt testad SQL är inte bevis på att den har applicerats i företagets databas; se [TESTER.md](TESTER.md).

## Tabeller och relationer

| Tabell | Innehåll och samband |
| --- | --- |
| `business_settings` | En rad, `id=1`: namn, kontakt, media, officiella länkar, hämtning och beställningsregler |
| `menus` | Cateringpaket med pris per person, minsta antal, innehåll, allergener och bild |
| `dishes` | V2:s omdöpta `menu_items`: samma rätt-id:n, priser, kategori, portionshjälp, allergener och bild |
| `menu_items` | Kompatibilitetsvy med V2:s kolumnnamn mot samma maträtter, inte en andra separat katalog |
| `delivery_zones` | Namn, svenska postnummerprefix, avgift och aktiv/inaktiv |
| `campaigns` | Rubrik, text, media, start/slut och array med marknadsförda meny-id:n |
| `orders` | Kundförfrågan, kontakt, leverans, frysta belopp, status och bevarad V2-`items_snapshot` |
| `order_items` | Normaliserade orderrader med historisk titel/pris och koppling till ordern |
| `payment_events` | Unika Stripe-händelser kopplade till order, för idempotent webhookhantering |
| `order_rate_limits` | HMAC-hashade spamnycklar, timfönster och antal försök |
| `owner_push_tokens` | Expo-token kopplad till verifierad administratör i `auth.users`, med senaste leveransticket/tid |

`orders.menu_id` pekar på paketet, eller är `null` för egen catering. `orders.delivery_zone_id` pekar på vald zon vid leverans. `order_items.order_id` är en foreign key till ordern. Historiska titlar, enheter och priser sparas på raderna, så senare menyändringar ändrar inte redan skapade order.

## Så bevaras V2-data

V3-migrationen byter namn på `menu_items` till `dishes`, `unit_price_ore` till `price_ore` och `unit_label` till `portion_label`. Samma UUID:n och ursprungliga data finns kvar. `category` och `suggested_per_person` behålls. En uppdateringsbar `menu_items`-vy med `security_invoker` visar de gamla namnen för V2:s `/admin/ratter` och `/api/admin/items`. Båda adminvägarna redigerar därmed samma rätter som Expo läser.

Gamla `orders.items_snapshot` ändras inte. Giltiga historiska rader kopieras också till `order_items` med snapshotens titel, enhet och pris, inte dagens katalogpris. Historiska rätt-id:n bevaras även om den ursprungliga rätten hunnit tas bort. Nya egna cateringorder får både normaliserade rader och en kompatibel snapshot för befintlig order-/mejlhistorik.

V2:s leveranszoner och kampanjfält i `business_settings` kopieras till `delivery_zones` och `campaigns`; originalfälten finns kvar. `getSettings` visar V2-formatet härlett från de normaliserade tabellerna. RPC:n `update_catering_settings` översätter V2-formulärets gamla JSON-format tillbaka till tabellerna atomärt. Ersatta zoner/kampanjer avpubliceras i stället för att raderas, så orderrelationer bevaras. Den ursprungliga inställningskampanjen känns igen med `legacy_key='settings'`. Expo och båda webbgränssnitten använder samma data efter ändringar.

Admin tar normalt bort något från katalogen genom **avpublicering**, `active=false`. Det bevarar orderhistoriken. SQL-relationerna hindrar att använda menyer/maträtter raderas så att historiska order tappar sin anknytning.

## Pengar och serverkontroll

Alla belopp lagras som heltalsöre: `12500` betyder 125 kr. Paket har pris per person. Egna maträtter har styckpris × antal; pris per person visas som totalsumman för maten delad med gästantalet och avrundad till öre. Leveransavgiften är separat. Hämtning har ingen leveransavgift.

`packages/shared/pricing/index.ts` ger samma regler i UI och server. API:t hämtar sedan aktuella databaspriser och validerar igen. Databasfunktionen `create_catering_order` läser och låser inställningar, zon och valda produkter, räknar om belopp och sparar order + rader i **en transaktion**. Om någon ändrar pris samtidigt stoppas ett oförenligt belopp i stället för att delvis spara ordern.

Leverans kräver en aktiv zon som matchar början av det normaliserade femsiffriga svenska postnumret. Exempel: prefix `721` matchar `72130`. Som i V2 vinner längst matchande prefix, därefter lägsta avgift vid lika specifika zoner. V2:s allmänna leveransavgift importeras som bred reservzon för att befintlig leverans inte ska försvinna. Ägaren behöver granska att den faktiskt motsvarar företagets godkända leveransområde före produktion.

## Två separata statusar

| Fält | Värden |
| --- | --- |
| `status` | `new`, `reviewing`, `changes_requested`, `approved`, `preparing`, `ready`, `dispatched`, `completed`, `rejected`, `cancelled` |
| `payment_status` | `unpaid`, `pending`, `paid`, `failed`, `refunded` |

En order kan alltså vara godkänd men fortfarande vänta på betalning. Onlineorder blir inte betald av att kunden återvänder från Checkout. `apply_stripe_event` matchar rätt order/session och sparar händelse-id atomärt med betalningsändringen. Dubbla webhookleveranser räknas inte som nya betalningar. Kontant registreras manuellt av ägaren efter verklig betalning vid hämtning.

`attach_catering_checkout` kopplar en verifierad Checkout-länk till ordern bara om föregående orderstatus, betalningsstatus och session fortfarande stämmer. Om en webhook redan har satt `paid`, eller någon hunnit byta session, avvisas uppdateringen. Funktionen är `SECURITY INVOKER` och endast tillgänglig för `service_role`.

## RLS, administratörer och privata länkar

RLS är aktiverat på affärstabellerna. Direkta rättigheter för `anon` och `authenticated` är borttagna där kund- och admindata ligger. Kompatibilitetsvyn `menu_items` är också begränsad till serverrollen och använder `security_invoker`. API:t använder serverns service-role och ansvarar därför för uttrycklig validering och behörighet. Det är avsiktligt att en vanlig Supabase-klient inte kan lista order.

Ägaren finns i Supabase Auth. `requireAdmin` verifierar användaren med `getUser`, kräver bekräftad e-post och jämför den mot serverns `ADMIN_EMAILS`. En egen admin-tabell behövs inte för denna enkla allowlist. Inloggad betyder inte automatiskt administratör.

Publik orderläsning kräver både kod och hemlig token. Databasen sparar tokenhash; API:t jämför säkert och returnerar ett begränsat `PublicOrder` utan kontaktuppgifter och adminnoteringar. Skicka inte privata länkar till analysverktyg eller loggar.

`create_catering_order` är `SECURITY INVOKER` och kan bara anropas av `service_role`. V2:s begränsnings-/betalningsfunktioner har också uttryckligt borttagna publika körningsrättigheter. V2:s bucket `catering-media` är avsedd för företagets publika bilder/filmer, inte kunddokument.

Se [Supabases RLS-guide](https://supabase.com/docs/guides/database/postgres/row-level-security) för bakgrunden. Verifiera migration, roller och avvisade obehöriga anrop i en riktig testdatabas före produktion.

## V4: återförsök, prisförslag och notiser

Migrationen `20261017135737_v4_order_review_and_notifications.sql` körs efter V3. Den lägger till fält/funktioner och bevarar befintliga rader. Den gamla prisfunktionen får namnet `create_catering_order_v3` och ett omslag kontrollerar återförsöksnyckeln innan samma prislogik används.

| Nytt fält/tabell | Varför |
| --- | --- |
| `orders.request_id`, `request_hash` | UUID per förfrågan plus server-HMAC av innehållet; samma nyckel/innehåll ger samma order, ändrat innehåll avvisas |
| `quote_revision`, `accepted_revision` | Anger vilken offertversion kunden godkänt |
| `proposal`, `quote_history` | Förklaring, föreslaget belopp och historik; nuvarande pris ändras först vid kundacceptans |
| `price_adjustment_ore` | Godkänd ändring redovisas separat från ursprungliga orderrader |
| `order_push_tokens` | Upp till fem Expo-enheter per privat order, med leveranskvitton |
| `order_notifications` | Beständig kö för betalningsbesked; mottagare kvitteras separat och pushansvar tas en gång |

`propose_catering_change` och `accept_catering_change` låser orderraden. Gamla revisioner avvisas, dubbel acceptans skapar inte ny offert och Checkout blockeras tills accepterad revision matchar. Orderraderna behåller ursprungliga priser. `subtotal_ore` innehåller därefter den godkända justeringen; när justeringen visas separat visar UI matens ursprungsbelopp så summeringen stämmer.

`create_catering_order` använder transaktionslås per `request_id`. Samtidiga återförsök skapar inte en andra order. Gamla order utan nyckel fungerar fortsatt.

Nya orderstatusar är `reviewing` (under granskning) och `dispatched` (på väg). Godkänd/väntar på betalning/betald visas utifrån kombinationen av `status` och `payment_status`.

Betalstatus, Stripe-händelse och notifieringskö uppdateras atomärt. Köposten är unik per order, typ och prisrevision. Dubbla event skapar inte dubbla besked. Misslyckat betalningsmejl lämnas okvitterat och webhooken ber Stripe återkomma. Andra statusmejl kan skickas igen från admin vid tjänstefel.

Nya tabeller har RLS och saknar läsrättigheter för `anon`/`authenticated`. Funktionerna är `SECURITY INVOKER` och får bara anropas av serverrollen. API:t verifierar också adminsession eller kundens privata kod/token. Webbpubliceringen kör inga migrationer i företagets fjärrdatabas.
