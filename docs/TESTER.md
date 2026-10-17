# Tester och verifiering – V4

Resultaten avser V4-källan. Tidigare V3-byggen bevisar inte att nya native-moduler fungerar. V3-historiken finns i Git-historiken för detta dokument, bland annat commit6575987.

## Kör lokalt från roten

```powershell
npm install
npm run syntax
npm run lint
npm run typecheck
npm test
npm run build
npm run export:mobile
```

`npm run verify` kör syntax, typer, tester, Next-produktionsbygge och Expo-export. Lint är projektets syntaxkontroll; det är inte en separat ESLint-installation. TypeScript är en egen kontroll.

## Automatiska kontroller

| Kontroll | Faktiskt resultat |
| --- | --- |
| Syntax/lint | Syntax godkänd för TS/TSX |
| TypeScript | Mobil och webb godkända |
| Enhets-/integrationstester |32 av32 godkända; Node test runner |
| SQL | Hela migrationskedjan körd i PGlite med Supabase-roller/scheman ersatta lokalt |
| Expo SDK57-export | Android/iOS med Hermes och webb med8 statiska routes godkända; slutkälla kontrolleras efter UI-fixar |
| Webbbygge | Next16.4.2 webpack bygger alla routes; slutligt standardkommando kontrolleras efter sista ändringar |
| CI och EAS | Aktuella V4-resultat anges när körningarna är klara |

Tester omfattar öresberäkning/radsummor/personpris, ogiltiga mängder, gästminimum, datumfönster, hämtning/zoner, dolda rätter, återförsöksnyckel och ändrat innehåll, offertrevisioner, gamla prisrader, kundacceptans, nekad Checkout före acceptans, kontanter, signerade händelsers databasregler, dubbletter, sen misslyckad betalning efter betald och RLS/indragna funktionsrättigheter.

En oberoende kodgranskning hittade och rättade återförsök efter terminalt misslyckad Stripe-session, oönskade Checkout-metoder, totalsummering efter prisjustering, lagringsfel för återförsöksnyckel och gamla avpublicerade rättval. Den ersätter inte tester mot riktiga leverantörer.

## Manuella kontroller

V4:s nya startsida har granskats i webbläsare och startats i Androids ExpoGo med SDK57. Fler konkreta browser-/emulatorresultat och byggen läggs till nedan efter slutförd kontroll.

## Verifieringsgränser före lansering

Företagets Supabase, Stripe, Resend och FCM/APNs är inte anslutna i demonstrationen. Därför har ingen verklig kundorder, kortbetalning, Swish, ApplePay, levererad e-post eller push bekräftats. Inga fjärrmigrationer eller skarpa betalningar aktiveras av publiceringen. Supabase-advisors behöver köras i den verkliga testmiljön; lokala SQL-tester ersätter inte detta.

Betalningskö och återförsök testas lokalt. Push tar ett enda sändningsansvar för att undvika dubbletter; en processkrasch efter anspråket kan innebära utebliven push. E-post är reservvägen. Övriga misslyckade statusmejl kan administratören skicka igen; det finns ingen separat bakgrundskö för dessa i V4.

Fysisk iPhone-start bekräftades av användaren för V3/SDK57. V4 får inte räknas som fysiskt iPhone-testad utan nytt prov. Windows kan starta EAS iOS-build men kan inte köra iOS Simulator. Butiksbehörigheter, riktig företagstext, godkända priser/allergener och leverantörernas testflöden återstår innan lansering.
