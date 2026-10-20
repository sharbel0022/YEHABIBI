# Öppna Expo – datorn ansluts automatiskt

Anslut Tailscale på telefonen och datorn och öppna Yehabibi i Expo Go. Ingen separat Yehabibi-registrering, kod eller enhetslista visas. Telefonen ska redan vara inloggad på samma privata Tailscale-konto som datorägaren. Detta befintliga Tailscale-godkännande ersätter den tidigare kodjämförelsen.

## Windows som privat server

Från repots rot, vid installation:

```powershell
Set-Location C:\Users\sharbel\Downloads\YEHABIBI
npm run server:install
```

Bakgrundsservern startas direkt och läggs till i **det aktuella Windows-kontots autostart vid inloggning**. Ingen terminal behöver vara öppen. Det är inte en systemtjänst som startar före Windows-inloggningen. Microsoft beskriver detta i [Run-registernycklar](https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys).

Servern väntar/återförsöker om internet eller Tailscale ännu inte är redo. När dess kontrollerade fjärrprocess avslutas försöker bakgrundsprocessen starta igen. Riktig PostgreSQL, syntetisk testbackend, worker, Tailscale Serve och Expo ingår. Stopp/start återanvänder samma databas och Metro-port; inget reset görs automatiskt. Den bevarade porten gör Expo-tunnelns adress stabil vid vanliga omstarter, med samma Expo-projekt, CLI-användare och tunnelinställningar. En ändrad ngrok-/Expo-konfiguration eller extern tunnelstörning kan fortfarande kräva en ny Expo-länk.

Återställning efter OS-omstart använder Windows faktiska boot-GUID, inte WMI:s klockbaserade boottid. En tidskorrigering får inte radera den levande serverns sessionsmetadata. På Linux används kärnans boot-ID. Gamla tidsstämplar räknas inte som bevis för att en OS-omstart har skett.

Windows får en tillfällig, processbunden begäran att hålla systemet vaket medan servern körs. Skärmen kan släckas och energischemat ändras inte. Aktivt valt viloläge, avstängning eller strömavbrott kan fortfarande stoppa åtkomsten. [Microsoft: SetThreadExecutionState](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-setthreadexecutionstate).

```powershell
npm run server:status
npm run dev:remote
npm run dev:remote:doctor
# Stoppar den egna sessionen och pausar bakgrundens återstart under denna OS-start.
npm run dev:remote:stop
# Startar manuellt igen och tar bort pausen.
npm run dev:remote
# Avinstallerar bara Yehabibis egen autostart och stoppar servern.
npm run server:remove
```

`npm run dev` fungerar fortsatt för vanlig localhost-utveckling. Bakgrundens logg finns i `.tmp/remote-server.log`; inga enhetscredentials skrivs ut. Kör `npm run dev:remote` för att se den redan aktiva Expo-länken. Nästa Windows-inloggning startar servern igen om autostarten är installerad. Vid återinstallation stoppas först den gamla egna sessionen kontrollerat. Windows behöver inte administratörsrättigheter för denna kontospecifika autostart.

## Telefonen hemma och på 4G/5G

Öppna samma app i Expo Go med Tailscale anslutet. Menyn verifieras mot datorn innan beställningsskärmarna visas. Appen skapar och sparar en slumpmässig credential i native SecureStore automatiskt. Servern verifierar Tailscale-identiteten, godkänner kundanslutningen automatiskt och ger en fem minuter lång session i minnet. Ingen hemlighet finns i QR, offentlig miljövariabel eller apppaket. Efter telefon-/Expo-/serveromstart används den säkra lagringen och nya sessioner hämtas automatiskt.

Vid nätverksbyte eller avbrott behålls credentialen. Appen försöker igen när den kommer till förgrunden och var femte sekund medan anslutningen saknas. Datorn måste vara på med internet. Telefonens Tailscale-VPN måste tillåta mobilnät. Expo Go måste stödja projektets SDK 57; en framtida Expo Go-uppdatering som tar bort SDK-stödet kräver kompatibel klient eller development build. Automatisk autentisering kan inte göra inkompatibla native SDK-versioner kompatibla.

## Behörighet och återkallning

Automatisk åtkomst gäller enbart datorägarens privata telefoner som finns i den **betrodda lokala Tailscale-nätverkskartan**, har samma användar-ID och är varken taggade eller delade. Även nya egna telefoner kan ansluta efter Tailscale-inloggning. Detta är uttryckligen en bredare kundpolicy än den tidigare appvisa kodjämförelsen. Tailscale Serve ersätter klientens identitetsheaders; gatewayen kräver loopback, exakt privat HTTPS, intern proxyväg, verifierad källadress och stabil node-ID. En klient kan inte välja telefon-ID via headers eller begära automatisk tillit i JSON.

Kundappens credential och session binds till den verifierade noden. En credential stulen till en annan node nekas. Återkallning i det interna registret blockerar hela den noden i automatiskt läge, även om appen försöker skapa en ny credential. De tidigare avancerade revoke-kommandona finns kvar för datoradministration; de ingår inte i anslutningsflödet. Att ta bort telefonen från Tailscale/nätverkskartan stänger också åtkomsten efter nästa identitetsuppdatering, högst tre sekunder för gatewayens cache.

Kundåtkomst ger aldrig testadmin eller simulatorbehörighet. Dessa behåller separat webbläsarinloggning. Privata kundorder kräver fortfarande respektive ordertoken. Interna jobb, betalningswebhooks, transporter och databasanrop blockeras i gatewayen. Testmiljön använder syntetiska data och TestPaymentProvider; inga riktiga pengar eller produktionscredentials aktiveras. Windows-kontot och Tailscale-tjänsten är fortsatt betrodda lokala komponenter.

## Verifieringsgräns

Automatiska prov täcker första anslutning utan godkännande, SecureStore-adapter, sessionsförnyelse, serveromstart, förlorat svar, återkallning även efter credentialbyte, förfalskade headers och separata privilegier. Integrationsproven kör riktig databas/worker och verklig Tailscale Serve från Windows. Autostartinstallation och bakgrundskörning verifieras på den aktuella datorn. Dessa är inte fysiska telefonprov.

Lokalt den 20 oktober 2026: **240 tester**, syntax/TypeScript, mobilens produktionsexport, nio verkliga databas-/fjärrkontroller och Tailscale Serve-provet passerade. HKCU-autostart installerades och lästes tillbaka, den dolda bakgrundsprocessen startade hela miljön, explicit stopp avslutade bakgrundens återstart, och nästa start bevarade samma isolerings-ID, databaskatalog och Expo-tunneladress. Windows native boot-ID gav samma värde i oberoende processer. Kund-API-försök från datorn med förfalskat telefon-ID nekades; detta är inte ett telefonprov.

Verklig Windows-omstart/inloggning, normal inaktivitet som passerar datorns vilotid, telefonens native SecureStore och användning utanför hemmet över 4G/5G ska redovisas som overifierade tills de faktiskt provats. Ingen Windows-omstart eller avstängning utförs automatiskt av installationen.
