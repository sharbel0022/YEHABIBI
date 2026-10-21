# Startsida: svart Catering & Fest med exakt användarens bilder

Implementerat och lokalt verifierat 2026-10-21 på branchen `home-black-split-hero-redesign`.

Startsidan består av svart header, två helt klickbara bildpaneler och en kompakt svart footer. Användarens senaste instruktion är styrande: **endast de två bifogade panelbilderna och den bifogade logotypen används på Hem**. Inga alternativa foton, katalogbilder eller återskapade logotyper används där.

## Exakta originalfiler

| Bilaga | Fil i projektet | SHA-256 |
| --- | --- | --- |
| Catering, `154e441e-cc2b-4a4d-81aa-718811bcc5ab` | `apps/web/public/images/home/catering.png` | `5f10c7941260d74855e4e6ba21c2b5b531c67b8a68436a77c45efd1bc24feeeb` |
| Fest, `cbc6870c-9a55-4d65-a931-214637b82775` | `apps/web/public/images/home/fest.png` | `c577d95cddec0ac49f0de9fbba84bc525b766736de9e6d2e862efa901bd8f76f` |
| Logotyp, `8dbb5937-9b8e-4b8c-bf19-207d334e60b7` | `apps/web/public/brand/ye-habibi.png` | `ca0a57c848bf0fbb915b315fcb8e996809357d7e15b739190cb0885806f46a55` |

Alla tre filerna är kopierade byte för byte från bilagorna. Hasharna är jämförda både mot originalfilerna och mot filerna som produktionsservern faktiskt levererar över HTTP. Källor och hashar finns även i `apps/web/public/brand/sources.json`.

Panelerna är 724 × 724 px och logotypen 233 × 68 px. Ingen omritning, retuschering, omkomprimering eller ny font används. Next Image används med `unoptimized` och förladdning för att bevara PNG-originalen. De två panelerna väger tillsammans cirka 1,8 MB.

## Layout och interaktion

De bifogade panelbilderna innehåller redan rubrik, beskrivning och mörk övertoning. Dessa visas därför direkt i sin helhet, utan extra synlig text, bildetiketter, pilknappar eller övertoning ovanpå. Den tidigare tillfälliga logotypen och dess fontlicens har tagits bort från slutändringen.

Bilderna behåller kvadratiska proportioner och visas utan beskärning i normalläget. Desktop har två lika breda paneler. Vid högst 900 px bredd staplas de för att hålla texten i de kompletta bilderna läsbar. På skärmar vars proportioner inte motsvarar två kvadrater kan en diskret svart yta uppstå runt bilderna, eller sidan scrolla, så att hela bildinnehållet bevaras.

Hela Catering-panelen länkar till `/catering`, hela Fest-panelen till `/festlokal`. Efter användarens önskemål om starkare pop-out ger hover en tydligare guldram med diskret glöd, 6,5 % zoom och en lätt ljus-/kontrasthöjning av den aktiva bilden. Den andra panelen får ett 62 % svart lager. Texten följer bilden eftersom den är inbakad i originalet; den animeras inte separat. Inga layoutförskjutningar uppstår. Touch behöver ingen hover. Reducerad rörelse stänger av zoom och övergångar. När pekaren lämnar panelerna återställs båda till normalläget.

HTML-rubriker och beskrivningar finns kvar för skärmläsare och länkarnas tillgängliga namn, men är visuellt dolda så att texten inte dubblas. Text som ingår i bilden kan inte få oberoende fontstorlek eller radbrytning; detta följer valet att visa exakt originalbilden. Båda länkarna fungerar med Tab/Enter och får tydlig fokusram.

Befintlig meny, dialogens fokusfälla och återställda fokus, telefonnumret `tel:+4621415711` och kontaktkatalogens eventuella sociala länkar återanvänds. Inga sociala adresser eller kontaktuppgifter har hittats på. Undersidorna använder fortsatt sin befintliga header, logotyp och footer.

## Ändrade filer jämfört med grundbranchen

| Fil | Ansvar |
| --- | --- |
| `apps/web/src/app/page.tsx` | Visar bara `HomeSplitHero`; ingen separat introduktion, menylista eller extra sektion. |
| `apps/web/src/components/home/HomeSplitHero.tsx` | Exakt de två bifogade bilderna, fulla panellänkar och tillgänglig HTML-text. |
| `apps/web/src/components/home/HomeSplitHero.module.css` | Bildlayout, guldram, hover, fokus och reducerad rörelse. |
| `apps/web/src/app/home.css` | Startsidesavgränsad svart header/footer och responsiv skärmhöjd. |
| `apps/web/src/app/layout.tsx` | Importerar de avgränsade startsidesreglerna. |
| `apps/web/src/components/Header.tsx` | Aktiverar startsidesvariant på `/` och använder den bifogade logotypen även i mobilmenyn. |
| `apps/web/src/components/Footer.tsx` | Kompakt variant på `/`, samma logotyp, befintliga länkar och dynamiskt copyrightår. |
| `apps/web/src/components/Brand.tsx` | Valbar startsideslogotyp; befintlig variant är fortsatt standard på undersidor. |
| `apps/web/public/images/home/catering.png` | Exakt bifogad Catering-bild. |
| `apps/web/public/images/home/fest.png` | Exakt bifogad Fest-bild. |
| `apps/web/public/brand/ye-habibi.png` | Exakt bifogad logotyp. |
| `apps/web/public/brand/sources.json` | Bilagornas källnamn och SHA-256. |
| `docs/HOME_BLACK_SPLIT_HERO.md` | Denna ändrings- och verifieringsrapport. |

Inga beroenden, undersidesrutter, databasfiler, betalningsfunktioner eller privata testfunktioner har ändrats.

## Lokal verifiering efter bytet till de exakta bilderna

| Kontroll | Resultat |
| --- | --- |
| `npm run syntax` | Godkänd. |
| `npm run typecheck` | Godkänd i befintliga workspaces. |
| `npm test` | 252 tester godkända, 0 misslyckade. |
| `npm run build` | Next-produktionsbygge godkänt. |
| `npm run test:web` | Godkänt: 14 sidor, serverrendering, katalog och befintliga skydd. |
| Bildidentitet | Samtliga tre levererade HTTP-filer har samma SHA-256 som användarens bilagor. |
| Webbläsare | Chromium/Chrome mot lokalt produktionsbygge utan extern databas, betalningar eller meddelandesändning. |
| Layout | 1440 × 900, 1280 × 800, 390 × 844, 360 × 800, 768 × 1024 och 1920 × 1080. |
| Tillstånd | Ingen hover, Catering-hover, Fest-hover, tangentbordsfokus samt mobilmeny öppen. |
| Hela bilder | Bildens proportioner och kanter ryms inom respektive panel i normalläget, utan dubbel text eller horisontell scroll. |
| Hover | Guldram med glöd, bildskala 1,065 och 62 % svart lager på den andra panelen. Samma panelmått före/efter hover. Återställning när pekaren lämnar panelerna. |
| Navigation | Båda panelerna, headerlänkar och retur till startsidan via klientnavigation. Undersidornas vita header och ursprungliga footer återkommer. |
| Tillgänglighet | Tab/Enter till båda panelerna, synligt fokus, dialogens fokusfälla, Escape och återställt fokus. Reducerad rörelse ger ingen zoom och inga övergångar. |
| Mobil | Staplade paneler, fungerande touch och meny. Ingen horisontell scroll. |
| Extra reflow | 320 × 568, 844 × 390 och 200 % HTML-text vid 360 och 1280 px bredd, utan horisontell scroll eller beskärning av panelbilden. |
| Utan JavaScript | Catering-panelens vanliga länk öppnar korrekt sida. |

Vid 1440 × 900 är headern 81 px och footern cirka 78 px. Båda panelerna är 720 px breda och delar huvudytans höjd. Vid 1280 × 800 ryms både huvudytan och footern utan vertikal scroll. Bilder och footer får plats i dokumentflödet även på mindre skärmar.

Skärmbilder och maskinläsbar mätning finns lokalt i `.tmp/home-redesign/`. Exempel: `1440x900-idle.png`, `1440x900-catering-hover.png`, `1440x900-fest-hover.png`, `1440x900-keyboard-focus.png`, `390x844-idle.png` och `360x800-menu-open.png`. Katalogen är Git-ignorerad.

Inga nya körfel hittades i applikationen. Webbläsaren rapporterar en separat, befintlig 404 för `/favicon.ico`; projektet saknar den filen. Den noteras separat i `browser-results.json` och har inte åtgärdats inom startsidesändringen. Telefonlänken har verifierats utan att ringa ett verkligt samtal.

## Pull request och publicering

Arbetet utgår från `yei-habibi-catering-fest-redesign`, som innehåller Catering & Fest-grunden och är föremål för PR #16. Den nya PR:n riktas mot den branchen så att diffen enbart omfattar startsidan. PR #16 ändras eller mergas inte av detta arbete.

Den befintliga GitHub-workflowen kör endast PR:er mot `main`. Den nya PR:n ska därför inte mergas på grundval av enbart lokala kontroller. När grundändringen har integrerats och denna PR riktats mot `main` ska CI vara grön före merge. Inga CI-spärrar eller workflowfiler har ändrats.

Ingenting har publicerats till `yehabibi.se`. Publicering kräver ett separat uttryckligt godkännande.
