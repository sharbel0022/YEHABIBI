# V4 – förändringar från V3

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
