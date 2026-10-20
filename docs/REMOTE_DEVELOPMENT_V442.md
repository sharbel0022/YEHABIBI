# Yehabibi V4.4.2 – privat fjärrutveckling från Windows

## Förutsättningar och vad lösningen gör

Datorn kör Metro, Next.js, en separat PostgreSQL-testdatabas och den befintliga bakgrundsworkern. Telefonen hämtar utvecklingsappen genom Expo Tunnel och använder backend genom privat HTTPS i samma Tailscale-nätverk. Datorn måste vara på, ha internet och vara ansluten till Tailscale under hela testet.

Detta publicerar inte Yehabibi i App Store eller Google Play. Expo Tunnel ger en publik adress till utvecklingspaketet. Backend, databas, simulator och testadmin får aldrig läggas bakom den publika tunneln.

Projektet använder Expo **57.0.30**, React Native **0.86.3**, npm-workspaces och Node **>=22.13.0**. Verifieringen den 20 oktober 2026 kördes med Node **22.16.0** och npm **11.4.2**. `metro.config.cjs` behåller Expos standardkonfiguration för monorepot och lägger till säkerhetsspärrar för privata filer. `--go` väljer Expo Go uttryckligen även när `expo-dev-client` finns installerat.

### Kontrollera Expo Go på telefonen först

Expo Go och projektet måste stödja samma SDK. Expos aktuella dokumentation anger att App Store-versionen stannar på SDK 54. För projektets SDK 57 på fysisk iPhone krävs därför en kompatibel Expo Go-version via `eas go` och TestFlight, med Apple Developer Program-medlemskap, eller en separat development build. En vanlig installation av Expo Go från App Store kan inte förutsättas stödja projektet. Detta är en manuell förutsättning och löses inte av en fungerande tunnel. Se [Expos instruktion för versionsskillnader](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).

På Android väljer du en kompatibel SDK 57-version på [Expo Go-nedladdningen](https://expo.dev/go). Använd Expos officiella distributionsväg. Ändra inte projektets SDK bara för att kringgå ett versionsfel utan en separat uppgraderings- eller nedgraderingsgranskning.

En kompatibel SDK 57-klient på fysisk iPhone och åtkomst till ett Apple-utvecklarteam är ännu inte verifierade i denna körning. En fungerande Windows-server eller tunnel ersätter inte dessa förutsättningar.

## Starta från PowerShell

Öppna PowerShell i projektet:

```powershell
cd C:\Users\sharbel\Downloads\YEHABIBI
npm ci
npm run dev:remote:doctor
npm run dev:remote
```

`npm ci` behövs vid första installationen eller när låsfilen ändrats. Kör det när andra Yehabibi-servrar är stoppade. Den vanliga starten kontrollerar beroendena och installerar inga globala paket automatiskt.

På Windows används `npm.cmd` i exemplen som skickar extra flaggor efter `--`. PowerShells `npm.ps1` tappade separatorn i den verifierade miljön med npm 11.4.2 och behandlade exempelvis `--reset` som npm-konfiguration. `npm.cmd run dev:remote -- --reset` verifierades skicka flaggan till startprogrammet och skapa en ny databas. Grundkommandona utan tillval fungerar med `npm` som ovan.

Starten ska visa **TESTLÄGE – INGA RIKTIGA PENGAR**, den verkliga privata HTTPS-adressen och en ny `exp://`-länk. Använd adresserna från den aktuella körningen; tunneladressen kan ändras mellan starter. Backendadressen läses från Tailscale och skrivs inte som en platshållare i miljöfiler.

En enda registrerad telefon väljs automatiskt. Om flera telefoner finns kan du välja den registrerade telefonens node-ID, DNS-namn eller värdnamn:

```powershell
tailscale status
$remotePhoneId = Read-Host 'Telefonens node-ID, DNS-namn eller värdnamn från Tailscale'
npm.cmd run dev:remote -- --device $remotePhoneId
```

Telefonen måste tillhöra samma inloggade Tailscale-användare som datorn. Lägg inte till en delad eller okänd enhet för att passera kontrollen. Tailscale-status och kontaktbarhet är förkontroller; de ersätter inte det fysiska 4G/5G-testet nedan.

Fjärrläget använder normalt privat HTTPS-port **8443** och kontrollerar att den är ledig i Serve-konfigurationen. En befintlig tjänst på 443 ska lämnas orörd. Vid en portkonflikt väljer du uttryckligen en annan privat HTTPS-port:

```powershell
npm.cmd run dev:remote -- --https-port 9443
```

Lokala backend-, databas- och Metroportar väljs av startprogrammet. Skriv inte in datorns hem-IP eller ett tillfälligt internt portnummer i mobilappen.

## Tailscale och den privata anslutningen

Tailscale ska vara installerat och inloggat både på datorn och telefonen. Användaren genomför själv inloggningen. Om det saknas på Windows följer du [Tailscales officiella Windows-installation](https://tailscale.com/docs/install/windows): hämta deras signerade installationsprogram, godkänn installationen och logga själv in via Tailscale-menyn. Yehabibis startprogram ska ge instruktioner och avbryta när installation eller autentisering saknas.

Kontrollera befintliga inställningar innan någon ändring:

```powershell
Get-Command tailscale -ErrorAction SilentlyContinue
tailscale status
tailscale serve status
tailscale serve status --json
```

Om kommandot saknas i den nu öppna terminalens PATH men programmet redan är installerat kan du öppna en ny PowerShell eller använda:

```powershell
& 'C:\Program Files\Tailscale\tailscale.exe' status
```

MagicDNS och HTTPS-certifikat måste vara aktiverade för tailnet. Starten läser datorns riktiga `DNSName` och certifikatdomän från Tailscale och vägrar felaktiga eller saknade adresser. [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve) terminerar HTTPS och skickar bara trafik till den lokala fjärrgatewayen. Tailnets åtkomstregler gäller fortfarande.

**Tailscale Funnel används inte.** Ingen portvidarebefordran i hemroutern och ingen avstängning av Windows-brandväggen behövs. Starten ska blockera en konfiguration med publik Funnel och ska inte ersätta en befintlig Serve-tjänst.

## Säkerhetskontrakt för fjärrtest

De ursprungliga localhost-spärrarna för testbetalningar finns kvar. Den isolerade testwebben, PostgreSQL, PostgREST och interna worker-endpoints fortsätter att lyssna på loopback. Fjärrgatewayen är ett separat kontrakt framför testmiljön.

Skydden samverkar:

1. Privat transport kräver Tailscale. Starten kontrollerar den valda registrerade telefonen; gatewayen kontrollerar den godkända användaridentiteten från Tailscale Serve. Sessionsnyckeln begränsar dessutom åtkomsten till den aktuella testsessionen.
2. Kundappen behöver en separat sessionsnyckel för API-anrop. Nyckeln matas in efter att appen har laddats och lagras i telefonens SecureStore. Den finns inte i Expo-paketet eller någon `EXPO_PUBLIC_`-variabel.
3. Menyläsning i browsern kan använda kundnyckeln. Simulator och testadmin kräver den separata förhöjda nyckeln vid `/__remote/login`. Testadmin har dessutom sitt eget testlösenord. Kundappens nyckel ger inte administratörsbehörighet.
4. Gatewayen tillåter bara avsedda rutter och skyddar ursprung, omdirigeringar och ändrande anrop. Interna jobb, databas-API och privata styrendpoints exponeras inte.
5. Testmiljön kräver `APP_ENV=test`, `PAYMENTS_ENABLED=false`, korrekt isolerings-ID och databasens slumpmässiga attestering. Riktiga betalningsnycklar är tomma i barnprocessernas kontrollerade miljö.

Sessionsuppgifter sparas lokalt i `.tmp/remote-credentials.txt` under rubrikerna **Mobil sessionsnyckel**, **Förhöjd webbläsarnyckel (simulator/admin)** och **Testadmin-lösenord**. Öppna filen privat när du behöver uppgifterna:

```powershell
notepad .tmp\remote-credentials.txt
```

Klistra in kundappens nyckel i appens anslutningsvy. Öppna den utskrivna privata webbadressens `/__remote/login` i telefonens browser och använd browsernyckeln där innan du öppnar betalningssimulator eller testadmin. Lägg aldrig dessa nycklar i URL-frågeparametrar, skärmbilder, ärenden eller GitHub. `.tmp` är Git-ignorerad och får inte publiceras. Start- och diagnostikloggar ska inte skriva ut hemligheter eller privata orderlänkar.

Databasen är en egen PostgreSQL-instans under `.tmp/test-mode-…/pgdata`, med syntetiska produkter, kunder och betalningar. Den är skild från företagets databas. Betalningsprovidern `local_test` kopieras bara till den isolerade, ignorerade testwebben. Simuleringen anropar inte Swish, Apple Pay, Google Pay, kortnätverk eller den riktiga betalningsleverantören. En simulerad lyckad betalning är en databashändelse i testmiljön.

PostgreSQL använder den befintliga lokala testmiljöns loopback- och `trust`-gräns. Lokala processer under datorns användarkonto är betrodda; denna utvecklingsmiljö ger inte skydd mot en angripare som redan kan läsa kontots filer eller köra kod lokalt.

Git-ignore skyddar inte filer mot Metro. Granskningen reproducerade att en direkt `bundleEntry`-begäran kunde kompilera en ignorerad JSON-fil. Fjärrsessionen stoppades, tillfälliga åtkomstnycklar återkallades och Metro fick en separat spärr för `.tmp`, `.git` och `.env`-filer i samtliga workspaces. Publik Metro ska bara leverera utvecklingsappens kod och tillgångar. Efter rättningen gav fyra privata fil-/källkartebegäranden 404 genom en riktig publik Expo-tunnel, utan sessionshemligheter i svaren. Samma tunnel levererade fortfarande iOS- och Android-paketen. `npm run test:metro` verifierar dessutom sex angreppsvarianter, symbolikering och en fungerande vanlig JSON-modul med syntetiska markörer i CI.

HTML-sidor använder `Referrer-Policy: same-origin`: formulär behåller korrekt `Origin` vid inloggning, samtidigt som privata sökvägar inte skickas som referer till andra ursprung. `Origin: null` och främmande ursprung avvisas fortfarande. Detta verifierades även med verklig formulärinloggning i Chrome via privat Tailscale-HTTPS.

## Vilken API-adress används?

| Körning | API-adress och åtkomst |
| --- | --- |
| Lokal Android-emulator | `npm run test:server` följt av `npm run test:mobile -- --android`; startprogrammet väljer `10.0.2.2` med den aktuella testporten. |
| Lokal Expo Web | Lokal testbackend från den aktiva testsessionen. Browserns CORS-ursprung måste vara uttryckligen tillåtet. |
| Fysisk telefon hemma | Använd `dev:remote` med samma privata Tailscale-kontrakt, även på hemnätverket. Telefonens localhost är telefonen själv. |
| Fysisk telefon över 4G/5G | `dev:remote` väljer den verkliga privata `https://…ts.net:8443`-adressen och Expo Tunnel för utvecklingspaketet. Tailscale måste vara anslutet på telefonen. |
| Framtida produktion | En separat publicerad HTTPS-backend utan testgateway, testprovider eller testflaggor. |

Fjärrstarten sätter `EXPO_PUBLIC_API_URL` till den upptäckta privata adressen och `EXPO_PUBLIC_REMOTE_TEST=true` tillsammans med `APP_ENV=test`. `EXPO_PUBLIC_` innehåller bara publikt appkonfigurationsmaterial, aldrig API-hemligheter. Mobilappen kräver utvecklingsläge och en korrekt privat HTTPS-origin för fjärrtest. Sessionsnyckeln skickas bara till denna origins `/api/`-rutter; omdirigeringar följs inte.

Webb och Expo anropar samma Next.js-API och får orderstatus från samma isolerade databas. Gatewayen översätter avsedda lokala länkar till privat HTTPS utan att ändra testbetalningsproviderns ursprungliga localhost-kontrakt. Native Expo använder inte browser-CORS, medan webbförfrågningar måste klara gatewayens och API:ets ursprungskontroller.

## Bakgrundsjobb och återstart

Den befintliga `scripts/background-worker.mjs` startas som en separat ägd process. Den anropar `/api/internal/jobs` lokalt med ett separat worker-lösenord från processmiljön. Jobb kan behandlas när mobilappen eller browsern är stängd. Testmiljön fångar e-post och push lokalt i stället för att skicka till riktiga kunder.

Ett vanligt stopp raderar inte databasdata. Nästa `dev:remote` återanvänder samma isolerade databas och dess isolerings- och orderlänkshemligheter så att tidigare testorder kan läsas igen. Kundappens och browserns åtkomstnycklar byts däremot vid varje start: hämta den nya nyckeln ur den lokala filen och anslut igen när appen låser sessionen. Om migrationsschemat ändrats vägrar starten återanvända en inkompatibel databas.

För en uttryckligen ny testdatabas:

```powershell
npm run dev:remote:stop
npm.cmd run dev:remote -- --reset
```

`--reset` väljer en ny isolerad databas och nya uppgifter; den gamla katalogen behålls. Byt till de nya uppgifterna i mobilappen. Kör inte breda borttagningskommandon i `.tmp` för att felsöka en start.

Den befintliga ordergränsen på fem nya beställningar per timme gäller även i fjärrtest. Vid HTTP 429 väntar du till nästa timme, eller väljer uttryckligen en ny isolerad databas med reset-kommandot ovan. Spärren avaktiveras inte för att fortsätta tester.

## Stoppa och diagnostisera

Öppna en andra PowerShell i samma projekt om starten kör i förgrunden:

```powershell
cd C:\Users\sharbel\Downloads\YEHABIBI
npm run dev:remote:doctor
npm run dev:remote:stop
```

Ctrl+C i startterminalen använder samma kontrollerade stängning. Stoppet autentiseras mot den aktiva sessionen i `.tmp/remote-active.json` och stoppar bara Yehabibis egna processer. Andra Node-projekt, Codex, Android Studio, andra PostgreSQL-instanser och Tailscale-tjänsten ska fortsätta köra.

Efter ett lyckat stopp tas den aktiva sessionsfilen och åtkomstnyckelfilen bort. `.tmp/remote-database.json` pekar fortfarande på den bevarade testdatabasen för nästa start.

Serve-inställningen tas bara bort om den fortfarande exakt motsvarar den proxy som sessionen själv skapade. Om någon har ändrat den under tiden lämnas den orörd och stoppet rapporterar att manuell granskning behövs. Kör inte `tailscale serve reset`, eftersom det skulle kunna ta bort andra tjänster.

Diagnostiken visar backend, Metro, tunnel, worker, Tailscale, privat HTTPS och API-adress, samt separata bevis för telefonanslutningen. En misslyckad kontroll får inte ersättas av en publik backendtunnel.

### Tolka datorns och telefonens kontroller var för sig

| Kontroll | Vad ett lyckat resultat bevisar |
| --- | --- |
| Datorns privata HTTPS-självtest | Datorn når sin egen Serve-adress med giltig TLS, autentisering och databasattestering. Telefonens DNS, VPN och Safari har inte provats. |
| Telefonens Tailscale-status | Telefonen finns i nätverkskartan. `Online` och `Active` är inte bevis på en fungerande webbförbindelse. |
| Aktuell TSMP-ping | Krypterad Tailscale-transport till telefonen svarar. TSMP går förbi telefonens operativsystem; Safari och HTTPS-porten är fortfarande oprövade. Se [Tailscales pingtyper](https://tailscale.com/docs/reference/ping-types). |
| Observerat HTTPS-anrop från telefonen | Telefonens Tailscale-adress har nått gatewayen. En inloggningssida bevisar ännu inte åtkomst till kund-API:et. |
| Observerat autentiserat kund-API | Telefonens aktuella API-anrop har klarat åtkomstskyddet. Detta bevisar inte att scenario A–F genomförts eller att telefonen använder 4G/5G. |

Telefonens HTTP/API-observationer och transportprov räknas som aktuella i **120 sekunder**. Datorns egna kontrollanrop räknas aldrig som telefonanrop. Saknad eller offline telefon blockerar resultatet även när ett tidigare telefonanrop lyckades. `dev:remote:doctor` avslutas med en felkod när telefonanslutningen är offline eller fortfarande overifierad; servern kan fortsätta köra medan telefonen återansluts.

Vid felsökning skiljs även ankomst och behörighet åt. Ett telefonanrop med HTTP 401/403 visar att HTTPS-trafiken nådde gatewayen men nekades. HTTP 5xx efter ankomst pekar på gateway/backend. När inget telefonanrop syns går det inte att avgöra från gatewayen om försöket stannade vid VPN, DNS, TCP eller TLS. Ett grönt självtest från datorn får inte användas för att välja någon av dessa som fastställd orsak.

Gatewayen samlar bara maskerade räknare, tidsstämplar, HTTP-status och fasta kategorier för högst 20 senaste händelser. Telefon och dator skiljs åt med den källadress som Tailscale Serve anger. IP-adresserna används i minnet och följer inte med i diagnostikresultatet. Råa URL:er, orderreferenser, sökparametrar, användaridentiteter, headers, cookies och nycklar sparas inte i denna historik. Uppgifterna läses genom den lokala autentiserade sessionskontrollen; ingen ny publik diagnostikrutt öppnas.

### När Safari inte öppnar den privata adressen

1. Öppna Tailscale på telefonen, använd samma konto som datorn och aktivera anslutningen. Aktivera även användning av Tailscale DNS så att klienten kan använda tailnets namninställningar; se [Tailscales DNS-dokumentation](https://tailscale.com/docs/reference/dns-in-tailscale).
2. På iPhone: kontrollera **VPN On Demand → Cellular** inför 4G/5G-provet. `Never` kopplar automatiskt ned VPN även efter manuell återanslutning. Använd en regel som tillåter anslutning, exempelvis `Always` under provet. Se [Tailscales VPN On Demand-guide](https://tailscale.com/docs/features/client/ios-vpn-on-demand). Detta är en kontrollpunkt, inte en fastställd orsak till det aktuella felet.
3. Öppna exakt den privata HTTPS-adress och port som den aktuella starten visar, med `/__remote/login`. Behåll `https://` och exempelvis `:8443`; byt inte till telefonens localhost, datorns hem-IP eller en gammal tunneladress. Logga in med rätt sessionsnyckel när sidan visas.
4. Kör `npm run dev:remote:doctor` på datorn igen medan försöket görs. Telefonens HTTP-räknare visar om anropet nådde gatewayen. Efter API-inloggning i Expo ska även ett aktuellt autentiserat kund-API-anrop synas.

Den rapporterade Safari-anslutningen är ännu inte verifierad. Datorns privata HTTPS fungerade under felsökningen, medan telefonens närvaroflagga växlade mellan online och offline utan verifierad telefonåtkomst till API:et. Telefonens exakta felorsak och mobilscenarierna ska därför fortsatt redovisas som overifierade.

### När koden inte uppdateras i Expo

Den ursprungliga rensade processmiljön satte `CI=1` även för Metro. Expo loggade då att omladdning var avaktiverad; en redan byggd modul kunde ligga kvar trots en källändring. `remoteExpoEnvironment()` tar nu bort `CI` helt för Expo-processen. Värdet sätts inte till `0`, och databasens och workerns befintliga miljöpolicy behålls.

`npm run test:metro` startar en egen riktig Metro-process med samma Expo-miljö. Testet bygger en syntetisk delad JSON-modul, ändrar filen och verifierar att **samma paket-URL** innehåller den nya versionen. Det kör också de nekade privata fil-, källkarte- och tillgångsproven. Positiv filbevakning och negativa säkerhetsprov måste båda passera; filspärrarna ska inte tas bort för att få omladdning att fungera.

## Ngrok-felet: exakt orsak och fix

Den granskade datorn hade Node 22.16.0, npm 11.4.2 och global `@expo/ngrok@4.1.3` under `C:\Users\sharbel\AppData\Roaming\npm\node_modules`. Rätt globala npm-katalog fanns redan i PATH. En ominstallation globalt löste därför inte orsaken.

Projektets Expo SDK 57 använder `@expo/require-utils@57.0.6`. Dess globala paketupplösning kör `spawnSync('npm.cmd', ['config', '-g', 'get', 'prefix'])` utan shell. På denna Windows/Node-kombination gav det **`EINVAL`**, vilket hjälpfunktionen tyst behandlade som en tom lista. Windows-reserven sökte sedan `%LOCALAPPDATA%\npm`, men den verkliga globala installationen låg under `%APPDATA%\npm`. Den lokala installationen saknades. `resolveGlobal('@expo/ngrok/package.json')` gav därför `MODULE_NOT_FOUND` och `NgrokResolver.getVersioned()` returnerade `null`, trots att `npm ls -g @expo/ngrok` visade paketet.

Det förklarar sekvensen ”Installed …” följd av ”Install … and try again”: installationen lyckades, men Expos efterföljande upplösning hittade fortfarande inte paketet. Node dokumenterar att `.cmd`-filer på Windows kräver ett shell eller ett uttryckligt `cmd.exe`-anrop; se [Node child_process](https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows). Den granskade koden finns i [Expos require-utils](https://github.com/expo/expo/blob/main/packages/%40expo/require-utils/src/resolveGlobal.ts).

Fixen använder ett exakt lokalt utvecklingsberoende i repots rot, där fjärrstartprogrammet också ligger:

```powershell
npm ci
```

Rotens `package.json` låser `@expo/ngrok` till **4.1.3**, som uppfyller Expos krav `^4.1.0`. Mobilens vanliga modulupplösning går upp till rotens `node_modules`. Expo söker lokalt före globalt, så fixen kräver varken PATH-ändring, global ominstallation, byte av Node, patchning av `node_modules` eller `npm audit fix --force`.

Ngroks äldre beroendedeklaration drar annars in `uuid@3.4.0`, som omfattas av [GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq). Därför finns ett smalt override enbart för `@expo/ngrok` till **uuid 11.1.1**, första korrigerade CommonJS-versionen. Ngrok använder bara `require('uuid').v4()`, som stöds där. Övriga paket, inklusive Xcodes redan granskade uuid-beroende, ändras inte. En installation där ngrok lades direkt i mobilens workspace ignorerade detta override i npm 11.4.2; rotens dev-beroende gör tillämpningen reproducerbar. Säkerhetsgrindens undantag har inte utökats eller försvagats.

Låsfilens befintliga paketversioner ändrades inte. Rotens nya dev-beroende och ngroks transitiva beroenden, med det korrigerade uuid-paketet, lades till. Vid felsökning:

```powershell
node --version
npm --version
npm root -g
npm ls -g @expo/ngrok
npm ls @expo/ngrok
npm run start --workspace @yehabibi/mobile -- --tunnel
```

Den sista raden startar bara Expo och förutsätter att backend redan har valts korrekt. För hela den privata testmiljön använder du `npm run dev:remote`. [Expos dokumentation om tunnlar](https://docs.expo.dev/more/expo-cli/#tunneling) beskriver ngrok och att tunneltjänsten kan få tillfälliga anslutningsfel. När paketupplösningen lyckas men tunneln ändå misslyckas ska det rapporteras som ett separat tunnel- eller nätverksfel.

En ytterligare startkontroll rättades efter ett verkligt prov: Expos base64url-slumpdel kan innehålla understreck inne i `exp.direct`-värdnamnet. Ett sådant genererat namn gav ett giltigt manifest med HTTP 200 över den publika HTTPS-tunneln, men startprogrammets tidigare för snäva namnkontroll avvisade det ändå. Kontrollen accepterar nu interna understreck och kräver fortfarande ett avgränsat värdnamn med exakt suffix `.exp.direct`, utan sökväg, port eller inloggningsuppgifter.

Metro ska köras utan miljövariabeln `CI`; även värdet `0` lämnas bort helt. Den separata Expo-miljön behåller den rensade hemlighetsfria testkonfigurationen men aktiverar vanlig filbevakning. Ett faktiskt ombyggnadsprov ändrar en unik syntetisk fil i det delade paketet och kontrollerar att samma bundle-adress ger den nya versionen. Provet godkändes utan `CI` och upptäckte det ursprungliga felet när `CI=1` återinfördes i en separat kontroll.

## Genomförd verifiering och gränser

Följande ngrok-kontroller genomfördes på Windows den 20 oktober 2026:

| Kontroll | Faktiskt resultat |
| --- | --- |
| Global paketupplösning före fix | `npm ls -g` hittade 4.1.3; Expos globala resolver gav `MODULE_NOT_FOUND`; `spawnSync npm.cmd` gav `EINVAL`. |
| Lokal paketupplösning efter fix | Mobilens modulupplösning hittade låst 4.1.3 lokalt och Expos resolver returnerade en kompatibel instans. |
| Ren låsfilinstallation | `npm ci --ignore-scripts --no-audit --no-fund` i en separat kopia med samma rot- och workspace-manifest installerade ngrok 4.1.3 med uuid 11.1.1. `v4()` fungerade och övrigt uuid 7.0.3 förblev oförändrat. |
| Verklig start med `--go --tunnel` | Loggade `Tunnel connected.` och `Tunnel ready.`. |
| Expo Go-manifest genom HTTPS-tunneln | HTTP 200 med SDK 57 och en riktig `exp://…exp.direct`-adress. |
| iOS-paket genom den kompletta fjärrstartens tunnel, efter uuid-fixen | HTTP 200, JavaScript, 6 425 928 byte; manifestet angav `APP_ENV=test`. |
| Android-paket genom den kompletta fjärrstartens tunnel, efter uuid-fixen | HTTP 200, JavaScript, 7 081 752 byte. |
| Mobilpaketets backendadress och hemligheter | Båda paketen innehöll den verkliga privata API-adressen. Ingen av kundappens, browserns, testadmins eller sessionskontrollens fyra åtkomsthemligheter förekom i paketen. Värdena skrevs inte ut vid jämförelsen. |
| Avslut av verifieringssessionen | Bara den egna Expo-processen och dess ngrok-barn stoppades; testets Metro- och ngrokportar var därefter stängda. |

Den separata ursprungliga ngrok-provtunneln är avstängd. Den kompletta fjärrstarten verifierades därefter med nya manifest- och paketanrop. Kopiera alltid adressen från den aktuella starten. HTTP-kontroller från datorn visar att tunnelservern kan leverera manifest och paket. De bevisar inte att en fysisk iPhone/Android har öppnat appen, att telefonens Expo Go-version passar eller att 4G/5G kan nå privat backend.

Tailscale fanns redan på datorn och var inloggat; någon ny installation genomfördes inte. Den registrerade telefonen svarade på privat Tailscale-ping vid ett tidigare prov. Den kompletta fjärrstarten verifierade privat HTTPS, Tailscale-identitet och backendens isoleringsmarkör från datorn. Den dåvarande diagnostikens sex OK-resultat avsåg datorns självkontroller och verifierade inte Safari eller Expo på telefonen. Den uppdaterade diagnostiken redovisar dessa separat och blockerar ett overifierat telefonresultat.

Automatiserad verifiering hittills:

| Kommando | Status vid denna dokumentationsuppdatering |
| --- | --- |
| `npm run syntax` | Godkänt. |
| `npm test` | 196 godkända tester i den genomförda körningen (`.tmp/final-test.log`). |
| `npm run typecheck` | Godkänt. |
| `npm run build` | Godkänt. |
| `npm run export:mobile` | Godkänt. |
| `npm run test:web` | Godkänt. |
| `npm run test:mode` | Godkänt. |
| `npm run test:direct` | Godkänt, 9 integrationskontroller. |
| `npm run test:background` | Godkänt. |
| `npm run test:remote` | Godkänt, 8 integrationskontroller av gateway, autentisering, order/betalning och isolering. |
| `npm run test:metro` | Godkänt, sex nekade privata HTTP-sökvägar, säker symbolikering, fungerande vanlig modul och ombyggnad av samma paket-URL efter en bevakad källändring. |
| `node scripts/security-audit.mjs` | Godkänt med oförändrad undantagspolicy, både alla paket och produktionsberoenden. |

Ett separat Windows-prov avbröt `dev:remote` medan databasen startade via den autentiserade stoppkontrollen. Det bekräftade att den egna databasen stoppades, att databasdata behölls, att sessionslåsen försvann och att den tidigare Serve-konfigurationen på port 443 var oförändrad. Normal start, stopp och återstart verifierades också.

Säkerhetsgrinden är inte en uppgift om noll kända sårbarheter: den accepterar den tidigare granskade baslinjen med 19 high och 11 moderate-fynd, daterade undantag och fortsatt blockerad publik mobilrelease enligt `docs/SECURITY_REVIEW.md`. Ngroks nya uuid-väg tillför inget undantag. Fysiska testresultat och CI-status för PR/main ska redovisas separat från dessa lokala körningar.

V4.4.2 mergades som `db13f22` efter godkända PR-kontroller och genomförd agentkodgranskning: [PR 11](https://github.com/sharbel0022/YEHABIBI/pull/11). Även efterföljande [CI på main](https://github.com/sharbel0022/YEHABIBI/actions/runs/39411537794) passerade. Ett extra prov från Windows-datorn genom den faktiska privata Tailscale-HTTPS-adressen bekräftade betalda testorder för Swish, Apple Pay, Google Pay och kort samt samma order i köksadmin. Telefonens mobilnät ingick inte i detta prov. En ny tom testdatabas startades därefter för användarens mobilprov; tidigare provdatabaser behölls på disk.

## Fysiskt testprotokoll för iPhone och Android

För varje körning antecknar du datum, telefonmodell, OS-version, Expo Go-SDK, vald Tailscale-enhet och godkänt/underkänt med konkret fel. Spara inte hemliga nycklar eller privata orderlänkar i protokollet. Använd bara syntetiska namn, e-postadresser på `example.test` och testtelefonnummer.

### Förbered telefonen

1. Installera och anslut Tailscale till samma användare/tailnet som Windows-datorn. Godkänn telefonen enligt kontots policy. Kontrollera att den visas i `tailscale status`.
2. Kontrollera Expo Go-SDK enligt avsnittet ovan. På iPhone måste SDK 57-klienten vara ordnad först. På Android används kompatibel SDK 57-klient från Expo.
3. Kör `npm run dev:remote`, kontrollera testlägesrubriken och öppna den aktuella Expo Go-länken. På iPhone kan länken öppnas genom kamerans QR-läsare eller direktlänk; på Android används Expo Gos skanner eller direktlänk.
4. Ange kundappens sessionsnyckel i anslutningsvyn. Öppna separat den utskrivna privata webbadressens `/__remote/login` och autentisera browsern för simulator och testadmin.
5. Kontrollera att menyn uttryckligen visar testdata innan du beställer.

### Scenario A – utanför hemnätverket

- Låt Windows-datorn vara på med internet, backend, worker och Expo igång.
- Lämna hemnätverket. Stäng av telefonens Wi-Fi och verifiera 4G/5G.
- Kontrollera att Tailscale fortfarande är anslutet. Öppna Yehabibi i Expo Go och hämta menyn igen.
- Godkänt först när den riktiga menyn har hämtats genom den privata backendanslutningen. Ett cachat paket eller en gammal skärmbild räcker inte.

### Scenario B – färdigt paket och hämtning

- Lägg ett syntetiskt färdigt paket i varukorgen, välj hämtning och en ledig serverberäknad tid.
- Kontrollera antal, varurader och totalpris. Skicka en syntetisk testorder.
- Kontrollera att ordern sparas i den isolerade testdatabasen och kan läsas igen i appen.

### Scenario C – hemleverans

- Välj hemleverans med en adress i den syntetiska testzonen. Testzonen använder postnummerprefix `721`.
- Kontrollera leveransavgiften mot API-resultatet och välj ett serverberäknat tidsfönster.
- Bekräfta att ogiltig zon och en tid som inte längre är ledig nekas av servern. Ingen riktig leverans ska bokas.

### Scenario D – simulerad betalning och köksadmin

- Välj en tillgänglig testmetod för Swish, kort, Apple Pay eller Google Pay. Öppna simulatorn genom den privata HTTPS-adressen med förhöjd browserbehörighet.
- Simulera lyckad betalning och kontrollera att appen läser bekräftad status från backend. Återgång från browsern får inte ensam ändra betalningsstatus.
- Logga in i testadmin och kontrollera samma order i köksvyn. Repetera med en misslyckad eller avbruten simulering.
- Inga riktiga betalningsappar, kortuppgifter eller pengar ska användas. Native Apple Pay-/Google Pay-betalningsblad ingår inte i denna simulatorverifiering.

### Scenario E – återöppning och nätverksbyte

- Stäng appen helt. Växla mellan 4G/5G och Wi-Fi med Tailscale anslutet och öppna appen igen.
- Kontrollera att samma testorder och dess aktuella status kan läsas.
- Stoppa och starta sedan datorns fjärrsession utan `--reset`; öppna den nya Expo-länken vid behov och kontrollera att tidigare order finns kvar.

### Scenario F – avbrott och återhämtning

- Med appen öppen kör du `npm run dev:remote:stop` på datorn.
- Begär en uppdatering i appen och kontrollera ett begripligt anslutningsfel. En tidigare order får inte visas som nybetald på grund av nätfel.
- Starta `npm run dev:remote` igen. Öppna den nya Expo-länken vid behov, återanslut och hämta samma orderstatus.
- Kontrollera att arbetaren behandlar väntande jobb efter återstart. Kör diagnostik och kontrollera att bara en fjärrsession är aktiv.

**Status:** scenario A–F på fysisk telefon är inte verifierade genom serverns HTTP- eller automatiska tester. De ska markeras godkända först efter en faktisk körning med telefonen utanför hemnätverket.

## Vad kräver en annan driftform?

En publicerad, alltid tillgänglig backend behövs när appen ska fungera även om Windows-datorn är avstängd, när riktiga kunder ska beställa eller när produktionens betalningswebhooks och schemalagda jobb ska vara tillgängliga oberoende av utvecklingsdatorn. Det är en separat driftsättning med produktionsgranskning.

Remote pushnotiser och egna native-funktioner behöver en development build eller signerad app med rätt certifikat. Expo Go stöder inte fjärrpush i denna SDK; se [Expos push-FAQ](https://docs.expo.dev/push-notifications/faq/). De lokalt fångade testnotiserna verifierar jobbflödet, inte APNs/FCM-leverans till telefonen. En development build kräver inte att Yehabibi publiceras i appbutikerna, men iPhone-installation och TestFlight kan kräva Apple-utvecklarkonto och signering.
