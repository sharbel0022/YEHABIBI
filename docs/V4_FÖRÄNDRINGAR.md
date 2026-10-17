# V4 och V4.1 – förändringar

## V4.1: fel- och åtgärdsrapport före ändringar, 2026-10-17

Granskningen omfattar mobilens skärmar/stödfiler, webbens kund- och adminvyer, API/serverkod, shared, migrationer, tester och konfiguration. Utgångspunkt: main `4f9111b`.

| Identifierat problem | Planerad åtgärd |
| --- | --- |
| Sites har endast URL/indexeringsflaggor och `ORDERS_ENABLED=false`, `PAYMENTS_ENABLED=false`; inga Supabase-, Stripe- eller Resend-uppgifter. Lokalt saknas webbens `.env.local`. | Behåll spärrarna. Dokumentera exakt konfiguration; testa i separat miljö utan produktionsdata. |
| Enda anslutna Supabase-projektet heter `sharbel0022's Project` och är `INACTIVE`; kopplingen till Yehabibi är inte verifierad. Stripe visar en testmiljö `Quick match`, utan verifierat företagsägarskap. | Inga ändringar i dessa konton utan identifiering/godkännande. Externa flöden räknas inte som verifierade. |
| Expo-byggaren startar med filtret `valda`, så första besöket är tomt. Webbens väljare startar redan med alla rätter. | Visa Alla rätter från början i Expo; behåll menyutkast och tydlig summering. |
| Mobilen har textfält för datum/tid, svag laddnings-/felåterkoppling och saknar tangentbordsanpassning. | Native datum-/tidsväljare, tydlig retry och kompakt synlig summering i befintliga filer. |
| Bekräftelsen på webben visar ingen orderkod. Datumväljaren saknar bokningsgränser; mobilens slutkontroll saknar styckpris. | Visa ordernummer och fullständig översikt, bind datumgränser till delad logik. |
| Adminuppladdning kan kopplas till fel utkast efter flikbyte; inställningsvyn läser äldre leverans-/kampanjfält. | Lås rätt redigering under uppladdning, använd aktuell katalog/inställningsprojektion och testa zonbevarande. |
| Ägarmejl saknar leveransadress och paketrader. Vanliga statusmejl saknar beständig betalningskö. | Förbättra meddelandets faktiska orderinnehåll och verifiera fel/återförsök utan förlorad order. |
| Befintliga 32 tester använder PGlite och mockad Checkout, inte hela HTTP→PostgREST→PostgreSQL/Stripe/Resend. | Lägg till isolerad riktig databas-/API-verifiering om runtime går att starta; särredovisa externa begränsningar. |

Verkliga priser/portioner får bara komma från företagets admin. Specifikationens exempel är testdata och publiceras inte som godkända priser.

## V4.1: genomförda rättningar

- Expo öppnar Alla rätter och visar fast summering/Fortsätt, tydlig katalogretry och korrekt tangentbordshantering. Native datum/tid och SHA-256-baserade återförsök använder SDK57:s officiella moduler med reserv för äldre egna byggen.
- Webben visar ordernummer, fyra steg med delad kontaktvalidering, datumgränser, styckpriser/portioner och kompakt synlig totalsumma. Admin låser redigeringen under uppladdning och visar begripliga fel.
- Inställningar bevarar moderna leveranszoner och deras ID. En arkiverad bred grundzon återaktiveras inte. Pris per person inkluderar leverans i den delade beräkningen.
- Alla orderbesked köas i PostgreSQL med snapshot och mottagarkvittenser. Ägarens mejl innehåller kontakt, adress, datum, rätter/paket och betalningsönskemål. Ersatta pris-/betalbesked markeras separat; de kallas inte levererade.
- Utgångna Stripe-sessioner hanteras, dubbla gamla webhookar förblir idempotenta efter sessionsbyte och betalspärren är densamma i monorepo och Sites. Paketmejl använder originalpris och separat accepterad justering.
- En ny kompakt integrationsfil provar riktig PostgreSQL/PostgREST/Next HTTP. Auth/Stripe/Resend ersätts bara i testprocessen; inga produktionsbypasser införs. CI kör samma flöde med checksumkontrollerad PostgREST.

Fyra nya filer behövs: två små webbgränser (`loading.tsx`, `global-error.tsx`), en additiv SQL-migration och ett integrationstest. Inga nya mobilskärmar, API-lager eller dokumentmappar skapas. Befintlig design och Expo-identitet bevaras. Faktiska resultat och begränsningar finns i [TESTER.md](TESTER.md).

## V4 – förändringar från V3

V4 utvecklar den befintliga monorepon. SDK57, Expo-projektet, V2:s katalog-ID:n och tidigare orderhistorik bevaras.

## Kundupplevelse

- Vit bas, sandfärgade paneler, cedergrönt, röd accent, serifrubriker och befintliga matbilder.
- Ny Yehabibi-startsida i Expo/webb med Hemma/Fest/Företag, favoriter och endast aktiva datumgiltiga kampanjer.
- Fyra synliga mobilflikar. Beställning och egen meny öppnas från sammanhanget.
- Kategorier, bilder, plus/minus, kökets portionsförslag och tydliga radsummor.
- Menyutkast bevaras mellan vyer. Kontaktuppgifter sparas inte i utkastet.
- Fyra beställningssteg och fullständig översikt före förfrågan. Pris per person är en jämförelse, inte delbetalning.
- Privata statusvyer och uttryckligt godkännande av nytt pris innan betalning.

## Backend och admin

- Server-/SQL-verifierade priser och stabil återförsöksnyckel mot dubbel order.
- Offertrevisioner, historiska orderrader och separat accepterad prisjustering.
- Gransknings- och påvägstatus. Orderstatus och betalstatus förblir separata.
- Checkout begränsar till kort/plånbok eller aktiverad Swish. Kontanter endast vid hämtning. Ingen faktura/Klarna/delbetalning aktiveras.
- Signerade webhooks, nya betalningsförsök efter bekräftat misslyckande och beständig kö för betalningsbesked.
- Adminsökning, status-/betalfilter, paginering, tydliga prisförslag och återsändning av statusmejl.
- Kundens Expo-token registreras med privat ordertoken; ägarpush behåller adminbehörighet. Notiser är avstängda tills tjänsten konfigurerats.

## Kodens storlek och läsordning

Mobilen behåller sex skärmar och tre stödfiler. Webben återanvänder befintliga komponenter. Endast två små UI-filer tillkommer: `order-draft.ts` för matval och `OrderTracking.tsx` för kundens status/acceptans. Affärsreglerna ligger i befintliga shared-filer. En tilläggsmigration och en V4-testfil samlar backendändringarna. Dokumentationen återanvänds, med denna översikt och BETALNINGAR som nya dokument.

Läs [FIL_FOR_FIL.md](FIL_FOR_FIL.md) och [ARKITEKTUR.md](ARKITEKTUR.md). Varje fil har ett ämne; inga separata filer behövs för varje litet kort eller knapp.

## Vad som behöver företagets riktiga miljö

Publicerad Sites är en stängd demonstration tills företaget konfigurerat Supabase, priser, allergener, kontakt, zoner och villkor. Databasmigrationen finns i Git och körs separat i godkänd miljö. Verkliga Stripe-testbetalningar, Resend-leverans och FCM/APNs-notiser återstår; de påstås inte verifierade av lokala tester.

ExpoGo visar appen på iPhone med SDK57. Fjärrpush behöver installerad native-build och rätt tjänsteuppgifter. Faktura väntar på separat kredit-/villkorsarbete. Native ägarinloggning, automatisk bakgrundsåtersändning av vanliga statusmejl och butiks-submit ingår inte som färdigkonfigurerade funktioner.

[Testresultat och bygglänkar](TESTER.md), [Expo i Windows](EXPO.md) och [publicering/butikskrav](PUBLICERING.md) anger exakt vad som körts och återstår.
