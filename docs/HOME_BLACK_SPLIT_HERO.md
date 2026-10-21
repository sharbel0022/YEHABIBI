# Startsida: svart Catering & Fest

Implementerat och lokalt verifierat 2026-10-21 på branchen `home-black-split-hero-redesign`.

Startsidan består av header, två helt klickbara bildpaneler och en kompakt footer. Bildreferensens svarta grund, vita handskrift, guldlinjer, stora serifrubriker och nedre textplacering ligger till grund för designen. Undersidorna använder fortsatt sin befintliga header, logotyp och footer.

## Ändrade filer

| Fil | Ansvar |
| --- | --- |
| `apps/web/src/app/page.tsx` | Hämtar befintlig innehållskatalog och visar bara `HomeSplitHero`. |
| `apps/web/src/components/home/HomeSplitHero.tsx` | Två serverrenderade länkar till `/catering` respektive `/festlokal`, med bilder och den begärda texten. |
| `apps/web/src/components/home/HomeSplitHero.module.css` | Bildlayout, övertoningar, guldram, 3 % zoom, 5 px textrörelse, fokus och reducerad rörelse. |
| `apps/web/src/app/home.css` | Startsidesavgränsad svart header/footer och responsiv skärmhöjd. |
| `apps/web/src/app/layout.tsx` | Importerar de avgränsade startsidesreglerna. |
| `apps/web/src/components/Header.tsx` | Aktiverar startsidesvariant på `/`; återanvänder länkar, telefonnummer och dialogmeny. |
| `apps/web/src/components/Footer.tsx` | Kompakt variant på `/`, befintliga sociala länkar om sådana finns och dynamiskt copyrightår. |
| `apps/web/src/components/Brand.tsx` | Valbar handskriven logotyp; befintlig variant är fortsatt standard. |
| `apps/web/public/brand/ye-habibi-signature.svg` | Skalbar vit/guldig logotyp med rött hjärta, cirka 13,6 kB. Mindre visningsstorlek på mobil och i footer. |
| `apps/web/public/brand/Sacramento-OFL.txt` | Licens för handskriftens källa. |
| `apps/web/public/brand/sources.json` | Källor, licens och status för den återskapade logotypen. |
| `docs/HOME_BLACK_SPLIT_HERO.md` | Denna ändrings- och verifieringsrapport. |

Inga beroenden, undersidesrutter, databasfiler, betalningsfunktioner eller privata testfunktioner har ändrats.

## Bilder och original som saknas

De befintliga lokala WebP-bilderna `meze.webp` och `dukning.webp` återanvänds. Deras befintliga källförteckning anger att bildrättigheter och koppling till aktuellt erbjudande återstår att godkänna. Därför syns **Bildexempel** på båda panelerna, med motsvarande alternativtexter. När den befintliga publika katalogen innehåller godkänt menyfoto eller publicerat, godkänt lokalfoto används det automatiskt i respektive panel. Inga foton har skurits ut ur referensbilden.

Lokala foton levereras med Next Image, responsiva storlekar och förladdning. Befintligt stöd för administratörens externa HTTPS-bilder bevaras utan att utöka webbplatsens bildhostpolicy; sådana bilder levereras utan Next-optimering.

Originalets logotypfil finns inte i projektet. SVG-versionen återskapar dess uttryck med konturer från Sacramento, distribuerat med [SIL Open Font License 1.1](https://github.com/google/fonts/blob/main/ofl/sacramento/OFL.txt). Den kräver ingen fontnedladdning i webbläsaren.

För en exakt bildmatchning behövs:

- Originalfotot av ostrullar/kubbe från referensen, helst minst 1600 px brett och utan inbakad text.
- Originalfotot av den varma festdukningen med rosor, vinglas och levande ljus. Den befintliga dukningsbilden är en annan bild.
- Originalets Ye Habibi-logotyp, helst SVG eller transparent PNG i hög upplösning.
- Bekräftade rättigheter för fotona. Sociala länkar visas först när de finns i den befintliga innehållskatalogen; inga har hittats på.

## Lokal verifiering

| Kontroll | Resultat |
| --- | --- |
| `npm run syntax` | Godkänd. |
| `npm run typecheck` | Godkänd i befintliga workspaces. |
| `npm test` | 252 tester godkända, 0 misslyckade. |
| `npm run build` | Next-produktionsbygge godkänt. |
| `npm run test:web` | Godkänt: 14 sidor, serverrendering, katalog och befintliga skydd. |
| Webbläsare | Chromium/Chrome mot lokalt produktionsbygge utan extern databas, betalningar eller meddelandesändning. |
| Layout | 1440 × 900, 1280 × 800, 390 × 844, 360 × 800, 768 × 1024 och 1920 × 1080. |
| Tillstånd | Ingen hover, Catering-hover, Fest-hover, tangentbordsfokus samt mobilmeny öppen. |
| Hover | Guldram, bildskala 1,03, textförflyttning −5 px och andra panelens mörkläggning. Samma panelmått före/efter hover. |
| Navigation | Båda panelerna, headerlänkar och retur till startsidan via klientnavigation. Undersidornas vita header och ursprungliga footer återkommer. |
| Tillgänglighet | Tab/Enter till båda panelerna, synligt fokus, dialogens fokusfälla, Escape och återställt fokus. Reducerad rörelse ger ingen zoom/förflyttning och inga övergångar. |
| Mobil | Staplade paneler, fungerande touch och meny. Ingen horisontell scroll. |
| Extra reflow | 320 × 568, 844 × 390 och 200 % text vid 360 och 1280 px bredd, utan horisontell scroll eller avklippt beskrivning. |
| Utan JavaScript | Catering-panelens vanliga länk öppnar korrekt sida. |

Vid 1440 × 900 är headern 81 px, huvudytan 740 px och footern 79 px. Båda panelerna är 720 px breda. På små skärmhöjder får sidan scrolla; text och footer klipps inte av.

Skärmbilder och maskinläsbar mätning sparas lokalt i `.tmp/home-redesign/`. Filnamnen anger upplösning och tillstånd, exempelvis `1440x900-idle.png`, `1440x900-catering-hover.png`, `1440x900-fest-hover.png`, `1440x900-keyboard-focus.png`, `390x844-idle.png` och `360x800-menu-open.png`. Katalogen är avsiktligt Git-ignorerad.

Inga nya körfel hittades i applikationen. Webbläsaren rapporterar en separat, befintlig 404 för `/favicon.ico`; projektet saknar den filen. Den noteras separat i `browser-results.json` och har inte åtgärdats inom startsidesändringen. Provet verifierar `tel:+4621415711` utan att ringa ett verkligt samtal.

## Pull request och publicering

Arbetet utgår från `yei-habibi-catering-fest-redesign`, som redan innehåller Catering & Fest-grunden och är föremål för PR #16. Den nya PR:n riktas mot den branchen så att diffen enbart omfattar startsidan. PR #16 ändras eller mergas inte av detta arbete.

Den befintliga GitHub-workflowen kör endast PR:er mot `main`. Den nya PR:n ska därför inte mergas på grundval av enbart lokala kontroller. När grundändringen har integrerats och denna PR riktats mot `main` ska CI vara grön före merge. Inga CI-spärrar eller workflowfiler har ändrats.

Ingenting har publicerats till `yehabibi.se`. Publicering är en separat åtgärd som kräver uttryckligt godkännande.
