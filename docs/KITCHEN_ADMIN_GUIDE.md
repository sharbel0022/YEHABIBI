# Köksadmin i V4.4

Admin är en skyddad del av befintliga Next.js-webben och fungerar på dator, surfplatta och mobil. Expo har kundflödet. Endast allowlistad, serververifierad personal får använda admin-API. Den privata testservern ger en separat syntetisk administratör.

## Fyra ingångar

**Beställningar:** nya, ska förberedas, under tillagning, klara, kommande, avslutade och problem. Filtreringen sker på servern före sidindelning. Läs vald tid, fryst förberedelsestart, mat/mängd, betalning och nästa åtgärd.

**Meny och paket:** skapa de storlekar som faktiskt erbjuds, med samma gruppnamn och eget storleksnamn. Ange paketpris separat från personpris för catering, exakt innehåll/mängd, allergener, tillåtna tillbehör, förberedelsetid och arbetsenheter. Paus/slutsålt påverkar nya köp. Kampanjer kan kopplas till produkter eller tydlig cateringförfrågan och begränsas med beställningsstopp, utlämningsdagar och paketantal.

**Tider och kapacitet:** konfigurera arbets-, hämtnings- och leveranstider, sista beställningstid, undantag/stängning, intervall, framförhållning, buffert, reservtid och resursgränser. Leveranszoner har aktiva postnummer, avgift, transporttid, leveransfönster, kapacitet och högsta paketantal. Registrera telefon-/externa beställningar som manuella kapacitetsreservationer och frigör dem när de avbokas.

**Inställningar:** företagsuppgifter, betalningsval, kontakt och övrig befintlig företagskonfiguration. Betalningskonto/nycklar är serverkonfiguration; inga livebetalningar aktiveras genom testflödet.

## Arbeta med en order

1. Kvittera att ordern är sedd. Kvittering ändrar varken pris eller kundtid.
2. Direkt onlineorder ska ha verifierad betalning och bekräftad kapacitet innan tillagning. Catering granskas/godkänns; en prisändring skickas som offertrevision som kunden måste acceptera.
3. Starta tillagning utifrån förberedelsestarten. Paus eller ökad väntetid ändrar inte redan bokade tider.
4. Spara packkontrollen: antal paket, tillbehör, såser/bröd, allergen-/specialmärkning och ordernummer. Alla punkter krävs före utlämning/utsändning av nya order.
5. Markera klar för hämtning eller på väg. Slutför när utlämning/leverans är genomförd. Kontantbetalning registreras uttryckligen när pengarna har tagits emot.

Orderutskrift använder webbläsarens vanliga utskrift. Den skyddade utskriftsvyn visar uppgifter som köket behöver och ingen privat kundtoken. Ingen specialskrivare krävs.

## Problem och betalningar

En betald order ska först återbetalas via verifierat leverantörsbesked innan den avbokas. Knappen för återbetalning betyder inte att pengar redan återförts. Se slutlig betalningsstatus.

Vid sen betalning utan hållbar kundtid visar problemvyn en avvikelse. Betalningen står kvar som betald. Kontakta kunden och ordna en ny överenskommen bokning eller återbetalning. Systemet flyttar aldrig automatiskt en bekräftad kundtid.

Registrera utebliven kund eller försenad leverans som intern avvikelse. `kitchen_note` är intern. `admin_note` hör till kundkommunikation och får inte användas som privat anteckning. Ingen fiktiv GPS visas.

E-postfel lämnar meddelandet i den beständiga outboxen för nytt försök. Ett skickat pushmeddelande är ingen kvittens på att köket sett ordern.

## Missade ordrar och snabbreglage

Aktivera bevakning och välj hur länge en bekräftad direktorder får vara okvitterad. Varningen bygger på sparade orderuppgifter och ligger kvar tills ordern kvitteras. Automatisk paus är ett separat aktivt val. Servern kör kontrollen även vid tillgänglighets- och orderanrop när admin är stängd. Därmed kan nya köp stoppas utan beroende av en öppen adminflik eller push.

Snabbreglagen pausar nya direktorder, höjer köksbufferten eller markerar paket slutsålda. Kontrollera orsaken innan du återupptar mottagningen. Redan bekräftade order behöver fortfarande hanteras.

## Personuppgifter och lansering

Använd individuella behöriga konton och begränsa orderåtkomst. Dela inte privata orderlänkar. Interna anteckningar ska vara sakliga och nödvändiga. Företaget måste fastställa lagringstid och genomföra dokumenterade rutiner för åtkomst, export/rättelse och radering/anonymisering med hänsyn till granskade bokföringskrav. Ingen generell raderingsfrist eller automatisk destruktion har uppfunnits.

[IMY:s principer](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/grundlaggande-principer) ligger till grund för dataminimering och begränsad åtkomst. Ansvarig ska granska tillämplig livsmedelsinformation enligt [Livsmedelsverkets stöd för e-handel](https://kontrollwiki.livsmedelsverket.se/artikel/975). Tekniska tester är inte en juridisk eller livsmedelsmässig certifiering.
