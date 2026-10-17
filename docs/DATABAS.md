# Databasen

Supabase kör PostgreSQL. Webben, mobilappen och admin använder samma server-API. Mobilen gör inga direkta databasfrågor och har ingen service-role-nyckel.

## Migrationer

1. `supabase/migrations/0001_cedar_mezze.sql` är V2:s grund: inställningar, paket, order, betalningshändelser, spamgräns och mediabucket.
2. `supabase/migrations/20261017121516_v3_catalog_and_orders.sql` lägger till maträtter, orderrader, leveranszoner, kampanjer och frivilliga ägar-pushtokens. Den lägger också till orderstatusen `preparing`.

På en tom testdatabas körs båda i ordning. På en befintlig V2-databas körs bara den nya migrationen efter backup. Kör inte V3-filen upprepade gånger: den är en versionsändring, inte en seed som ska köras vid varje start. Använd företagets Supabase SQL Editor eller projektets ordinarie migrationsflöde. Lokal skapad SQL är inte bevis på att den har applicerats; se [TESTER.md](TESTER.md).

## Tabeller och relationer

| Tabell | Innehåll och samband |
| --- | --- |
| `business_settings` | En rad, `id=1`: namn, kontakt, media, officiella länkar, hämtning och beställningsregler |
| `menus` | Cateringpaket med pris per person, minsta antal, innehåll, allergener och bild |
| `dishes` | Enskilda maträtter med styckpris, portionsetikett, allergener och bild |
| `delivery_zones` | Namn, svenska postnummerprefix, avgift och aktiv/inaktiv |
| `campaigns` | Rubrik, text, media, start/slut och array med marknadsförda meny-id:n |
| `orders` | Kundförfrågan, kontakt, leverans, frysta belopp, orderstatus och separat betalningsstatus |
| `order_items` | Rader kopplade till ordern; varje rad avser ett paket eller en maträtt |
| `payment_events` | Unika Stripe-händelser kopplade till order, för idempotent webhookhantering |
| `order_rate_limits` | HMAC-hashade spamnycklar, timfönster och antal försök |
| `owner_push_tokens` | Expo-token kopplad till verifierad administratör i `auth.users`, med senaste leveransticket/tid |

`orders.menu_id` pekar på paketet, eller är `null` för egen catering. `orders.delivery_zone_id` pekar på vald zon vid leverans. `order_items.order_id` är en foreign key till ordern. En orderrad har exakt en av `menu_id` och `dish_id`. Historiska titlar och priser sparas på raderna, så senare menyändringar ändrar inte redan skapade order.

Admin tar normalt bort något från katalogen genom **avpublicering**, `active=false`. Det bevarar orderhistoriken. SQL-relationerna hindrar att använda menyer/maträtter raderas så att historiska order tappar sin anknytning.

## Pengar och serverkontroll

Alla belopp lagras som heltalsöre: `12500` betyder 125 kr. Paket har pris per person. Egna maträtter har styckpris × antal; pris per person visas som totalsumman för maten delad med gästantalet och avrundad till öre. Leveransavgiften är separat. Hämtning har ingen leveransavgift.

`packages/shared/pricing/index.ts` ger samma regler i UI och server. API:t hämtar sedan aktuella databaspriser och validerar igen. Databasfunktionen `create_catering_order` läser och låser inställningar, zon och valda produkter, räknar om belopp och sparar order + rader i **en transaktion**. Om någon ändrar pris samtidigt stoppas ett oförenligt belopp i stället för att delvis spara ordern.

Leverans kräver en aktiv zon som matchar början av det normaliserade femsiffriga svenska postnumret. Exempel: prefix `721` matchar `72130`. V2:s allmänna leveransavgift finns kvar i inställningarna; V3-order använder den valda zonens avgift. Lägg därför in riktiga zoner före leveransbeställningar.

## Två separata statusar

| Fält | Värden |
| --- | --- |
| `status` | `new`, `changes_requested`, `approved`, `preparing`, `ready`, `completed`, `rejected`, `cancelled` |
| `payment_status` | `unpaid`, `pending`, `paid`, `failed`, `refunded` |

En order kan alltså vara godkänd men fortfarande vänta på betalning. Onlineorder blir inte betald av att kunden återvänder från Checkout. `apply_stripe_event` matchar rätt order/session och sparar händelse-id atomärt med betalningsändringen. Dubbla webhookleveranser räknas inte som nya betalningar. Kontant registreras manuellt av ägaren efter verklig betalning vid hämtning.

`attach_catering_checkout` kopplar en verifierad Checkout-länk till ordern bara om föregående orderstatus, betalningsstatus och session fortfarande stämmer. Om en webhook redan har satt `paid`, eller någon hunnit byta session, avvisas uppdateringen. Funktionen är `SECURITY INVOKER` och endast tillgänglig för `service_role`.

## RLS, administratörer och privata länkar

RLS är aktiverat på affärstabellerna. Direkta rättigheter för `anon` och `authenticated` är borttagna där kund- och admindata ligger. API:t använder serverns service-role och ansvarar därför för uttrycklig validering och behörighet. Det är avsiktligt att en vanlig Supabase-klient inte kan lista order.

Ägaren finns i Supabase Auth. `requireAdmin` verifierar användaren med `getUser`, kräver bekräftad e-post och jämför den mot serverns `ADMIN_EMAILS`. En egen admin-tabell behövs inte för denna enkla allowlist. Inloggad betyder inte automatiskt administratör.

Publik orderläsning kräver både kod och hemlig token. Databasen sparar tokenhash; API:t jämför säkert och returnerar ett begränsat `PublicOrder` utan kontaktuppgifter och adminnoteringar. Skicka inte privata länkar till analysverktyg eller loggar.

`create_catering_order` är `SECURITY INVOKER` och kan bara anropas av `service_role`. V2:s begränsnings-/betalningsfunktioner har också uttryckligt borttagna publika körningsrättigheter. V2:s bucket `catering-media` är avsedd för företagets publika bilder/filmer, inte kunddokument.

Se [Supabases RLS-guide](https://supabase.com/docs/guides/database/postgres/row-level-security) för bakgrunden. Verifiera migration, roller och avvisade obehöriga anrop i en riktig testdatabas före produktion.
