# Fysiska enheter — verifieringsmatris V4.4.1

Status 2026-10-19: **fysiska prov blockerade**. Denna session har inte tillhandahållit verifierade fysiska telefoner, installerade signerade EAS-byggen, godkänd skyddad testanslutning eller verifierad leverantörssandbox. Inga liveköp används som ersättning. Lokal simulator, export, emulator och sandbox är olika bevisnivåer.

## Miljöprotokoll att fylla i vid verkligt prov

| Fält | iPhone Safari | iPhone installerad Expo/EAS | Android Chrome | Android installerad Expo/EAS | Datorwebb referens |
|---|---|---|---|---|---|
| Enhetsmodell | `<modell>` | `<modell>` | `<modell>` | `<modell>` | `<modell>` |
| OS/webbläsarversion | `<version>` | `<OS>` | `<version>` | `<OS>` | `<OS/webbläsare>` |
| Appversion/build-ID | `ej tillämpligt` | `<signerad build>` | `ej tillämpligt` | `<signerad build>` | `ej tillämpligt` |
| Backendcommit | `<SHA>` | `<SHA>` | `<SHA>` | `<SHA>` | `<SHA>` |
| Testmiljö/databas/merchant | `<test-ID>` | `<test-ID>` | `<test-ID>` | `<test-ID>` | `<test-ID>` |
| Skyddad anslutning/godkännande | `<ref/datum>` | `<ref/datum>` | `<ref/datum>` | `<ref/datum>` | `<lokal/skyddad>` |
| Utförare/tid/evidens | `<roll/tid/ref>` | `<roll/tid/ref>` | `<roll/tid/ref>` | `<roll/tid/ref>` | `<roll/tid/ref>` |

## Provfall

`B` = blockerat, inte utfört. Registrera senare `G` (godkänt), `F` (fel) eller `E/T` (ej tillämpligt, med skäl). Maskera ordertoken, kunduppgifter, checkout-URL och push-token i evidens.

| Fall och förväntan | iOS Safari | iOS app | Android Chrome | Android app | Dator manuell |
|---|---|---|---|---|---|
| Direktpaket + tillbehör; serverpris/kapacitet, hämtning och hemleverans | B | B | B | B | B |
| Catering; rätt prisrevision accepteras uttryckligen före betalning | B | B | B | B | B |
| Swish officiell testmiljö; avbryt och försök igen utan dubbel debitering | B | B | B | B | B |
| Visa/Mastercard officiell sandbox; framgång, avslag och 3DS | B | B | B | B | B |
| Apple Pay enligt vald modell/konto; inga antaganden enbart från iOS | B | B | B | B | B |
| Google Pay enligt vald modell/konto och verifierat stöd | B | B | B | B | B |
| Kontant endast hämtning; ingen extern session, behörig personal kvitterar | B | B | B | B | B |
| App → officiell betalningssida → app; serverstatus läses | B | B | B | B | B |
| Förfalskad retur `paid/success`; status får inte ändras | B | B | B | B | B |
| Avbrott, låst skärm, stängd app, återstart; samma orderhistorik | B | B | B | B | B |
| Wi-Fi ↔ mobilnät, offline och fördröjd webhook; oklart förblir oklart | B | B | B | B | B |
| Pushbehörighet av/på; leverans är inte mänsklig kökskvittering | B | B | B | B | B |
| Kökskvittering, påminnelse och eskalering med stängda kundsidor | B | B | B | B | B |
| Sandboxrefund; verifierad refund/historik, gammalt event raderar inte avvikelse | B | B | B | B | B |

## Faktiskt tillgängligt lokalt underlag

Källgranskning: `apps/mobile/app/ordrar.tsx` läser `api.getPaymentStatus` vid fokus, aktivt appåterinträde och uppdatering. `apps/mobile/lib/api.ts` öppnar checkout med operativsystemets `Linking.openURL`, ingen godtycklig WebView. Returparametrar används inte som betalningsbevis; status-API använder privat ordertoken och serverns verifierade data. Detta bevisar kodens avsikt, inte Swish-/walletbeteende på telefon.

Rootens slutliga testprotokoll redovisar körda automatiska sviter och Expo-export separat. En framgångsrik `expo export --platform all` bevisar bundling, inte native installation, pushbehörighet, deep linking, Apple Pay, Google Pay eller fysiskt prov. Ingen emulator eller leverantörssandbox har fått ett godkänt resultat här.

## Genomförande när blockerare är lösta

1. Företaget godkänner skyddad testhosting/VPN och syntetiska mottagare. Publicera aldrig lokal simulator på Sites eller en oskyddad tunnel.
2. Separat testdatabas och merchanttestkonto verifieras. Installera signerad build mot samma testbackendcommit; notera samtliga fält ovan.
3. Kör ett fall i taget och notera faktiska serverövergångar samt beständig historik. Undvik råa nätverksdumpningar med privata URL:er.
4. Prova verkligt appbyte, skärmlås, processavslut och nätverksbyte. Ändra aldrig serverstatus från returparametrar.
5. Granska avvikande prov, rätta och upprepa berörda fall. Köks- och betalningsansvarig godkänner resultat innan produktionsaktivering.
