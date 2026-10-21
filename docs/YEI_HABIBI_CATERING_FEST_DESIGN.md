# Yei Habibi Catering & Fest – design

Datum: 21 oktober 2026. Arbetsbranch: `yei-habibi-catering-fest-redesign`.

## Underlag och granskning

Designen utgår från [Yei Habibi Visuell Designmanual](https://docs.google.com/document/d/1krAw8g59hovi1YAuv_E09VInkwK-Fk08/edit), ett Word-dokument med 28 textavsnitt och 22 inbäddade designbilder. Hela dokumenttexten och samtliga 22 bilder har lästs inför implementationen. Dokumentets ritningar anger placering och beteende; dess stämningsbilder styrker inte faktauppgifter om verkliga lokaler.

Den [befintliga cateringsidan](https://www.yehabibi.se/catering/) och [festlokalsidan](https://www.yehabibi.se/festlokal/) är kompletterande källor. Företagsägaren måste godkänna priser, allergener, bildrättigheter och lokalfakta före lansering. Den nya upplevelsen kräver inget kundkonto och har ingen offentlig kassa.

## Identitet och färger

Kundsynligt namn är **Yei Habibi** med undertexten **CATERING & FEST**. Historiska databasidentifierare, paketnamn och betalningsreferenser behålls.

| Del | Värde | Användning |
| --- | --- | --- |
| Huvudbakgrund | `#FFFFFF` | Alla publika sidor |
| Cedergrön | `#155A43` | Logotyp, rubriker, primärknappar och länkar |
| Mörk text | `#202B27` | Brödtext |
| Linjer | `#DCE6DF` i skissens färgruta | Tunna ramar och avdelare |
| Röd accent | `#B63842` | Sparsamma små detaljer |

Ingen mörk helsidesbakgrund, orange text mot svart eller gul huvudbakgrund används. Cedersymbolen är ett grafiskt förslag som behöver ägarens slutliga godkännande.

## Typografi

Rubriker använder **Noto Serif Display**, normal stil, vikter 400–600. Brödtext och kontroller använder **Inter**, vikter 400–700. Webbfonterna ligger lokalt under `apps/web/public/fonts/`, laddas med `font-display: swap` och kräver inga anrop till Google i besökarens webbläsare. `Georgia, serif` respektive `system-ui, sans-serif` används som reserv.

Latinvarianterna innehåller svenska å, ä och ö. Latin Extended-filer finns också för utökat språkbehov. Exakta källor sparas i `apps/web/public/fonts/sources.json`; SIL Open Font License följer med i separata OFL-filer. Native Expo kan använda plattformens serif- och systemfont; detta är en avvikelse från webbens exakta typsnitt tills samma fontfiler används i native.

## Sidhuvud och navigation

Logotypen ligger till vänster. Navigationen är **Hem | Catering | Festlokaler | Om oss | Kontakt**, med en synlig **Ring oss**-länk och telefonikon. Aktiv sida markeras. Grundadressen till catering är `/catering` och till lokaler `/festlokal`; den senare bevarar den befintliga webbplatsens adress.

Mobilmenyn öppnas med en tydlig menyknapp. Kryss och Escape stänger menyn. Fokus hålls i den öppna menyn och återgår till menyknappen vid stängning. Kontroller kan användas med tangentbord och har tydlig fokusmarkering.

## Startsida

En kort introduktion följs av två jämnstora kort: **Catering för alla tillfällen** och **Oförglömliga event i våra festlokaler**. Varje kort har bild, läsbar text och ett tydligt nästa steg: **Visa catering** respektive **Visa festlokaler**. Ett helt klickbart kort ska innehålla en enda länk; ingen knapp kapslas i en annan länk.

På dator förstoras bilden diskret med ungefär två procent vid hover och kortets gröna kant framträder. Animationen flyttar inte innehåll och respekterar `prefers-reduced-motion`. På mobil ligger catering först och fest under; innehåll och funktion syns utan hover.

Längre ner följer de fyra menyvalen i samma ordning som på cateringsidan, en kort festpuff och en kort presentation. Ingen lunchmeny, direktorder, betalningsmetod, rabattpopup eller appinstallation ingår i denna kundresa.

## Cateringmenyer

Fyra alternativ presenteras i ordningen Meny 1, Meny 2, Meny 3 och Plockmeny. Menykort innehåller bild, namn, pris per person eller offert, en kort beskrivning och länk till innehåll. Detaljvyn visar en större bild, fullständigt innehåll, prisstatus och kontakt.

| Meny | Pris i underlaget | Meze | Grill som separat del |
| --- | --- | --- | --- |
| Lilla Meny 1 – 5 Meze | 250 kr/person | Hummus, Muhammara, Baba Ganoush, Labne, Fatoush | Mixgrill med nöt- och kycklingspett |
| Meny 2 – 8 Meze | 300 kr/person | Hummus, Muhammara, Baba Ganoush, Labne, Fatoush, Ostrulle, Sambosak, Kubbe | Mixgrill med nöt- och kycklingspett |
| Meny 3 – 10 Meze | 399 kr/person | Hummus, Muhammara, Baba Ganoush, Labne, Tarator Djaj (kycklingröra), Fatoush, Tabbouleh, Kubbe, Ostrulle, Sambosak | Mixgrill Special med nöt-, kyckling- och lammspett |
| Plockmeny – Skapa din egen catering | Pris enligt offert | Önskade rätter väljs eller beskrivs av kunden | Bekräftas personligen |

Källornas rätter och priser ändras inte. Listorna har 6, 9 respektive 11 poster om grillen räknas med. Manualen förklarar att grillraden visas separat från de 5, 8 respektive 10 mezerätterna. Denna tolkning och menynamnen ska ändå bekräftas av företaget; inga rätter tas bort för att få antalet att stämma.

Allergener, mängder, minimiantal och framförhållning måste bekräftas av köket. Varje meny har redigerbara allergenuppgifter och en separat markering för kökets verifiering. Ändrat innehåll kräver förnyad kontroll. En tom lista innebär inte att maten är allergenfri. Plockmenyn beräknar inget automatiskt totalpris. Den gamla sidans regel om tillägg för 40 kr/person används inte för uträkningar förrän ägaren har förtydligat modellen.

## Cateringkontakt

Catering har två kontaktvägar: e-post och telefon. E-postadressen **sharbelrasho@gmail.com** bekräftades av användaren den 21 oktober 2026. Telefonnummer **021-41 57 11** finns på företagets befintliga webbplats; ägaren behöver fortfarande kontrollera att det ska användas i den nya verksamhetsinriktningen.

Ett `mailto:`-klick öppnar ett utkast med menynamn i ämnesraden och förslag till uppgifter om datum, tid, gästantal, hämtning eller leverans, telefon och önskemål. Kunden måste själv skicka mejlet i sitt e-postprogram. Ett öppnat utkast får aldrig beskrivas som en skickad förfrågan eller bekräftad bokning. En kopierbar e-postadress fungerar som reserv.

**Medveten avvikelse från skiss 10:** manualen visar enbart kontaktknappar och kundens externa mejlprogram. Det skriftliga implementationsuppdraget begär dessutom formulärfält och val av rätter. Ett kompletterande formulär förbereder därför mejlutkastet. Kunden granskar det och öppnar det i sitt e-postprogram, eller kopierar texten som reserv. Informationen före knappen anger att kunden skickar mejlet själv. Någon ny leverantör för automatisk e-post har inte godkänts eller aktiverats.

## Festlokaler

Datamodellen förbereder exakt fyra lokalposter. Varje verklig lokal ska ha godkänt namn, egen adress, maxkapacitet, kort text, relevanta faciliteter, ansvarig telefon och egna bilder. De interna arbetsnamnen Lokal 1–4 är utkast och får inte presenteras som verkliga bokningsbara lokaler.

Endast godkända och publicerade poster får lämna den publika katalogen. I avsaknad av verifierade lokaler visar den publika sidan ett ärligt besked och en telefonkontakt. Den får inte fylla ut fyra kort med påhittade namn, kapaciteter eller upprepade foton.

Detaljsidans mall består av stor bild, galleri, beskrivning, verifierade fakta och **Ring oss för bokning**. Ingen festbokning går via e-post, formulär, kalender eller betalning. En lokal får egen adress-slugg efter sitt godkända namn.

Galleriet har synligt bildnummer, föregående/nästa, miniatyrer och ett större bildläge. Pilar och Escape ska fungera med tangentbord. Svep på mobil kompletterar synliga kontroller. Ingen automatisk bildväxling används.

## Om oss och kontakt

Om oss presenterar libanesisk catering och festverksamheten kort, med länkar till de två tjänsterna. Inga årtal, utmärkelser, recensioner eller kundantal konstrueras.

Kontaktsidan skiljer mellan catering, som kan kontaktas via e-post eller telefon, och fest, som endast kontaktas via telefon. Den verifierade kontaktadressen är **Slakterigatan 14, 721 32 Västerås**. Den är inte automatiskt adress till alla lokaler. Kartan öppnas med en vanlig länk. Officiella sociala konton visas endast efter kontroll.

## Sidfot och mobil

Sidfoten har samma varumärke, kontaktuppgifter, relevanta sidlänkar och integritetslänk. Cateringens kontaktband kan visa mejl och telefon. Festens kontaktband innehåller bara telefon. Fasta mobilkontroller kräver tillräckligt bottenutrymme så att sista texten och knapparna inte täcks.

Kontrollstorlekar för webb är 360, 390 och 430 pixlar samt surfplatta och dator. Större text får inte ge horisontell sidscroll. Alla klickmål ska vara läsbara och enkla att träffa.

## Gemensamt innehåll och admin

Webb och Expo använder samma Catering & Fest-katalog i den befintliga Supabase-databasen. Innehållet skiljs från äldre finansiella beställningar utan att historik raderas. Den skyddade sidan `/admin/innehall` kan redigera menyinnehåll, priser, allergenunderlag, rätter, lokaler, media och kontaktuppgifter samt spara utkast och publiceringsstatus. Versionskontroll stoppar en sparning som annars skulle skriva över en annan redaktörs ändringar.

Adminautentisering, serverstyrd behörighet, validering och origin-kontroller behålls. Opublik lokaldata och privata nycklar ska aldrig hamna i publika API-svar. Äldre betalnings- och testfunktioner bevaras internt men länkas inte från den nya kundnavigationen.

## Bildmaterial och visuella avvikelser

Riktiga originalbilder hämtade från företagets webbplats ligger under `apps/web/public/images/catering-fest/`. Källor, dimensioner och rättighetsstatus finns i `sources.json`. Filerna är optimerade WebP-varianter, inte skärmbilder. De visar mat eller dukning men styrker inte ett exakt menyinnehåll eller fyra separata lokaler.

Festbilden i manualen är en ljus helhetsvy. Den officiella festlokalsidans tillgängliga stillbild visar i stället en närbild av dukning. Denna skillnad är avsiktlig tills ägaren lämnar godkända originalbilder av respektive lokal. Äldre befintliga illustrationer ska inte beskrivas som fotografier av verkliga lokaler eller personal.

En visuell jämförelse av startsidan på dator och mobil med skisserna 1, 4 och 20 visar samma vita grund, gröna serifrubriker, två stora tjänstekort och fyra menyval i rätt ordning. Följande skillnader är medvetna:

- Startsidan använder uppdragets längre rubriker i stället för skissens korta Catering och Fest.
- Riktiga matbilder ersätter manualens varma stämningsbilder; samtliga är fortfarande märkta som bildexempel.
- På mobil visas menypuffarna i två kolumner när utrymme finns och i en kolumn på de minsta bredderna. Manualens separata mobilskiss använder en mer kompakt lista med en kolumn.
- Fyra overifierade lokalkort ersätts offentligt med ett ärligt besked och telefonkontakt. De fyra posterna finns kvar som interna utkast.

Inga klippta priser, överlappande kontroller eller förskjutna knapprader noterades i de granskade startsidesbilderna. Det ersätter inte företagets innehållsgodkännande eller provning av externa mejl- och telefonappar på fysiska enheter.

Publicering på den officiella domänen ingår inte i detta arbetssteg. Se innehållskontrollistan och implementationsdokumentet för kvarvarande beslut och verifiering.
