# Expo SDK 57 på iPhone och Windows

Mobilen använder **Expo SDK 57**, React Native **0.86.3**, React **19.2.3**, Expo Router och TypeScript **6.0.3**, enligt användarens iPhone-krav. Användaren har bekräftat appstart på sin fysiska iPhone via Expo Go; alla sex skärmar har dessutom körts i Androids Expo Go. Samtliga kodkontroller, Expo Doctor 21/21 och export för Android/iOS/webb är godkända. Nya native-byggen och exakt testomfattning redovisas i [TESTER.md](TESTER.md). SDK 58-byggena nedan är historik.

SDK 57 kräver iOS 16.4 eller senare enligt [Expos versionsreferens](https://docs.expo.dev/versions/v57.0.0/).

## Starta på din iPhone med Expo Go

Kör först från repots rot. Kopiera miljöfilerna **bara första gången**, så att egna inställningar behålls:

```powershell
npm install
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/mobile/.env.example apps/mobile/.env.local
```

1. Installera/uppdatera **Expo Go med SDK 57-stöd** från App Store. Expo bekräftade stödet den 3 september 2026. Logga in på samma Expo-konto i telefonen och CLI:n; detta projekt är kopplat till `sharbel1423`. Se [Expos besked om SDK 57 och inloggning](https://expo.dev/changelog/expo-go-57-login).
2. Anslut telefon och dator till samma Wi-Fi. Kör `ipconfig` i PowerShell och hitta datorns IPv4-adress på det aktiva nätverket.
3. Sätt `EXPO_PUBLIC_API_URL=http://DATORNS-LAN-IP:3000` i `apps/mobile/.env.local`. Exempel: `http://192.168.1.50:3000`, där du ersätter exempeladressen med din egen. `10.0.2.2` gäller Android-emulatorn och fungerar inte på din iPhone.

Starta sedan Next.js och API:t på port 3000 i den första terminalen, från repots rot:

```powershell
npm run dev
```

Öppna en andra terminal i repots rot. Logga in vid behov och gå sedan tillbaka till roten:

```powershell
Set-Location apps/mobile
npx expo whoami
npx expo login
Set-Location ../..
```

Starta sedan från repots rot:

```powershell
npm run dev:mobile
```

Detta kör **`expo start --go`** och visar Expo Go-QR. Skanna den med **iPhones Kamera** och öppna i Expo Go. Om terminalen visar development build, tryck `s` för att byta till Expo Go. Ingen egen iOS-build eller Apple Developer-medlemskap behövs för denna SDK 57/Expo Go-körning.

Tillåt lokalt nätverk för Expo Go på iPhone och privat nätverk för Node/Expo om Windows frågar. Öppna först `http://DATORNS-LAN-IP:3000/api/health` i Safari för att kontrollera att telefonen når backend. Starta om Expo när `EXPO_PUBLIC_API_URL` ändrats.

För fysisk iPhone måste Metro annonsera en nåbar LAN-adress. Om du tidigare satt `REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1` för emulatorn, ta bort den från den nya iPhone-terminalen:

```powershell
Remove-Item Env:REACT_NATIVE_PACKAGER_HOSTNAME -ErrorAction SilentlyContinue
```

Vid problem med Wi-Fi/brandvägg kan du starta Metro från `apps/mobile` med `npx expo start --go --tunnel`. En tunnel för Metro gör **inte** automatiskt ditt API på port 3000 tillgängligt; telefonen måste fortfarande nå LAN-adressen eller en separat HTTPS-testbackend. Se [Expo CLI:s nätverksalternativ](https://docs.expo.dev/more/expo-cli/).

## Android Studio-emulatorn

| Del | Verifierad sökväg/värde |
| --- | --- |
| Android Studio | `C:\Program Files\Android\Android Studio\bin\studio64.exe` |
| SDK | `C:\Users\sharbel\AppData\Local\Android\Sdk` |
| Java från Studio | `C:\Program Files\Android\Android Studio\jbr` |
| AVD | `Medium_Phone_API_36.0` |
| Systembild | Android 36, Google Play, x86_64 |

Starta AVD:n i Android Studios **Device Manager**, eller kör:

```powershell
$env:ANDROID_HOME = 'C:\Users\sharbel\AppData\Local\Android\Sdk'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"
Start-Process -FilePath "$env:ANDROID_HOME\emulator\emulator.exe" -ArgumentList '-avd','Medium_Phone_API_36.0','-no-snapshot-load' -WindowStyle Hidden
adb devices
```

Variablerna gäller aktuell terminal; inga globala Java-inställningar behöver ändras. Emulatorn har startats som `emulator-5554` med `sys.boot_completed=1`. Använd `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000` vid emulatortest.

`npm run android` använder en **egen development build**, medan `npm run dev:mobile` använder **Expo Go** för iPhone. Den egna appen måste vara byggd för samma SDK 57 som projektet. SDK 58-APK:n är en äldre testartefakt och ska inte laddas med SDK 57-källan.

För Expo Go på Android kan du starta `npm run dev:mobile` och trycka `a`, med en SDK 57-kompatibel Go-version. För egen APK används det färdiga SDK 57-bygget nedan; installations-/teststatus finns i [TESTER.md](TESTER.md).

## Egen Android development-APK via EAS

EAS är den verifierade byggvägen för detta Windows-projekt. `developmentClient:true`, `android.withoutCredentials:true` och `:app:assembleDebug` ger en debugsignerad APK utan egna releaseuppgifter. Expo-konto behövs; Apple- eller Play Console-konto behövs inte för denna debug-APK. Se [profilschemat](https://docs.expo.dev/eas/json/) och [APK-guiden](https://docs.expo.dev/build-reference/apk/).

Från `apps/mobile`:

```powershell
npx eas-cli@latest build --platform android --profile development --non-interactive --no-wait
```

Det nya [SDK 57 Android-bygget](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/8aecfb1a-e685-48f7-b2b5-4036287996d3) är **FINISHED** för källcommit `c147a7c`, app 3.0.0 (1). [Hämta SDK 57 development-APK](https://expo.dev/artifacts/eas/ykbEJDaMR8-uzR1iJxk9XJa82ENf2gTR9qnWmZ5Ju4I.apk). APK:n har installerats med `Success` och den egna appens start, Hem, katalog/plus i Bygg och tom privat orderlista har verifierats i emulatorn. Det är en egen development client; Expo Go används fortsatt som standard på iPhone.

Kontrollera att byggsidan anger SDK 57 innan du använder artefakten. När APK:n hämtats, starta emulatorn och kör, med din faktiska filsökväg:

```powershell
$adb = 'C:\Users\sharbel\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adb -s emulator-5554 install -r 'C:\Users\sharbel\Downloads\cedar-mezze-sdk57-dev.apk'
& $adb -s emulator-5554 reverse tcp:8081 tcp:8081
# Repots rot, medan Next.js körs
npm run android
```

Alternativt kan `npx eas-cli@latest build:run --platform android` från `apps/mobile` installera vald färdig build. Välj rätt SDK, inte bara senaste datum.

Om Metro bara lyssnar på IPv6 `::1` kan `adb reverse` missa servern. Det hände med `--host localhost`. För emulatorn kan du från `apps/mobile` använda:

```powershell
$env:REACT_NATIVE_PACKAGER_HOSTNAME = '127.0.0.1'
npx expo start --dev-client --host lan --port 8081
```

På fysisk iPhone ska denna localhost-override tas bort och LAN-adressen användas i stället.

## Lokal native-kompilering på Windows

`npm run build:android` finns för lokal kompilering men är **inte en verifierad lösning i nuvarande Downloads-checkout**. Försöket med SDK 58 stoppades först av `MAX_PATH` i Reanimateds CMake/Ninja. Ett försök via `subst Y:` stoppades också när codegen blandade `Y:` och `C:`. Kortare fysiska sökvägar kan felsökas separat; `subst` har inte löst problemet här.

Studio-JDK, SDK, NDK och CMake installerades korrekt. Ingen extra hjälparfil eller ny Android Studio-installation behövs för EAS-bygget. SDK 57:s emulator-/buildtester redovisas separat.

## Expo/EAS-konto och miljöer

`whoami` och `project:info` har verifierat **`sharbel1423`** och [Cedar Mezze-projektet](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze). `app.config.ts` har projekt-id `a93fde8c-7227-4824-af1f-9bcffe77221d`. Det är publik konfiguration. Kontrollera från `apps/mobile`:

```powershell
npx eas-cli@latest whoami
npx eas-cli@latest project:info
```

Vid behov: `npx eas-cli@latest login`. Ny `eas init` behövs inte för detta projekt. Vid avsiktligt byte av ägare/projekt används `eas init` och den dynamiska appkonfigurationen uppdateras med verkliga värden. Expo Go på iPhone måste fortfarande vara inloggad på samma konto som Expo CLI.

| Profil / `APP_ENV` | Identitet | Användning |
| --- | --- | --- |
| `development` | `se.cedarmezze.app.dev` | Egen utvecklingsapp, Android debug-APK |
| `ios-simulator` / `development` | `se.cedarmezze.app.dev` | iOS-simulatorbuild |
| `preview` | `se.cedarmezze.app.preview` | Intern testapp |
| `production` | `se.cedarmezze.app` | Butiksbygge |

iOS-profilerna låser byggmiljön till `macos-tahoe-26.5-xcode-26.6`; simulatorprofilen ärver samma val. Det är [Expos SDK 57-image](https://docs.expo.dev/build-reference/infrastructure/), så bygget följer rätt Xcode-generation i stället för en föränderlig `latest`-miljö.

Profilerna skapar inte egna backend-servrar. Sätt utveckling/test/produktions-API separat. `EXPO_PUBLIC_` är publikt; inga databas- eller betalningshemligheter hör hemma där. Appnamn, ikon, splash, version och schemes ligger i `app.config.ts`.

## iOS-build från Windows

Expo Go på din iPhone använder SDK 57-starten ovan. En egen simulator- eller iPhone-build är ett separat arbetsflöde. Från `apps/mobile`:

```powershell
npx eas-cli@latest build --platform ios --profile ios-simulator
# För fysisk enhet, med rätt Apple-konto/signering:
npx eas-cli@latest build --platform ios --profile development
```

Windows kan starta EAS-molnbygget men kan inte köra Xcode/iOS Simulator. Simulatorartefakten installeras på en Mac. Egen build för fysisk iPhone kräver rätt Apple-behörighet, signering och enhetsregistrering. Ingen butiks-submit körs automatiskt.

Det nya [SDK 57 iOS-simulatorbygget](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/582a9830-1993-46e0-b8b9-079f589e7848) är **FINISHED** för källcommit `c147a7c`, app 3.0.0 (1). [Hämta simulatorartefakten](https://expo.dev/artifacts/eas/TpvKQfNdLRWRzyKANT8KQ0OerADUwYbHwsUIERmWhcM.tar.gz). Det är separat från Expo Go på din iPhone och har inte körts i en Mac-simulator här.

## Tidigare verifierade SDK 58-byggen

Dessa är historik från före användarens byte till SDK 57:

- [Android SDK 58 development-APK](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/ef9ac62b-9472-4e7b-8ed5-7468b52b929e): **FINISHED**, APK installerad med `Success`; native Hem, Menyer och menyval → beställning har körts i Android-emulatorn.
- [iOS SDK 58 simulatorbuild](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/1753e7c0-e7db-4627-adb1-0d6ed520def0): **FINISHED**, version 3.0.0 (1), snapshot före senaste medie-/webbläsarändringarna och V2-sammanslagningen.

De bekräftar SDK 58-källan, inte att SDK 57 fungerar på din fysiska iPhone. Aktuella resultat finns i [TESTER.md](TESTER.md). Hosted Stripe Checkout används i systemwebbläsaren utan native PaymentSheet; native Apple Pay och ägarpush skulle kräva egna native-uppgifter/builds utöver Expo Go.

## V4 och pushnotiser

V4 använder fortfarande SDK57 och samma Expo-projekt. Appversionen är4.0.0. Menyutkast sparas mellan besök; de innehåller inga kontaktuppgifter. Orderreferenser ligger fortsatt i SecureStore på native och sessionStorage på webben.

`expo-notifications`57.0.23 och `expo-device`57.0.2 installerades med `expo install` och är låsta till exakta versioner. Kundens knapp för statusnotiser registrerar token via det privata order-API:t. Servern kräver `CUSTOMER_PUSH_ENABLED=true`; grundläget ärfalse. Ägarpush använder den befintliga adminskyddade registreringen. Ägarinloggning finns på webben, inte som separat mobilroll.

Expo Go kan fortfarande visa och använda kundappen på din iPhone men ger inte fjärrpush. Native notiser behöver en ny development build, FCM/APNs-konfiguration och verkligt enhetstest. Registreringen laddas först efter ett uttryckligt knapptryck och kontroll av att det är en installerad app på en fysisk enhet. Se [Expos pushguide](https://docs.expo.dev/push-notifications/push-notifications-setup/) och [SDK57 Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).

Bygg V4 från `apps/mobile` med samma EAS-kommandon ovan. De tidigare V3-länkarna är historik; aktuella V4-byggen anges i [TESTER.md](TESTER.md). Build success verifierar kompilering och ersätter inte fysisk iPhone-, push- eller betaltest.
