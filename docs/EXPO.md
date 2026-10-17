# Expo SDK 57 på iPhone och Windows

Mobilen använder **Expo SDK 57**, React Native **0.86.3**, React **19.2.3**, Expo Router och TypeScript **6.0.3**, enligt användarens iPhone-krav. Samtliga kodkontroller, Expo Doctor 21/21 och export för Android/iOS/webb är godkända. Faktisk enhetskörning och nya native-byggen redovisas separat i [TESTER.md](TESTER.md). SDK 58-byggena nedan är historik.

SDK 57 kräver iOS 16.4 eller senare enligt [Expos versionsreferens](https://docs.expo.dev/versions/v57.0.0/).

## Starta på din iPhone med Expo Go

1. Installera/uppdatera **Expo Go med SDK 57-stöd** från App Store. Expo bekräftade stödet den 3 september 2026. Logga in på samma Expo-konto i telefonen och CLI:n; detta projekt är kopplat till `sharbel1423`. Se [Expos besked om SDK 57 och inloggning](https://expo.dev/changelog/expo-go-57-login).
2. Anslut telefon och dator till samma Wi-Fi. Kör `ipconfig` i PowerShell och hitta datorns IPv4-adress på det aktiva nätverket.
3. Sätt `EXPO_PUBLIC_API_URL=http://DATORNS-LAN-IP:3000` i `apps/mobile/.env.local`. Exempel: `http://192.168.1.50:3000`, där du ersätter exempeladressen med din egen. `10.0.2.2` gäller Android-emulatorn och fungerar inte på din iPhone.
4. Kör från repots rot, efter första installationen och kopiering av miljöfiler:

```powershell
npm install
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/mobile/.env.example apps/mobile/.env.local
npm run dev
```

Kopiera miljöfilerna bara första gången. Ändra mobilens API-adress efter kopieringen så att den inte skrivs tillbaka till emulatoradressen. Next.js och API:t kör nu på port 3000.

Logga in vid behov från en separat terminal:

```powershell
Set-Location apps/mobile
npx expo whoami
npx expo login
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

För Expo Go på Android kan du starta `npm run dev:mobile` och trycka `a`, med en SDK 57-kompatibel Go-version. För egen APK används SDK 57-bygget när det har skapats och verifierats, enligt [TESTER.md](TESTER.md).

## Egen Android development-APK via EAS

EAS är den verifierade byggvägen för detta Windows-projekt. `developmentClient:true`, `android.withoutCredentials:true` och `:app:assembleDebug` ger en debugsignerad APK utan egna releaseuppgifter. Expo-konto behövs; Apple- eller Play Console-konto behövs inte för denna debug-APK. Se [profilschemat](https://docs.expo.dev/eas/json/) och [APK-guiden](https://docs.expo.dev/build-reference/apk/).

Från `apps/mobile`:

```powershell
npx eas-cli@latest build --platform android --profile development --non-interactive --no-wait
```

Kontrollera att byggsidan anger SDK 57 innan du använder artefakten. När den färdiga SDK 57-APK:n hämtats, starta emulatorn och kör, med din faktiska filsökväg:

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

## Tidigare verifierade SDK 58-byggen

Dessa är historik från före användarens byte till SDK 57:

- [Android SDK 58 development-APK](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/ef9ac62b-9472-4e7b-8ed5-7468b52b929e): **FINISHED**, APK installerad med `Success`; native Hem, Menyer och menyval → beställning har körts i Android-emulatorn.
- [iOS SDK 58 simulatorbuild](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/1753e7c0-e7db-4627-adb1-0d6ed520def0): **FINISHED**, version 3.0.0 (1), snapshot före senaste medie-/webbläsarändringarna och V2-sammanslagningen.

De bekräftar SDK 58-källan, inte att SDK 57 fungerar på din fysiska iPhone. Aktuella resultat finns i [TESTER.md](TESTER.md). Hosted Stripe Checkout används i systemwebbläsaren utan native PaymentSheet; native Apple Pay och ägarpush skulle kräva egna native-uppgifter/builds utöver Expo Go.
