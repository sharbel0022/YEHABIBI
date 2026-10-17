# Expo SDK 57 i Windows – V4

Mobilen använder Expo 57.0.30, React Native 0.86.3 och React 19.2.3. Versionen hålls på **SDK 57** för din iPhone. Det befintliga EAS-projektet är [sharbel1423/cedar-mezze](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze), projekt-id `a93fde8c-7227-4824-af1f-9bcffe77221d`.

## Starta på iPhone

Installera Node 22.13 eller senare. Kör från projektets rot:

```powershell
npm install
# Kopiera bara första gången, så egna inställningar inte skrivs över.
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/mobile/.env.example apps/mobile/.env.local
ipconfig
```

Anslut datorn och iPhone till samma Wi-Fi. Sätt `EXPO_PUBLIC_API_URL=http://DATORNS-LAN-IP:3000` i `apps/mobile/.env.local`. Byt exempeltexten mot datorns IPv4-adress från ipconfig. Emulatorns `10.0.2.2` fungerar inte på iPhone.

```powershell
# Terminal 1, från roten: webb och API
npm run dev
# Terminal 2, från roten: Expo Go för SDK 57
npm run dev:mobile
```

Skanna QR med iPhones Kamera och öppna Expo Go med SDK 57-stöd. Logga vid behov in i Expo Go och CLI på samma konto. Från `apps/mobile` kör du `npx expo whoami` och vid behov `npx expo login`.

Öppna först `http://DATORNS-LAN-IP:3000/api/health` i Safari om appen inte når API:t. Starta om Metro efter ändrad API-adress. Produktion använder en riktig HTTPS-adress. En Metro-tunnel med `npx expo start --go --tunnel` gör inte ditt lokala API automatiskt tillgängligt.

Om en tidigare emulatorterminal har en localhost-override, ta bort den innan iPhone-start:

```powershell
Remove-Item Env:REACT_NATIVE_PACKAGER_HOSTNAME -ErrorAction SilentlyContinue
```

## Android Studio

Starta AVD:n i Android Studio → Device Manager. Verifierad lokal AVD är `Medium_Phone_API_36.0` och SDK ligger i `C:\Users\sharbel\AppData\Local\Android\Sdk`. Sätt mobilens API till `http://10.0.2.2:3000`, starta webb/API och `npm run dev:mobile`, tryck sedan `a` för Expo Go.

`npm run android` använder i stället en installerad egen development build. `npm run build:android` försöker native-kompilera lokalt, men det tidigare Windowsförsöket stoppades av långa CMake-sökvägar. EAS är den verifierade byggvägen; globala Java-inställningar behöver inte ändras.

När iPhone använder Expo Go på 8081 kör du den installerade Android-klienten i en separat terminal från `apps/mobile`:

```powershell
$env:EXPO_PUBLIC_API_URL='http://10.0.2.2:3000'
npx expo start --dev-client --host lan --port 8082 --clear
# Tryck a för Android. Webb/API ska redan köra på port 3000.
```

Detta är den verifierade samtidiga konfigurationen för V4 här. Att byta den egna Android-klienten till Expo Go-sessionen på 8081 fastnade vid Bundling 99%; en separat `--dev-client`-session på 8082 löste det. Variabeln ovan gäller bara den terminalen och ändrar inte iPhones LAN-adress i miljöfilen.

## Android- och iOS-byggen med EAS

Kör från `apps/mobile`:

```powershell
npx eas-cli@latest whoami
npx eas-cli@latest project:info
npx eas-cli@latest build --platform android --profile development --non-interactive --no-wait
npx eas-cli@latest build --platform ios --profile ios-simulator --non-interactive --no-wait
```

V4:s [Androidjobb](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/121fab5f-cb08-46eb-a03e-5e13f8c4aecb) och [iOS-simulatorjobb](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/10bef8cf-119c-44b7-ad22-57483478318a) bygger app 4.0.0 med SDK 57 från källcommit 65941bb. Aktuell färdigstatus och artefakter anges i [TESTER.md](TESTER.md). Uppladdning betyder inte lyckat bygge.

| Profil | Identitet | Resultat |
| --- | --- | --- |
| `development` | `se.cedarmezze.app.dev` | Android debug-APK utan egna releaseuppgifter |
| `ios-simulator` | `se.cedarmezze.app.dev` | Osignerad simulatorartefakt för Mac |
| `preview` | `se.cedarmezze.app.preview` | Intern testapp; behöver rätt signering |
| `production` | `se.cedarmezze.app` | Butiksbygge efter separata lanseringskontroller |

Windows kan starta iOS-molnbygget men kan inte köra Xcode/iOS Simulator. En egen build för fysisk iPhone använder `--platform ios --profile development` och kräver Apple-behörighet, signering och registrerad enhet. iOS-profilerna behåller SDK 57-byggmiljön `macos-tahoe-26.5-xcode-26.6`. Ingen butiks-submit sker automatiskt.

För Android: hämta rätt APK, verifiera version/källcommit och installera i emulatorn:

```powershell
$adb='C:\Users\sharbel\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adb devices
& $adb -s emulator-5554 install -r 'DIN-SÖKVÄG\cedar-mezze-v4.apk'
& $adb -s emulator-5554 reverse tcp:8081 tcp:8081
# Från repots rot medan webb/API körs:
npm run android
```

## Push och betalning

V4 har `expo-notifications`57.0.23 och `expo-device`57.0.2 installerade med `expo install` och låsta exakt. Kundens knapp registrerar notiser via orderns privata kod/token. Serverns `CUSTOMER_PUSH_ENABLED=false` och `OWNER_PUSH_ENABLED=false` är grundläget. Ägarens registrering kräver adminsession på webben; ingen separat mobilroll skapas.

Fjärrpush kräver en installerad development-/EAS-app och företagets FCM/APNs-konfiguration. Expo Go visar kundappen men stöder inte fjärrpush. Native moduler laddas för registrering först efter knapptryck och enhetskontroll. [Expos installationsguide](https://docs.expo.dev/push-notifications/push-notifications-setup/) och [Notifications för SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) beskriver förutsättningarna.

Checkout öppnas i systemwebbläsaren, där Stripe visar faktiskt tillgängliga metoder. Apple Pay hör till kortvalet på kompatibla enheter. Se [BETALNINGAR.md](BETALNINGAR.md).

Appen känner bara API-adressen och publik konfiguration. Hemliga nycklar får inte ha prefixet `EXPO_PUBLIC_`. Menyutkast sparar matval utan kontaktuppgifter. Privata orderreferenser sparas i SecureStore på native och sessionStorage på webben. EAS-miljöer skapar inte egna backendservrar; konfigurera API-adress separat för utveckling/test/produktion.
