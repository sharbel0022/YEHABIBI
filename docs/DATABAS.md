# Databasen i V4.3

Supabase kör PostgreSQL. Webben, mobilappen och admin använder samma server-API. Mobilen gör inga direkta databasfrågor och har ingen service-role-nyckel.

V4.3 återanvänder databasen och lägger till en additiv betalningsmigration. Historiska order/priser/betalningsreferenser bevaras. Det finns inga separata ordertabeller för iPhone, Android och webb. En gemensam företagsägd Supabase-databas används per konfigurerad miljö; utveckling, staging och produktion ska vara separerade. Företagets riktiga tjänster behöver fortfarande verifieras enligt [TESTER.md](TESTER.md).

## Migrationer

1. `supabase/migrations/0001_cedar_mezze.sql` är grunden: inställningar, paket, order, betalningshändelser, spamgräns och mediabucket.
2. `supabase/migrations/0002_cedar_mezze_v2.sql` är V2:s ursprungliga tillägg: `menu_items`, ordernas JSON-snapshot och företagsinställningar för kampanjer/leverans.
3. `supabase/migrations/20261017121516_v3_catalog_and_orders.sql` uppgraderar vidare till delad katalog, atomära orderrader, leveranszoner, kampanjer och frivilliga ägar-pushtokens. Den lägger också till orderstatusen `preparing` och behåller V2-data.
4. `20261017135737_v4_order_review_and_notifications.sql` lägger till återförsök, prisrevisioner, kundacceptans och betalningsnotiser.
5. `20261017192114_v41_notifications_and_settings.sql` köar alla orderbesked, bevarar moderna zoner/arkiverad grundzon och rättar webhookåterförsök efter sessionsbyte.

6. `20261017203703_generic_payments_without_stripe_v43.sql` tillför generiska betalningsförsök, leverantörshändelser, refunds och avstämningsfält samt explicita serverrollsbehörigheter. Historiska Stripe-RPC:ers körningsrättigheter återkallas.

På en tom testdatabas körs hela kedjan i ordning. På en befintlig databas tillämpas endast saknade migrationer efter backup. Kör inte filerna upprepade gånger: de är versionsändringar, inte seed vid varje start. Lokalt testad SQL är inte bevis på att den har applicerats i företagets databas; se [TESTER.md](TESTER.md). Inga migrationer har körts i det anslutna inaktiva projektet.

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
| `payment_events` | Historiska Stripehändelser bevarade för spårbarhet; ingen aktiv integration |
| `payment_attempts`, `payment_provider_events`, `payment_refunds` | Beständiga generiska betalnings-/återbetalningsförsök och verifierade händelser |
| `order_rate_limits` | HMAC-hashade spamnycklar, timfönster och antal försök |
| `owner_push_tokens` | Expo-token kopplad till verifierad administratör i `auth.users`, med senaste leveransticket/tid |
| `order_push_tokens` | Kundens registrerade Expo-enheter för en privat order |
| `order_notifications` | Beständig kö med händelsens snapshot och separata leveranskvittensfält |

`orders.menu_id` pekar på paketet, eller är `null` för egen catering. `orders.delivery_zone_id` pekar på vald zon vid leverans. `order_items.order_id` är en foreign key till ordern. Historiska titlar, enheter och priser sparas på raderna, så senare menyändringar ändrar inte redan skapade order.

## Så bevaras V2-data

V3-migrationen byter namn på `menu_items` till `dishes`, `unit_price_ore` till `price_ore` och `unit_label` till `portion_label`. Samma UUID:n och ursprungliga data finns kvar. `category` och `suggested_per_person` behålls. En uppdateringsbar `menu_items`-vy med `security_invoker` visar de gamla namnen för V2:s `/admin/ratter` och `/api/admin/items`. Båda adminvägarna redigerar därmed samma rätter som Expo läser.

Gamla `orders.items_snapshot` ändras inte. Giltiga historiska rader kopieras också till `order_items` med snapshotens titel, enhet och pris, inte dagens katalogpris. Historiska rätt-id:n bevaras även om den ursprungliga rätten hunnit tas bort. Nya egna cateringorder får både normaliserade rader och en kompatibel snapshot för befintlig order-/mejlhistorik.

V2:s leveranszoner och kampanjfält i `business_settings` kopieras till `delivery_zones` och `campaigns`; originalfälten finns kvar. `getSettings` visar V2-formatet härlett från de normaliserade tabellerna. RPC:n `update_catering_settings` översätter V2-formulärets gamla JSON-format tillbaka till tabellerna atomärt. Ersatta zoner/kampanjer avpubliceras i stället för att raderas, så orderrelationer bevaras. Den ursprungliga inställningskampanjen känns igen med `legacy_key='settings'`. Expo och båda webbgränssnitten använder samma data efter ändringar.

Admin tar normalt bort något från katalogen genom **avpublicering**, `active=false`. Det bevarar orderhistoriken. SQL-relationerna hindrar att använda menyer/maträtter raderas så att historiska order tappar sin anknytning.

## Pengar och serverkontroll

Alla belopp lagras som heltalsöre: `12500` betyder 125 kr. Paket har pris per person. Egna maträtter har styckpris × antal; pris per person visas som totalsumman för maten delad med gästantalet och avrundad till öre. Leveransavgiften är separat. Hämtning har ingen leveransavgift.

`packages/shared/pricing/index.ts` ger samma beräkningsregler i UI och server. `packages/shared/ordering/index.ts` samlar förhandsvisning, minimiantal, portionsförslag, formulärregler och samma orderformat. Klienten skickar produkt-ID och antal, inga auktoritativa priser. API:t hämtar aktuella databaspriser och validerar igen. Databasfunktionen `create_catering_order` läser och låser inställningar, zon och valda produkter, räknar om belopp och sparar order + rader i **en transaktion**. Om någon ändrar pris samtidigt stoppas ett oförenligt belopp i stället för att delvis spara ordern.

Leverans kräver en aktiv zon som matchar början av det normaliserade femsiffriga svenska postnumret. Exempel: prefix `721` matchar `72130`. Som i V2 vinner längst matchande prefix, därefter lägsta avgift vid lika specifika zoner. V2:s allmänna leveransavgift importeras som bred reservzon för att befintlig leverans inte ska försvinna. Ägaren behöver granska att den faktiskt motsvarar företagets godkända leveransområde före produktion.

## Två separata statusar

| Fält | Värden |
| --- | --- |
| `status` | `new`, `reviewing`, `changes_requested`, `approved`, `preparing`, `ready`, `dispatched`, `completed`, `rejected`, `cancelled` |
| `payment_status` | `unpaid`, `pending`, `paid`, `failed`, `refunded` |

En order kan vara godkänd men fortfarande vänta på betalning. Godkännande/prisacceptans skapar ingen betalsession. Kundens `/api/payments/create` reserverar ett försök före leverantörsanropet. Autentiserad webhook matchar unik försöksreferens, belopp, SEK och PSP-referens; SQL tillämpar händelsen atomärt. Dubbla leveranser skapar ingen ny betalning. `payment_review_required`/orsak och `payment_refund_status` skiljer avvikelse från vanlig betalstatus. Kontant registreras först av behörig admin efter verklig betalning vid hämtning.

V4.3 använder generiska RPC:er för att reservera/koppla försök och återbetalningar samt avstämma händelser. De är `SECURITY INVOKER` med rättigheter endast för serverrollen. Gamla `attach_catering_checkout`/`apply_stripe_event` finns kvar som historik men deras körningsrättigheter är indragna. Läs [V4.3-guiden](PAYMENTS_WITHOUT_STRIPE_V4_3.md) för fält, säkerhetsgränser och Supabases aktuella GRANT-regler.

## RLS, administratörer och privata länkar

RLS är aktiverat på affärstabellerna. Direkta rättigheter för `anon` och `authenticated` är borttagna där kund- och admindata ligger. Kompatibilitetsvyn `menu_items` är också begränsad till serverrollen och använder `security_invoker`. API:t använder serverns service-role och ansvarar därför för uttrycklig validering och behörighet. Det är avsiktligt att en vanlig Supabase-klient inte kan lista order.

Ägaren finns i Supabase Auth. `requireAdmin` verifierar användaren med `getUser`, kräver bekräftad e-post och jämför den mot serverns `ADMIN_EMAILS`. En egen admin-tabell behövs inte för denna enkla allowlist. Inloggad betyder inte automatiskt administratör.

Publik orderläsning kräver både kod och hemlig token. Databasen sparar tokenhash; API:t jämför säkert och returnerar ett begränsat `PublicOrder` utan kundens kontaktuppgifter och adress. Svaret innehåller orderrader, status, eventuellt prisförslag, beskedsfältet `admin_note` och en tillåten Checkout-länk. Lägg inte interna hemligheter i ett kundsynligt besked. Skicka inte privata länkar till analysverktyg eller loggar.

`create_catering_order` är `SECURITY INVOKER` och kan bara anropas av `service_role`. V2:s begränsnings-/betalningsfunktioner har också uttryckligt borttagna publika körningsrättigheter. V2:s bucket `catering-media` är avsedd för företagets publika bilder/filmer, inte kunddokument.

Se [Supabases RLS-guide](https://supabase.com/docs/guides/database/postgres/row-level-security) för bakgrunden. Verifiera migration, roller och avvisade obehöriga anrop i en riktig testdatabas före produktion.

## Historik V4/V4.1: återförsök, prisförslag och notiser

> Nedan beskrivs de dåvarande migrationerna. Stripe-RPC:erna används inte för nya betalningar i aktuell V4.3.

Migrationen `20261017135737_v4_order_review_and_notifications.sql` körs efter V3. Den lägger till fält/funktioner och bevarar befintliga rader. Den gamla prisfunktionen får namnet `create_catering_order_v3` och ett omslag kontrollerar återförsöksnyckeln innan samma prislogik används.

| Nytt fält/tabell | Varför |
| --- | --- |
| `orders.request_id`, `request_hash` | UUID per förfrågan plus server-HMAC av innehållet; samma nyckel/innehåll ger samma order, ändrat innehåll avvisas |
| `quote_revision`, `accepted_revision` | Anger vilken offertversion kunden godkänt |
| `proposal`, `quote_history` | Förklaring, föreslaget belopp och historik; nuvarande pris ändras först vid kundacceptans |
| `price_adjustment_ore` | Godkänd ändring redovisas separat från ursprungliga orderrader |
| `order_push_tokens` | Upp till fem Expo-enheter per privat order, med leveranskvitton |
| `order_notifications` | Beständig kö för alla orderbesked; serverprivat snapshot, separat kvittens per mottagare och ett pushansvar |

`propose_catering_change` och `accept_catering_change` låser orderraden. Gamla revisioner avvisas, dubbel acceptans skapar inte ny offert och Checkout blockeras tills accepterad revision matchar. Orderraderna behåller ursprungliga priser. `subtotal_ore` innehåller därefter den godkända justeringen; när justeringen visas separat visar UI matens ursprungsbelopp så summeringen stämmer.

`create_catering_order` använder transaktionslås per `request_id`. Samtidiga återförsök skapar inte en andra order. Gamla order utan nyckel fungerar fortsatt.

Nya orderstatusar är `reviewing` (under granskning) och `dispatched` (på väg). Godkänd/väntar på betalning/betald visas utifrån kombinationen av `status` och `payment_status`.

Orderändring, Stripe-händelse och notifieringskö uppdateras atomärt. Köposten är unik per order, typ och prisrevision; sessionen ingår också för sessionsberoende besked. Dubbla event skapar inte dubbla besked. Snapshoten innehåller serverprivata kontakt-/orderuppgifter och skyddas av samma indragna rättigheter/RLS. Misslyckade mejl förblir okvitterade. API-återförsök och adminens återsändning tömmer kön; betalwebhooken ber Stripe återkomma vid leveransfel. Ingen automatisk bakgrundsarbetare finns. Företagets gallringsrutiner ska även omfatta notifieringssnapshotar.

V4.1 låter inställningsformuläret hantera V2:s äldre prefixzoner medan `/admin/catalog` behåller moderna zoners ID, avgift och aktivering. En avpublicerad bred grundzon återaktiveras inte när kontaktuppgifter sparas. Ogiltigt postnummer eller ingen aktiv matchning stoppar leverans. Lokal PostgreSQL/HTTP-verifiering hittade och kontrollerade just detta gränsfall.

Nya tabeller har RLS och saknar läsrättigheter för `anon`/`authenticated`. Funktionerna är `SECURITY INVOKER` och får bara anropas av serverrollen. API:t verifierar också adminsession eller kundens privata kod/token. Webbpubliceringen kör inga migrationer i företagets fjärrdatabas.

## V4.2: samma källa för alla kundplattformar

Admin uppdaterar `dishes`, `menus`, zoner eller inställningar genom den befintliga skyddade backendservern. Serverrenderade webbsidor läser aktuella data utan statiskt fryst katalog. Webbens kundvyer och Expo uppdaterar därefter via samma `/api/catalog`. API-klienten har ingen egen databas eller produktlista och använder `cache: 'no-store'`.

Menyutkast lagrar matval och mängder. De innehåller inga historiska orderpriser och rensar inte tidigare val bara för att API:t är nere eller visar demo. Avpublicerade val tas bort efter verifierad kataloghämtning. Historiska order hämtas alltid från `orders` och `order_items`; de räknas inte om från dagens katalog.

`request_id` följer med oförändrat genom `packages/api-client`. Klienternas beständiga fingerprint/UUID och serverns HMAC/SQL-lås kompletterar varandra. Därför kan en oförändrad förfrågan efter timeout ge tillbaka samma order även om katalogen har ändrats efter första försöket. Ändrat innehåll med samma nyckel avvisas. Se [V4.2-guiden](UNIFIED_ARCHITECTURE_V4_2.md) för hela flödet.
