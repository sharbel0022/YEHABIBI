# Yehabibi V4.4 – komplett restaurang och catering

## Nuläge före ändringen

Utgångspunkt: verifierad main `1a69a8fd199332600e20816644ec36caedd2f5aa`, PR #8. Monorepot granskades före implementation: webb/API/admin, Expo SDK 57, shared/API-client, migrationskedjan, lokal PostgreSQL/PostgREST, betalningsmotor och testsviter.

Återanvänds: samma PostgreSQL-databas, privata orderlänkar, frysta orderrader i heltalsöre, offertrevisioner, signerade betalningshändelser, idempotens, outbox, allowlist för admin och isolerad testserver. Riktiga beställningar och betalningar hålls avstängda publikt.

Ändras: direktkassan från ett långt formulär till tre steg på webb och Expo; paketpriset skiljs från cateringens personpris; kökets sju ingångar samlas i fyra huvudsidor. Orderräkning ersätts av konfigurerade kapacitetsenheter.

Tillkommer: storleksgrupper, tillbehör, paus/slutsålt, köks- och leveransreservationer, tidsgräns före betalning, säker hantering av sena betalningar, kvittering, packkontroll, utskrift, intern avvikelsenotering, manuella reservationer och serverstyrd bevakning av okvitterade ordrar. Historiska ordrar bevaras.

## Underlag från officiell dokumentation

- [Square fulfillment](https://developer.squareup.com/docs/orders-api/fulfillments): skilj schemalagd utlämning från förberedelsestart och låt snarast följa tillagningstid.
- [Uber Eats store integration](https://developer.uber.com/docs/eats/guides/store-integration): köket behöver uttrycklig paus och avvikande öppettider.
- [Wolt Drive](https://developer.wolt.com/docs/api/drive): leveranslöften behöver verifierade uppgifter och avtal. Här används egna konfigurerade zoner; ingen extern transport ansluts.
- [Toast catering](https://support.toasttab.com/en/article/Getting-Started-with-Catering-Online-Ordering): större catering har framförhållning och offertbehov; packning behöver stöd i köksflödet.
- [Shopify checkout](https://help.shopify.com/en/manual/checkout-settings/checkout-form-options): gästbeställning och nödvändiga kontaktfält ger en kortare kassa.
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api): nya privata tabeller får RLS och uttryckliga service-role-rättigheter.

Detta är designunderlag. Ingen extern plattforms kod, formgivning eller varumärkesidentitet kopieras.

## Genomförande

1. Additiv katalog- och kapacitetsmigration, gemensamma typer och serverregler. Storlekar återanvänder menyrader och grupperas med `package_group`.
2. Tre steg: mat/tid → granska serverns pris → kontakt/betalning. Framtida standardpaket går genom samma direktköp.
3. Betalningsmotorn kopplas till kapacitet under samma databaslås. Verifierad finansiell sanning får aldrig skrivas om för att en tid saknas.
4. Fyra köksingångar med atomära åtgärder, packning, larm och manuella reservationer.
5. Regression, verkliga lokala HTTP/databastester, praktisk webb/Expo-kontroll, kodgranskning, PR och CI. Därefter uppdateras befintlig Sites-identitet med verifierad main.

## Lanseringsgräns

Testsortiment och bilder måste godkännas av företaget. Juridiskt namn, öppettider, upptagningsområde, exakta mängder, allergener, moms, avbokning, återbetalning, lagringstid och leverantörsavtal kräver ansvarigs kontroll. Ingen momsregel, rättslig grund eller juridisk tidsfrist uppfinns. Testresultat och faktisk publiceringsstatus redovisas i `TEST_V44.md`.
