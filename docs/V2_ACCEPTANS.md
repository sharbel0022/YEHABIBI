# Cedar Mezze V2 – leveransstatus och testplan

**V2-historik:** Listan beskriver V2:s funktioner och acceptanskrav före Expo-uppgraderingen. Den bevaras som regressionsunderlag. V3:s aktuella kommandon och faktiska resultat finns i [TESTER.md](TESTER.md). Databasen uppgraderas i ordningen **0001 → 0002 → 20261017121516** enligt [DATABAS.md](DATABAS.md); kör inte om redan tillämpade migrationer.

## Implementerat i koden
- Vit design, cedergrön identitet och tydliga Hemma / Fest / Företag.
- Meny med färdiga paket och enskilda rätter med +/−, styckpris, portionshjälp och allergener.
- Livekalkyl: rader, totalsumma och pris per person.
- Hämtning eller hemleverans med konfigurerbara postnummerzoner.
- Skyddat API som räknar om priser från databasen och sparar en historisk ordersnapshot.
- Admin för maträtter, färdiga menyer, beställningar, kampanjer och media.
- QR-koder och Google-länkar i tidigare version bevarade.
- Kontant betalning endast vid hämtning; inte markerad betald automatiskt.
- Lokal SEO, sitemap och robots som inte indexerar sidan förrän ägaren godkänt.

## Måste göras av företaget före produktion
- Kontrollera och godkänna namnet Cedar Mezze och domänen.
- Kör migration **0001** och därefter **0002** i företagets Supabase-projekt.
- Aktivera skyddad Supabase Admin-inloggning och verifiera behörighet.
- Lägg in verkliga priser, storlekar, allergener, postnummerzoner och kontakt.
- Ladda upp egna bilder och MP4 från fotografen med användningsrätt.
- Aktivera ägarens Stripe/Swish samt Resend i testläge och därefter med godkänd livekonfiguration.
- Verifiera webbplatsens lagtexter, korrekt momssats, kassaregister och avbokningsvillkor.
- Kontrollera Google Business Profile och sätt officiell recensionslänk.
- Gör manuella testbeställningar med riktig testdatabas och testbetalningar.
- Skicka sitemap till Search Console när den riktiga domänen är klar.

## Manuella kontrollfall (använd endast testuppgifter)
1. Öppna startsidan på iPhone: video pausas, stor vit layout, knappar synliga.
2. Välj Hemma, 6 personer. Lägg 12 ostrullar och 2 hummusfat. Kontrollera radpris och totalsumma.
3. Växla mellan leverans och hämtning. Kontrollera att kontant bara erbjuds vid hämtning.
4. Ange `722 12` och kontrollera att matchande postnummerzon väljer korrekt leveranspris.
5. Skicka en förfrågan efter migration 0002. Kontrollera att ägaren får mejl och att orderraderna sparats.
6. Försök manipulera ett pris i webbläsaren: servern ska använda databaspriset, inte det falska beloppet.
7. Godkänn förfrågan i admin. Betalningslänk skapas för Swish/kort efter godkännande.
8. Testa verifierad Stripe-webhook och kontrollera att bara riktig bekräftelse ger Betald.
9. Kontantorder: notis till ägaren och betalningsstatus Obetald tills kontanter tas emot.
10. Aktivera tidsstyrd kampanj. Kontrollera att den inte syns före start eller efter slut.
11. Byt foto/video i admin och kontrollera hur reservbilden fungerar vid långsam anslutning.
12. Sätt officiell Google-recensionslänk och testa QR-koden med mobilkamera.

## Automatiska kontroller
`npm run syntax` · `npm run test` · `npm run typecheck` · `npm run build`

**Status:** Produktfunktioner i kod är inte lika med produktionssatt tjänst. Ingen livebetalning eller Google-profil ska aktiveras utan företagets egna konton och godkända inställningar.
