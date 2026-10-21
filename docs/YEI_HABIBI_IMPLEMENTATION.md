# Yei Habibi Catering & Fest – implementation

Datum: 21 oktober 2026. Branch: `yei-habibi-catering-fest-redesign`.

## Leverans och publiceringsstatus

Den nya kundupplevelsen är implementerad i befintliga Next.js- och Expo-projekt. Webb och mobil läser samma innehåll från den befintliga Supabase-databasen. Företagets officiella domän, fjärrdatabas och produktionsinställningar har inte ändrats.

Leveransen är ett tekniskt verifierat innehållsutkast. De fyra verkliga lokalernas namn, kapacitet, adresser, egna foton och ansvariga telefonnummer saknas fortfarande. De fyra interna utkasten publiceras därför inte. Menypriser, allergenunderlag, bildrättigheter och slutlig företagsinformation behöver godkännas innan lansering. E-postadressen **sharbelrasho@gmail.com** har bekräftats av användaren i detta uppdrag.

## Nuläge före ändringen

Projektet hade Next.js, Expo, delade typer och katalog, skyddad administration, orderhantering, betalningsintegrationer och omfattande isolerad testinfrastruktur. Kundgränssnittet använde arbetsnamnet Cedar Mezze och visade färdiga matpaket, direktbeställningar, menybyggare och checkout. En separat modell för verifierade festlokaler saknades.

Den gemensamma tekniska strukturen och alla historiska finansiella flöden har bevarats. Den nya innehållskatalogen är en tilläggsmodell i samma backend. Inga gamla menyer, orderrader, betalningsreferenser eller databastabeller har raderats.

## Genomförd kundupplevelse

| Sida | Beteende |
| --- | --- |
| `/` | Två stora länkkort för catering och fest, därefter fyra menyval och kort presentation |
| `/catering` | Tre fasta menyer i källornas ordning och en plockmeny |
| `/catering/meny-1` | Lilla Meny 1 – 5 Meze, 250 kr/person, fem meze och separat mixgrill |
| `/catering/meny-2` | Meny 2 – 8 Meze, 300 kr/person, åtta meze och separat mixgrill |
| `/catering/meny-3` | Meny 3 – 10 Meze, 399 kr/person, tio meze och separat Mixgrill Special |
| `/catering/plockmeny` | Önskade rätter, gästantal och kontaktuppgifter; alltid pris enligt offert |
| `/catering/forfragan` | Förbereder ett mejlutkast med vald meny och kundens uppgifter |
| `/festlokal` | Visar endast verifierade och publicerade lokaler; tills dess sakligt besked och telefonkontakt |
| `/festlokal/[slug]` | Gemensam detaljmall med fakta, bildgalleri och endast telefonbokning |
| `/om-oss`, `/kontakt` | Kort presentation respektive tydlig uppdelning mellan catering och fest |
| `/admin/innehall` | Skyddad innehållsredigering; `/admin` leder hit |

Äldre `/menyer`, `/bestall` och `/bestall-nu` omdirigeras till den nya cateringupplevelsen. Deras tidigare gränssnitt finns kvar för den verifierade, isolerade testmiljön. Historiska privata orderlänkar och skyddade administrationssidor är bevarade.

## Design och mobil

Hela Word-manualens text och samtliga 22 designbilder granskades. Vit bakgrund, cedergrönt `#155A43`, mörk text `#202B27`, tunna linjer och sparsamma röda detaljer följer manualen. Webbens Noto Serif Display och Inter laddas lokalt med reservtypsnitt och OFL-licenser. Native Expo använder plattformens serif- och systemtypsnitt.

Startsideskorten har samma visuella tyngd, cirka två procents dekorativ bildzoom och innehåll som alltid syns utan hover. Reducerad rörelse respekteras. Mobilmenyn är en modal med fokusbegränsning, Escape och återställd fokus. Gallerier har miniatyrer, föregående/nästa, tangentbordspilar, Escape, svep och tydlig stängning.

Fyra riktiga bilder från företagets webbplats har optimerats till WebP. Dukningsbilden är en närbild, medan manualen visar en ljus helhetsvy av en festlokal. Bildexempel märks tydligt. Inget fotografi används som bevis för fyra olika lokaler. Övriga visuella skillnader finns i designdokumentet.

## Cateringkontakt

En automatisk e-postleverantör har inte godkänts för den nya förfrågningsfunktionen. Därför används det tillåtna `mailto:`-alternativet. Kontaktknappar öppnar ett kodat utkast med rätt mottagare, ämne och menynamn. Adressen går även att kopiera.

Det kompletterande formuläret följer uppdragets uttryckliga fältlista: namn, telefon, e-post, antal personer, datum, tid, hämtning/leverans, meny, rätter, allergier och meddelande. Det förbereder en läsbar text och en länk till mejlutkastet. Ändringar gör ett äldre utkast ogiltigt. Kunden får veta att mejlet måste skickas från det egna e-postprogrammet.

Formuläret sparar inga förfrågningar i databasen och visar aldrig skickat- eller bokningsbekräftelse. Företaget bekräftar innehåll, pris och tillgänglighet personligen. Festlokaler har inga mejlknappar, bokningsformulär eller kalendrar. Det nya kundflödet innehåller inga betalningsmetoder eller totalsummeringar.

## Datamodell och behörighet

`packages/shared/hospitality/index.ts` innehåller gemensamma typer, Zod-validering, källuppgifter, telefon- och mejlhjälpare samt den publika projektionen. Katalogen innehåller fyra menyplatser, valbara rätter, fyra interna lokalplatser och kontaktuppgifter.

Den additiva migrationen `20261021151657_hospitality_content_catalog.sql` skapar `hospitality_content` med en katalog i JSONB, revisionsnummer och ändringstid. Migrationen är versionshanterad och provad i isolerade databaser; den har inte körts mot någon fjärrdatabas.

Tabellen har RLS och inga läs- eller skrivbehörigheter för publika roller. Servern kontrollerar bekräftad Supabase-användare och administratörens e-postlista. Innehållsändringar kontrollerar origin, storlek, schema och förväntad revision. Samtidiga ändringar ger konflikt i stället för att skriva över varandra.

Den publika katalogen lämnar aldrig ut opublicerade lokalposter eller overifierade e-postadresser. Publicering av en lokal kräver verkligt namn och slug, beskrivning, kapacitet, egen adress, telefon och bilder. Sluggen `forfragan` är reserverad för formulärsidan. Overifierade allergentexter filtreras bort. Redigerat recept återställer allergenverifieringen; ändrad e-post kräver ny uttrycklig verifiering.

Webbens sidor renderas dynamiskt på servern. Katalog-API:t använder `no-store`; Expo uppdaterar vid återgång till appen och manuell uppdatering. Startsidesbilder kan följa den gemensamma menyn och den första verifierade lokalen. Robots, sitemap och strukturerade företagsdata förblir spärrade under innehållsutkastet. Opublik eller okänd detaljsida ger HTTP 404. Den tidigare automatiska loading-gränsen togs bort för att undvika att Next hann skicka HTTP 200 före ett sent not-found-besked.

## Viktiga filer

| Del | Fil eller katalog |
| --- | --- |
| Delade typer och verifiering | `packages/shared/hospitality/index.ts` |
| Serverläsning | `apps/web/src/lib/hospitality.ts` |
| Publikt innehålls-API | `apps/web/src/app/api/hospitality/route.ts` |
| Skyddat innehålls-API | `apps/web/src/app/api/admin/hospitality/route.ts` |
| Innehållsadmin | `apps/web/src/components/admin/AdminHospitality.tsx` |
| Publika sidor | `apps/web/src/app/catering/`, `apps/web/src/app/festlokal/` |
| Formulär, kontakt, galleri och fokus | `apps/web/src/components/hospitality/` |
| Design | `apps/web/src/app/hospitality.css` |
| Originalkällor och optimerade bilder | `apps/web/public/images/catering-fest/` |
| Lokala webbfonter och licenser | `apps/web/public/fonts/` |
| Expo-katalog och kontakt | `apps/mobile/lib/hospitality.tsx`, `hospitality-ui.tsx`, `catering-inquiry.tsx` |
| Bevarade Expo-vyer | `apps/mobile/legacy/`, skyddade med `legacy-boundary.tsx` |
| Nya kontroller | `tests/hospitality.test.mjs`, `tests/hospitality-integration.mjs`, uppdaterad `tests/web-smoke.mjs` |

## Verifiering

| Kontroll | Resultat |
| --- | --- |
| Syntax och typkontroll | Godkända för webb, Expo och delad API-klient |
| `npm test` | 249 tester godkända; historiska betalnings-, order-, kapacitets-, säkerhets- och migreringstester kvar |
| `npm run build` | Produktionsbygge godkänt |
| `npm run export:mobile` | Android, iOS och webb godkända; 13 statiska webbvägar |
| `npm run test:web` | 14 publika sidor; serverrenderade menyer, priser, länkar, dolda utkast, adminskydd och produktionsspärrar godkända |
| `npm run test:hospitality` | 38 HTTP-kontroller mot isolerad PostgreSQL/PostgREST/Next, inklusive sparande, publicering, samtidighet och behörighet |
| `npm run test:integration` | Befintlig PostgreSQL/PostgREST/Next-kedja godkänd med 11 syntetiska order och 66 fångade mejlleveranser; inga externa tjänster kontaktades |
| Syntetiska lokalgallerier i webbläsare | 20 kontroller för fyra testlokaler, pilar, Escape, återställd fokus och endast telefon |
| Responsiv webbläsarkontroll | 50 sidbesök vid 360/390/430/768/1440 px; inga saknade bilder, horisontella överflöden eller körningsfel |
| Förstorad text och mobilnavigation | 200 procent textstorlek, fokusbegränsning, Escape och kortlänkar godkända |
| Mejlförberedelse | Rätt mottagare, menyämne, samtliga formulärfält, valda rätter, kopiering och rensning av inaktuellt utkast godkända; inget verkligt mejl skickades |
| `npm run test:mode` | 25 kontroller; syntetiska order och meddelanden, ingen extern leverantörstrafik eller riktiga pengar |
| `npm run test:metro` | Privata filer, källkartor och tillgångar skyddade; normal JSON och automatisk ombyggnad fungerar |
| `npm run test:remote` | 9 integrationsgrupper; behörigheter och historik bevaras efter omstart |
| `npm run test:direct` | 9 integrationsgrupper; äldre kapacitet, pris och simulerad betalning bevarade |
| `npm run test:background` | Schemaläggning, återhämtning, samtidighet och bevarad order godkända |

Backendens behörigheter, innehållsprojektion och dataskydd samt Expo-gränssnittet har granskats separat. Identifierade fel i utkastmärkning, sidtitel, tom menykatalog, inaktuell lokalmodal, tangentbordsfokus och HTTP-status för dold detaljsida har åtgärdats och kontrollerats igen. Den nya HTTP-kontrollen är kopplad till GitHub Actions.

## Återstående steg före lansering

1. Låt företaget fylla i och godkänna innehållskontrollistan, framför allt lokaler, allergener, bildrättigheter och aktuella priser.
2. Prova verkliga mejl- och telefonappar på iPhone, Android och dator samt bekräfta mottagning i inkorgen. Utvecklingstesterna skickade inget meddelande till företagets Gmail.
3. Granska slutliga företags- och integritetstexter och kontaktuppgifter.
4. Genomför normal kodgranskning och invänta pull requestens CI-kontroller.
5. Planera och kör den additiva migrationen mot rätt miljö, kontrollera admininloggning och spara godkänt innehåll där.
6. Publicera först efter företagets godkännande. Aktivera indexering först när innehållsutkastet är avstängt och rätt domän har godkänts separat.

Ingen merge eller publicering på den officiella domänen har genomförts i detta arbetssteg.
