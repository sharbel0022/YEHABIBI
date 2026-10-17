# Lokal testplattform – V4.3

**TESTLÄGE – INGA RIKTIGA BESTÄLLNINGAR.** Den här miljön använder syntetiska kunder, menypriser, adresser, e-post och push. Företagets Swish, bankkonto och Adyen-nycklar används inte. En simulerad betalning flyttar inga pengar och är inte en Adyen-sandboxtransaktion.

## Starta i Windows

Kör i repots rot med Node.js 22.13 eller senare:

```powershell
npm ci
npm run test:server
```

PostgreSQL 18:s `initdb`, `pg_ctl` och `psql` behöver finnas i `C:/Program Files/PostgreSQL/18/bin`, alternativt anger du `PG_BIN` till din installation. PostgREST finns i den lokala testverktygskatalogen `.tmp/v41-tools/postgrest.exe`, eller anges med `POSTGREST_BIN`. CI använder redan samma verktyg som det befintliga integrationstestet. Kommandot säger vilket verktyg som saknas; det ansluter aldrig till en molndatabas som reserv.

På Windows startas PostgREST med `GHCRTS=-N1`. I en avgränsad lokal diagnos avslutades samma binär med kod 3 i tre av fyra starter med `-N2`, medan fyra av fyra `-N1`-starter fortsatte med väntade anslutningsdiagnoser mot en stängd loopbackport. Miljö och DLL-sökväg var identiska; den exakta bakomliggande orsaken är inte fastställd. Inställningen styr GHC:s antal parallella exekveringsresurser och ändrar inte databas, behörigheter eller betalningsregler. [PostgREST dokumenterar GHCRTS](https://docs.postgrest.org/en/stable/explanations/install.html#docker-resource-constraints), och [GHC beskriver `-N1`](https://downloads.haskell.org/ghc/latest/docs/users_guide/using-concurrent.html#rts-options-for-smp-parallelism). Ingen automatisk startomkörning döljer ett fel.

Startkommandot skapar en helt ny datakatalog och en isolerad webbkopia under ignorerade `.tmp/test-mode-<uuid>/`. PostgreSQL, PostgREST, lokal Auth-/meddelandetransport och Next.js får egna portar på `127.0.0.1`. Alla riktiga migrationer körs i ordning, följda av teststödets tabeller och en unik databasattestering. Produktionsfiler eller produktionsdata ändras inte.

Terminalen visar webbens adress, testadmin-inloggning, ett slumpat testlösenord och lokal inkorg. Låt terminalen vara igång. Länkar med privata ordertoken eller betalningssessioner skrivs inte ut i startloggen. Själva orderkvittot visas i kundens webbläsare/app. Starten räknas som klar först när testwebben har verifierat just den nya databasens attestering; en annan frisk server på samma adress räcker inte. Om Next.js eller PostgREST avslutas oväntat stoppar launchern återstående egna testprocesser och visar en felindikering med katalogen för redigerade loggar; starta då en ny testsession.

Testservern kopierar inte `.env` eller `.env.local` och ärver bara operativsystemets nödvändiga processvariabler. Adyen är avstängt, produktionsgodkännande är false och inga riktiga betalningsnycklar används. Ett separat serverhemligt testvärde måste matcha attesteringen i den nyss skapade databasen. Att bara sätta `APP_ENV=test` eller en publik variabel kan inte aktivera simulatorn i produktion.

## Testadmin och inkorg

Öppna **Testadmin**-adressen från terminalen och ange testlösenordet. Det är en separat lokal användare, `owner@example.test`, med en normal serververifierad session. Utan session svarar admin-API och inkorg med 401. Inloggningen går till `/admin/orders` på samma testwebb.

Öppna sedan **Lokal inkorg** i samma webbläsare. Där finns fångade e-postmeddelanden och simulerade Expo-pushmeddelanden. Inga meddelanden skickas till externa mottagare, även om du anger en annan syntetisk e-postadress i formuläret. Privata ordertoken redigeras bort i inkorgens visning. Använd alltid adresser på `.test`, exempelvis `kund1@example.test`.

Webbserverns faktiska meddelandekö och leveranskvittens används. Endast nätverkstransporten byts mot lokal fångst. Andra externa `fetch`-anrop blockeras i testprocessen, så riktiga Adyen-, Resend- eller Expo-tjänster kan inte användas av misstag.

## Skapa testordern på 480 kr

Testdatabasen har fem aktiva rätter:

| Rätt | Testpris |
| --- | --- |
| TEST Ostrullar | 25 kr/st |
| TEST Hummusfat | 90 kr/fat |
| TEST Kaftaspett | 65 kr/spett |
| TEST Falafel | 20 kr/st |
| TEST Baklava | 35 kr/bit |

1. Öppna webbens adress från terminalen. Kontrollera testbannern.
2. Välj egen catering och **fem personer**.
3. Välj **12 ostrullar** och **två hummusfat**. Matens total ska vara `12 × 25 + 2 × 90 = 480 kr`, alltså 96 kr/person.
4. Välj hämtning och ett tillåtet framtida datum/tid. Leverans använder en separat syntetisk zon för postnummer som börjar på `721` och ger 100 kr avgift.
5. Ange en syntetisk kund, `.test`-e-post och testtelefon. Skicka en förfrågan.
6. Kvittot visar ordernummer och privat orderlänk. Ordern är **Mottagen/Obetald** och finns nu i den riktiga isolerade PostgreSQL-databasen.
7. Testa dubbeltryck/återförsök med samma innehåll. Samma beständiga förfrågningsnyckel återanvänder ordern; nya kundordrar ska ha en ny nyckel.

Samma skydd som i ordermotorn tillåter högst fem nya förfrågningar per nätverksnyckel respektive e-postadress och timme. Identiska återförsök använder den befintliga ordern. Om en längre manuell testomgång når gränsen kan du starta en ny tom testsession med reset-kommandot nedan; använd då den nya API-adressen även i Expo.

## Godkännande, pris och orderstatus

I testadmin kan du granska, godkänna eller neka ordern. Ett nytt pris kräver ett förklarande offertförslag och kundens uttryckliga godkännande av rätt revision via den privata ordervyn. Inga pengar eller betalningssessioner skapas automatiskt av godkännandet.

Efter godkännande väljer kunden en aktiverad testbetalningsmetod i ordervyn. När betalningen är verifierad kan ägaren uppdatera till **Under förberedelse → Klar för hämtning → Slutförd**. Kunden hämtar serverns aktuella status på samma privata order.

För kontant väljer kunden hämtning och kontant. Ordern förblir obetald efter godkännande. Endast inloggad testadmin kan kvittera mottagna testkontanter. Ingen extern betalningssession används.

## Simulera Swish, Apple Pay, Google Pay och kort

Välj metoden efter ägargodkännande och öppna den lokala testbetalningssidan. Samma simulator används för alla fyra metoderna. Det är en syntetisk betalning; den öppnar ingen riktig Swish-app, Apple Pay-plånbok eller Google Pay-plånbok och tar inte emot kortnummer.

På sidan kan du simulera lyckad betalning, nekad betalning, avbrytande, utgången session och dubbla händelser. Servern skapar och verifierar en signerad testhändelse och tillämpar den via samma betalningsservice, SQL-transaktioner, providerreferenser och notifieringskö som övriga systemet. Knappen skriver aldrig direkt till orderns `paid`-fält.

Efter nekad betalning kan kunden försöka igen med samma försök. Simulatorns utgång skickar en signerad definitiv felhändelse och kan därför öppna **samma** lokala session för ett nytt försök; det skapas ingen andra debitering eller nytt försök. Detta skiljer sig från en oklar utgång hos en riktig leverantör, som måste avstämmas först. Dubbla identiska händelser ska ge samma betalda resultat utan dubbla transaktioner eller besked.

Testa varje metod i en egen order. En påbörjad betalning binds till sitt försök och sin metod; byt inte metod genom att manipulera en väntande session.

## Återbetalning

Skapa och betala en testorder. Begär återbetalning från testadmin för den verifierade transaktionen. Följ väntande begäran och simulatorns signerade bekräftelse, och kontrollera att kunden ser återbetalningsstatus. Ett admintryck eller ett mottaget API-anrop är inte i sig en verifierad återbetalning. Återbetalningar hör till samma testleverantör/miljö som den ursprungliga betalningen.

## Expo SDK 57

Låt testservern köra och öppna en andra terminal:

```powershell
# Android-emulator som redan är startad (direkt Node i PowerShell):
node --experimental-strip-types scripts/test-server.mjs --mobile --android

# Redan installerad kompatibel development client i emulatorn:
node --experimental-strip-types scripts/test-server.mjs --mobile --android --dev-client

# Om ADB/automatisk öppning inte svarar, anslut development client manuellt:
node --experimental-strip-types scripts/test-server.mjs --mobile --android --dev-client --no-open

# Expo web på samma dator:
npm run test:mobile
```

Android-emulatorn använder samma backendport genom `http://10.0.2.2:<port>`, som motsvarar värddatorns loopback. Kundens privata betalningsadress löses mot appens API-adress. Ingen separat mobilserver/databas behövs. Helpern använder sessionens egen Metroport, `EXPO_NO_DOTENV=1` och Node-valet `--dns-result-order=ipv4first`, så Metro med `--localhost` väljer IPv4-loopback även på Windows. Den öppnar inte en gammal Metroserver och läser inte mobilens `.env.local`. I den vanliga Expo-starten kan du trycka `w` för Expo web på samma dator.

I den verifierade Windows-miljön slukade `npm.ps1` vidarebefordrade `--android`- och `--dev-client`-flaggor. Använd därför direktkommandona ovan när du behöver flaggor i PowerShell. Kontrollera att utskriften visar `10.0.2.2` för Android. `npm run test:mobile` fungerar utan extra flaggor för Expo web.

För `--android` anger helpern också SDK 57 CLI:s `EXPO_PACKAGER_PROXY_URL=http://10.0.2.2:<Metroport>`. Då använder annonserade manifest-, bundle- och utvecklingsadresser emulatorns värdadress. `--localhost` styr fortfarande själva lyssningen på IPv4-loopback; ingen LAN-bindning eller tunnel öppnas. Inställningen sätts bara i den egna Expo-barnprocessen.

En fysisk iPhone/Android kan inte nå datorns `127.0.0.1`. Den här standardstarten öppnar inte testservern på hela nätverket. För ett framtida fysiskt prov behövs en uttryckligt konfigurerad privat och åtkomstskyddad anslutning; publicera inte simulatorn på den publika Sites-webben. Ett telefonprov får endast anges som genomfört om den aktuella enheten faktiskt användes. Expo-export och emulatorprov räknas inte som fysisk iPhone-verifiering.

## Stoppa och återställ

Stoppa Expo/Metro med **Ctrl+C** i dess separata terminal. Tryck sedan **Ctrl+C** i testserverns terminal, eller kör:

```powershell
node --experimental-strip-types scripts/test-server.mjs --stop
node --experimental-strip-types scripts/test-server.mjs --reset
```

Stoppet autentiseras mot den aktiva lokala sessionen och avslutar bara processer som den sessionens launcher själv startat. Reset startar därefter en **ny tom UUID-databas** med menyn ovan. Ingen befintlig databas raderas rekursivt och inget godtyckligt PostgreSQL-kluster stoppas. Gamla testmappar finns kvar under ignorerade `.tmp` för felsökning; de är inte produktionsbackuper.

Den privata sessionsfilen och testlösenordet finns endast i ignorerad lokal testkatalog. Lägg inte `.tmp`, loggar eller sessionens interna hemligheter i GitHub. Starta om en för gammal session för en ny lokal administratörssession.

## Automatiska kontroller och bevisnivå

```powershell
npm run test:mode
```

Kommandot skapar en egen temporär instans och typkontrollerar även den isolerade webbkopia som innehåller simulatorn. Därefter provas verklig HTTP → Next.js → PostgREST → PostgreSQL, samma migrationer, testadmin, alla fyra testmetoder, prisacceptans, kontant, fel/avbrott/utgång/dubbletter/refund och fångade notiser. Instansen stoppas när sviten avslutas. Den påverkar inte en separat användbar testsession. En separat transportregression verifierar att HTTP-redirect inte kan kringgå blockeringen av externa anrop.

De vanliga syntax-, enhets-, typ-, produktionsbygg-, Expo-export- och integrationstesterna körs fortsatt enligt README och CI. Produktionsbygget innehåller varken testbetalningsadapter eller simulatorrutter: teststödet läggs endast in i den ignorerade lokala webbkopia som launchern skapar.

Faktiska resultat, praktiska browser-/emulatorprov och kvarvarande enhetsprov ska redovisas i [TESTER.md](TESTER.md) och slutleveransen. Simulerade serverhändelser ska alltid benämnas simulerade. Inga testresultat i den här miljön bevisar riktiga bankbetalningar, en Adyen-sandboxtransaktion eller levererade externa e-post-/pushmeddelanden.

## Senare byte till företagets riktiga leverantör

Testadaptern finns bara i testkopian. Produktionskällan använder den riktiga Adyen-arkitekturen och samma beställningssystem. Företaget behöver godkänna konto/avtal, verifiera riktig sandbox, Swish-/plånboksstöd och alla serverhemligheter innan separat beslut om produktion. Testdatabasen, testpriserna och testadmin ska aldrig återanvändas för riktiga kunder. Följ [PAYMENTS_WITHOUT_STRIPE_V4_3.md](PAYMENTS_WITHOUT_STRIPE_V4_3.md) för konto-, certifikat-, webhook- och produktionsspärrar.
