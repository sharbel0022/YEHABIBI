# Direktorder, paket och tider i V4.4

Webb och Expo använder samma `/api/catalog`, `/api/availability`, `/api/orders/direct` och betalningsmotor. Catering använder befintliga `/api/orders` och offertrevisioner. Framtida datum innebär inte automatiskt offert.

## Katalog och pris

En menyrad är en faktiskt konfigurerad paketstorlek. `package_group` samlar storlekar och `size_label` beskriver dem. `package_portions` är antal portioner i paketet; det multiplicerar inte paketpriset. `included` beskriver exakt innehåll/mängd, `allergens` ansvarigs verifierade information. Samma generiska bild får bara användas som tydligt märkt illustration tills godkänd produktbild finns.

- Direkt: `menus.price_ore × antal paket`.
- Cateringpaket: `menus.catering_price_ore × antal personer`.
- Tillbehör/egen meny: `dishes.price_ore × antal enheter`, med `portion_label` som styck/fat/portion.
- Leverans: servervald aktiv zon och dess konfigurerade avgift.

Allt räknas i heltalsöre. Servern kontrollerar förväntat totalpris på nytt när ordern skapas och sparar frysta rader. Kundbelopp, gammal katalog och gamla tider kan inte skriva över aktuella regler. Tillbehör kräver både aktiverad rätt och paketets `allowed_addon_ids`. Inga automatiska komponentbyten finns.

## Kundens tre steg

1. **Mat och tid:** välj storlek, paketantal, tillbehör, hämtning/leverans och snarast/vald tid. Leverans frågar tidigt efter postnummer. Snarast betyder serverns första möjliga tid.
2. **Granska:** serverns paket- och tillbehörsrader, enhetspriser, avgift, totalsumma och valda tid. Tillbaka behåller övriga val. Ändrat pris kräver ny granskning.
3. **Kontakt och betalning:** namn, telefon och e-post; för leverans dessutom adress/postnummer och ort. Inget kundkonto. Villkor/allergener finns före köp. Ordern reserveras före onlinebetalning och bekräftas först efter verifierat besked. Kontant vid hämtning följer separat aktiverad företagsregel.

Efter slutförd direktorder kopierar återbeställning endast produkt-ID, paketantal och tillbehör till ett nytt utkast. Pris, tid, personuppgifter, ordertoken, kampanj, betalning och reservation följer inte med.

## Tid och belastning

PostgreSQL använder serverns aktuella tid och `Europe/Stockholm`. API:t accepterar ingen betrodd klientklocka. Öppettider, hämtnings-/leveranstider, sista beställningstid, avvikande dagar, stängning, minsta framförhållning, paus och buffert kontrolleras både vid visning och skapande.

Paketets grundtid ökar med `extra_preparation_minutes` för varje konfigurerad mängdgrupp `extra_preparation_every`. Tillbehörets minsta tillagningstid beaktas också. Köksbuffert läggs till. Kapacitetsfönstret omfattar minst ett bokningsintervall även för mycket kort tillagning. Servern fryser `preparation_starts_at` i ordern. Senare paus/buffert ändrar bara nya val.

Leverans kräver konfigurerad transporttid. Kunden ser ett fönster med `starts_at`/`ends_at`. Ingen GPS eller extern transport beräknas. Globala leveransgränser, zonkapacitet och zonens högsta paketantal gäller samtidigt. Extern Wolt Drive kräver separat avtal och implementation.

Sommartidens obefintliga tider utelämnas; vintertidens dubbla lokala tider skiljs med UTC-offset. Övernattande öppettider och explicita undantag hanteras av samma servermotor.

## Atomär kapacitet och betalning

`capacity_reservations` är den enda nya affärstabellen. Varje order reserverar köksarbete under förberedelsen och vid leverans dessutom transportresurs. Köksvikten är paketets arbetsenheter gånger antal plus tillbehörens arbete. Godkänd catering och manuellt registrerad belastning räknas i samma resursbudget.

Alla kapacitetsmutationer låser först samma `direct_order_settings`-rad, sedan order/försök. PostgreSQL kontrollerar högsta samtidiga belastning under hela intervallet. Två kunder kan därför inte båda få sista kapaciteten. Kampanjens begränsade paketantal räknas under samma lås; giltiga reservationer och bekräftade order förbrukar mängden.

En ny onlineorder är `held`, med serverstyrd tidsgräns. En reservation utan påbörjad betalning kan löpa ut. När ett hållbart betalningsförsök har reserverats skyddas tiden under skapande/pågående/oklar betalning. Klientens nedräkning frigör aldrig resurser.

Verifierat avslag frigör kapacitet; ett uttryckligt nytt försök måste återförvärva samma tid och använder samma betalningsidentitet. Ett oklart nätverksfel eller en utgången extern länk kräver avstämning och frigörs inte som säkert misslyckad betalning.

Verifierat betalt bevaras alltid som finansiell sanning. Finns reservationen och förberedelsen fortfarande framför oss blir kapaciteten `confirmed`. Saknas den eller har förberedelsestarten passerat blir kapaciteten `review` med `capacity_unavailable_after_payment`. Köket kontaktar kunden om ny tid eller verifierad återbetalning; ingen annan kunds plats tas. Återbetalning kan genomföras i detta kända avvikelsefall, medan andra finansiella avvikelser förblir spärrade för avstämning.

## Viktiga filer

| Fil | Ansvar |
| --- | --- |
| `packages/shared/types`, `validation`, `ordering`, `scheduling` | Gemensamt kontrakt, validering, prisvisning, återbeställning och kundstatus |
| `packages/api-client/index.ts` | Samma API-anrop med timeout på webb/Expo |
| `apps/web/src/components/DirectOrderForm.tsx` | Webbens tre steg |
| `apps/mobile/app/direkt.tsx` | Expo-kassan på samma kontrakt |
| `apps/web/src/lib/data.ts` | Tillåtna publika katalog- och orderfält |
| `20261018131608_complete_restaurant_capacity_catalog_v44.sql` | Katalog, tider, arbetsenheter, reservation, kampanj och köks-RPC |
| `20261018140000_capacity_payment_lifecycle_v44.sql` | Låsningsordning och koppling mellan verifierad ekonomi och kapacitet |
| `test-support/payments` | Privat signerad simulator, endast i isolerad testkopia |

Se [testresultaten](TEST_V44.md), [köksguiden](KITCHEN_ADMIN_GUIDE.md) och [plan/nuläge](YEHABIBI_V44_COMPLETE_PLAN.md).
