# V4.4.3 – godkänd telefon utan återkommande sessionsnyckel

**Historik:** Den manuella registrering som beskrivs nedan har ersatts av [automatiskt privat serverläge](AUTOMATIC_PRIVATE_SERVER.md). Nu räcker telefonens verifierade befintliga Tailscale-inloggning; ingen lista, kodjämförelse eller godkännandekommando behövs i normal användning.

## Varför den gamla nyckeln behövdes

V4.4.2 lade en separat, slumpmässig kundnyckel framför den isolerade testmiljön. Gatewayens nyckel och sessioner fanns bara för den aktuella starten. Telefonens sparade nyckel blev därför ogiltig när Windows eller fjärrstarten startades om. Tailscale-inloggning ensam visade vilken användare som anslöt, inte vilken av användarens telefoner som godkänts för Yehabibi.

V4.4.3 ersätter mobilens delade startnyckel med en beständig enhetsregistrering. Ingen befintlig localhost-spärr har vidgats med publika värdnamn. TestPaymentProvider, PostgreSQL/PostgREST, worker, testadmin, syntetiska order och separata kundordertokens behålls.

## Verifierad Tailscale-identitet och förtroendegräns

[Tailscales dokumentation](https://tailscale.com/docs/features/tailscale-serve#identity-headers) anger att Serve tar bort klientens identitetsheaders och sätter `Tailscale-User-Login` från den faktiska anslutningen. Taggade enheter får inte användaridentitet. Identiteten är en användare, inte en signerad telefonidentifierare. [Serve-källkoden](https://github.com/tailscale/tailscale/blob/main/ipn/ipnlocal/serve.go) sätter även om `X-Forwarded-For` till en enda faktisk tailnet-IP-adress.

Gatewayen lyssnar bara på `127.0.0.1`, kräver exakt privat HTTPS-värd och en slumpmässig intern Serve-sökväg. Den interna sökvägen finns bara i den lokala proxykonfigurationen, aldrig i Expo-länken. Direkta loopbackanrop med bara påhittade identitetsheaders avvisas. Därefter jämförs proxyidentiteten och den exakta källadressen med Tailscales lokala nätverkskarta. Bara den valda telefonens stabila `Peer.ID`, rätt ägare och rätt användarinloggning accepteras. Listor av IP-adresser, okända/taggade/delade enheter och klientens påstådda node-ID används inte som identitet. Kartan uppdateras efter högst tre sekunder och fel stänger åtkomsten.

Windows-kontot, datorns administratörer och Tailscale-tjänsten är betrodda. Serve signerar inte headers till den lokala HTTP-backenden. En process med tillgång till lokala testhemligheter/proxykonfigurationen kan inte betraktas som en obetrodd fjärrklient; samma konto kan också godkänna enheter och läsa testdatabasen. Den interna proxyvägen är ett extra skydd mot direktanrop, ingen telefoncredential. Tailscale kan skriva sitt backendmål i sina egna lokala daemonloggar. Enhetens credential skickas aldrig till dessa konfigurationskommandon eller loggar.

## Registrering och automatisk autentisering

1. Användaren väljer **Registrera denna telefon** i den privata testappen. `expo-crypto` skapar 256 slumpbitar. Hemligheten sparas först i native SecureStore med en nyckel som avgränsas av den privata API-adressen. iOS använder `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Webbläsarregistrering är avstängd.
2. Appen skickar credential i en JSON-POST över exakt privat Tailscale HTTPS, med redirects avstängda. Gatewayen skapar en väntande registrering bunden till verifierad node-ID och användare. Windows sparar bara SHA-256-hashar och metadata, aldrig den råa enhetshemligheten.
3. Appen visar ett enhets-ID och en jämförelsekod. Användaren jämför båda skärmarna och godkänner just denna registrering på datorn inom tio minuter. Koden är ingen inloggningsnyckel. Ett tappat svar återanvänder samma sparade credential och väntande registrering.
4. Efter godkännande hämtar appen en fem minuter lång kundsession. Sessionstoken finns bara i minnet. Den förnyas automatiskt, samordnas mellan samtidiga anrop och ersätts efter gateway-/Expo-/telefonomstart. En avvisad gammal gatewaysession återförsöks en gång före upstream. Orderns egna behörighetsfel eller okända nätfel spelar inte om en beställning.
5. Vid Tailscale-/nätavbrott behålls registreringen. Appen provar igen vid återkomst till förgrunden och var femte sekund medan anslutningen är otillgänglig. Återkallad/ogiltig behörighet ger ett svenskt meddelande och kräver uttrycklig ny registrering; den godkänns aldrig automatiskt.

[Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) stöder native Expo Go. Den här modellen behöver ingen Tailscale-native-modul i Expo: Windows verifierar nätidentiteten. SDK 57 kräver fortfarande en SDK-kompatibel Expo Go-installation eller en development build enligt [SDK-guiden](REMOTE_DEVELOPMENT_V442.md). SecureStore raderas normalt när Android-appen avinstalleras; byte av telefon, appmiljö eller API-origin kan kräva ny registrering. iOS kan behålla Keychain efter ominstallation, men en credential från en annan Tailscale-node nekas ändå.

En stulen credential från en annan Tailscale-enhet nekas även om angriparen har samma användarkonto. En angripare som också kontrollerar den godkända telefonen kan använda dess behörighet tills den återkallas. Återkallning kontrolleras från det beständiga registret vid varje nytt API-anrop; ett redan påbörjat anrop kan hinna slutföras.

| Behörighet | Krav |
| --- | --- |
| Privat kund-API | Godkänd Tailscale-node/användare + godkänd enhetscredential + kort kundsession |
| Privat kundorder | Dessutom orderns befintliga privata ordertoken; enhetsgodkännande avslöjar inga andra order |
| Testadmin | Separat förhöjd webbläsarnyckel och befintlig oberoende testadmininloggning |
| Simulerad betalning | Separat förhöjd webbläsarsession och befintlig betalningscapability; inga riktiga pengar |
| Interna jobb, transporter, DB och providerwebhooks | Blockerade i fjärrgatewayen; interna serverhemligheter stannar på datorn |

Gatewayen tillåter kundens vanliga betalningsinitiering/status med rätt ordertoken. Dessa ger aldrig rätt att anropa simulatorns `/simulate`, leverantörswebhook eller interna jobb-API. Den interna startnyckeln används fortfarande av datorns hälsokontroll och paketeras inte till mobilen.

## Exakta Windows-kommandon

Kör PowerShell från repots rot. `npm ci` behövs vid installation eller när låsfilen ändrats.

```powershell
Set-Location C:\Users\sharbel\Downloads\YEHABIBI
npm ci
npm run dev
```

`npm run dev` är den vanliga localhost-utvecklingen. För hela den privata isolerade testmiljön:

```powershell
npm run dev:remote
```

Öppna den aktuella Expo-länken i en SDK-kompatibel Expo Go på iPhone/Android med Tailscale anslutet. Första gången väljer du **Registrera denna telefon**. I en andra PowerShell:

```powershell
Set-Location C:\Users\sharbel\Downloads\YEHABIBI
npm run dev:remote:devices -- list
# Ersätt ENHETS-ID och JAMFORELSEKOD med exakt samma ID/kod som telefonen visar.
npm run dev:remote:devices -- approve ENHETS-ID JAMFORELSEKOD
```

Appen ansluter automatiskt efter godkännandet. Kommandot godkänner kundåtkomst, aldrig admin. Startar du `npm run dev:remote` en gång till medan allt körs visas den befintliga sessionen; inga extra servrar eller nyckelbyten skapas.

```powershell
npm run dev:remote
npm run dev:remote:doctor
npm run dev:remote:stop
# Nästa normala start återanvänder samma order/databas och godkända enheter.
npm run dev:remote
```

Efter Windows-omstart kör du samma startkommando igen. Startprogrammet jämför OS-boot-ID och städar bara metadata från en bevisligen tidigare OS-start och exakt egen Serve-lease. Gamla PID:n används aldrig för att stoppa processer. En avbruten session under samma OS-start eller ändrad främmande Serve-konfiguration stoppas för manuell granskning. Ingen automatisk Windows-autostart/tjänst installeras.

Expo-tunnelns adress kan ändras efter omstart. Öppna den nya Expo-länken vid behov; den privata backendadressen och SecureStore-registreringen är stabila. Tailscale måste vara anslutet, telefonen upplåst och datorn på med servern igång. På iPhone ska VPN On Demand tillåta mobilnät; se [Tailscales iOS-guide](https://tailscale.com/docs/features/client/ios-vpn-on-demand).

## Återkalla eller registrera om

```powershell
npm run dev:remote:devices -- list
npm run dev:remote:devices -- revoke ENHETS-ID
# Explicit återkallning av alla väntande och godkända registreringar:
npm run dev:remote:devices -- revoke-all
```

Revoke fungerar även när fjärrsessionen är stoppad. När den körs går kommandot genom den autentiserade lokala sessionskontrollen. Registret skyddas mot samtidiga skrivningar och gamla lås efter verifierad OS-omstart. Ett vanligt stopp tar inte bort registret. Ta inte bort registret manuellt för återkallning: återkallade hashposter behålls för att gamla credentials inte ska kunna återregistreras tyst.

För ny behörighet väljer du **Glöm telefonens registrering** i appen, registrerar igen och jämför/godkänner den nya koden på datorn. Att bara låsa appen är lokalt och återkallar inte serverbehörigheten. **Anslut igen** låser upp den lokalt. Telefonen kan inte låsas upp automatiskt av ett sent nätverkssvar.

`npm run dev:remote -- --reset` väljer uttryckligen en ny tom testdatabas och bevarar gamla databasfiler. Det återkallar inte telefoner. Använd `revoke-all` för det. Normal start/stopp/omstart använder aldrig `--reset`. Vid flera telefoner väljer du den aktuella med `npm run dev:remote -- --device TELEFONENS-DNS-ELLER-NODE-ID`; registreringen är fortfarande individuell.

Testadmin och simulator kräver även fortsättningsvis separat manuell webbinloggning. Hemligheterna finns bara lokalt i `.tmp/remote-credentials.txt`. Vanlig kundapp behöver ingen manuell sessionsnyckel efter första godkännandet. Inga enhetshemligheter finns i `EXPO_PUBLIC_*`, Expo-länkar, GitHub eller applikationsloggar.

## Verifiering och kvarvarande fysiska prov

Verifierat på Windows den 20 oktober 2026: `npm test` passerade med **235 tester**, syntax/TypeScript, produktionswebbbygge, mobilens produktionsexport, webbsmoke (10 sidor), separat localhost-testmiljö (25 kontroller), fjärrintegration (9 kontroller), Metro-säkerhet/filbevakning samt verkligt privat Tailscale Serve-HTTPS-prov. Produktionsfilerna jämfördes också med nio aktuella lokala testhemligheter utan träff. Inga hemliga värden skrevs ut.

Hela `dev:remote` startade på Windows med den tidigare sparade databasen, verifierade privat HTTPS/isoleringsmarkör och skapade en fungerande Expo-tunnel. Ett andra `dev:remote` återanvände den aktiva sessionen. Enhetslistan hämtades genom den autentiserade lokala kontrollen. Automatiska testnamn beskriver protokoll och simulerade livscykler; de bevisar inte ett fysiskt OS-/telefonprov. CI-resultatet ska avläsas för den aktuella PR-committen före merge.

Både iOS- och Android-manifest samt JavaScript-paket hämtades genom den riktiga Expo-tunneln efter ändringen. De angav testmiljö och rätt privat API-adress, utan datorns kontroll-/adminhemligheter eller interna proxyväg. Detta verifierar leverans från datorn, inte att native UI eller SecureStore har körts på telefonen. Beroendegranskningen passerade med oförändrad daterad undantagspolicy; de tidigare 19 high/11 moderate-fynden och produktionsreleasebegränsningarna finns kvar enligt [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

| Prov | Omfattning |
| --- | --- |
| `npm test` | Registrering, fel kod, ogiltig/stulen credential, nodebyte, sessionsförnyelse, samtidighet, återkallning, nätavbrott, lås/glöm-race, exakt origin och produktionsspärr |
| `npm run test:remote` | Riktig PostgreSQL/PostgREST/Next/worker via simulerad Serve-gräns; automatisk ny session, kvarvarande betalda order efter omstart, separat ordertoken/admin/simulator/interna API |
| `npm run test:tailscale` | Valfritt verkligt privat Serve-HTTPS-prov från datorn med syntetisk liten backend; verifierar proxyheaders och spoofstrippning, aldrig telefon/4G |
| `npm run test:metro` | Riktig Metro-ombyggnad och blockerade privata filer/källkartor |
| `npm run build`, `npm run export:mobile` | Produktionsbyggen utan tillförda testcredentials; fjärrregistrering kräver dessutom `__DEV__` och `APP_ENV=test` |

**Inte verifierat på fysisk telefon i detta arbete:** första godkännande i iOS/Android SecureStore, telefon-/Expo Go-omstart, Wi-Fi till 4G/5G, förlorad/återställd telefon-VPN och återkallningsmeddelande i native UI. **Ingen verklig Windows-omstart har genomförts.** Boot-ID-beslut, gamla lås, ny gatewayprocess och beständigt register testas automatiskt; full OS-omstart återstår. Ett lyckat HTTPS-prov från Windows är inget bevis för telefonens DNS, VPN eller mobiloperatör.

Fysiskt acceptansprov: registrera/godkänn på telefonen, hämta menyn och skapa en syntetisk order. Stäng och öppna appen, starta om Expo, stoppa/starta fjärrsessionen och slutligen starta om Windows utan reset. Hämta samma order. Växla till 4G/5G, stäng av Tailscale och verifiera begripligt fel, anslut igen och kontrollera automatisk återhämtning. Återkalla enheten på datorn och kontrollera att native UI visar återkallad åtkomst. Anteckna modell/OS/SDK, datum och faktiskt resultat enligt [telefonprotokollet](REMOTE_DEVELOPMENT_V442.md#fysiskt-testprotokoll-för-iphone-och-android).
