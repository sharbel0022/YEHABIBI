# Expo på Windows

Expo-appen finns i `apps/mobile`. Den använder Expo SDK **58**, React Native **0.88**, React **19.3**, Expo Router och TypeScript **6.0.3**. Installera workspaces från repots rot; skapa inte ett nytt Expo-projekt ovanpå detta.

## Starta utvecklingen

```powershell
# Terminal 1, repots rot
npm install
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/mobile/.env.example apps/mobile/.env.local
npm run dev
```

Kopiera miljöfilerna bara första gången så att egna inställningar inte skrivs över. Starta en andra terminal i roten:

```powershell
npm run dev:mobile
```

Standardstarten använder `expo-dev-client`, din egen **Cedar Mezze Dev**. Starta Android-emulatorn och installera appen första gången enligt avsnittet om development build nedan. Därefter trycker du **a** i Expo-terminalen eller kör `npm run android` för att öppna den installerade appen. På fysisk mobil behöver samma development build installeras och telefonen nå Metro/API på nätverket.

Expo Go finns som separat alternativ:

```powershell
npm run go --workspace @yehabibi/mobile
```

Go-versionen måste passa SDK 58. På fysisk mobil används samma Wi-Fi och terminalens QR-kod. SDK-stöd i butiksversionen av Expo Go kan släppas senare än själva SDK:n; använd development build om rätt Go-version saknas.

API-adressen sätts i `apps/mobile/.env.local`:

```dotenv
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000
APP_ENV=development
```

Android-emulatorns `10.0.2.2` når datorn. På fysisk mobil anger du datorns LAN-IP, på Expo Web `http://localhost:3000` och i publicerad app en riktig HTTPS-adress. Mobilen måste också nå Metro-servern. Starta om Expo när miljövariabler ändras.

För Expo Web: `npm run web --workspace @yehabibi/mobile`. Tillåt webbförhandsvisningens exakta origin i serverns `MOBILE_WEB_ORIGINS`. Terminalens Expo-QR startar utvecklingsappen; webbens order- och recensionskoder har andra syften.

## Din Android Studio-miljö

Följande hittades vid miljögranskning 2026-10-17:

| Del | Sökväg/värde |
| --- | --- |
| Android Studio | `C:\Program Files\Android\Android Studio\bin\studio64.exe` |
| SDK | `C:\Users\sharbel\AppData\Local\Android\Sdk` |
| Java från Studio | `C:\Program Files\Android\Android Studio\jbr` |
| AVD | `Medium_Phone_API_36.0` |
| Systembild | Android 36, Google Play, x86_64 |
| Installerade build-tools | 35.0.0 och 36.0.0 |

Öppna Studio → **Device Manager** → starta AVD:n med spelknappen. Eller kör i PowerShell:

```powershell
$env:ANDROID_HOME = 'C:\Users\sharbel\AppData\Local\Android\Sdk'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"
Start-Process -FilePath "$env:ANDROID_HOME\emulator\emulator.exe" -ArgumentList '-avd','Medium_Phone_API_36.0','-no-snapshot-load' -WindowStyle Hidden
adb devices
```

Variablerna gäller den aktuella terminalen. Använd Studio-JDK:n; Java-genvägen som redan låg på PATH svarade inte under miljögranskningen. Installera eventuella saknade SDK Platform/Build Tools/Command-line Tools via Studios **SDK Manager** enligt byggets felmeddelande.

Om emulatorn inte startar: kör `emulator -accel-check`. Den första kontrollen upptäckte Hyper-V men bad om kontroll av Windows-funktionerna **Hyper-V** och **Windows Hypervisor Platform**. Det är inget bevis på att appen har körts. Aktuellt faktiskt testresultat står i [TESTER.md](TESTER.md).

Emulatorn har därefter startats och verifierats som `emulator-5554`, `sys.boot_completed=1`. Android-prebuild har lyckats. Gradle installerade SDK 37, NDK 27.1 och CMake 3.22.1. Android 36 är emulatorns systembild; SDK-versionen som bygget använder kan vara högre. Ingen ny Android Studio-installation behövdes.

## Egen Android development build

En development build innehåller `expo-dev-client` och projektets egna native-inställningar. Med emulatorn igång:

```powershell
# Repots rot, samma SDK/JAVA-variabler som ovan
npm run build:android
```

Detta genererar Android-projektet och bygger/installerar appen lokalt. För fortsatt utveckling med redan installerad build:

```powershell
npm run dev --workspace @yehabibi/mobile
```

### Lokal Windows-kompilering: två försök stoppade

Första Gradle-försöket från `C:\Users\sharbel\Downloads\YEHABIBI` stoppades av Windows `MAX_PATH` i Reanimateds CMake/Ninja-bygge. SDK-/Java-installationen fungerade. Ett andra försök mappade samma projekt till `Y:` med `subst` och genererade om native-projektet, men codegen blandade `Y:` med ursprungliga `C:`-sökvägar och kompileringen stoppades igen.

Kortare fysiska sökvägar kan vara en felsökningsåtgärd, men `subst` har inte verifierats som lösning här. Ingen extra hjälparfil eller ny Android Studio-installation behövs för att använda EAS-molnbygget nedan. Android-emulatorn fungerar separat från dessa kompileringsfel.

Vid behov kan `adb reverse tcp:8081 tcp:8081` hjälpa emulatorn att nå Metro. Native-projekt genereras från `app.config.ts`; ändra i första hand den filen. Byte mellan miljöidentiteter kan kräva att native-projektet genereras på nytt enligt [Expos variantguide](https://docs.expo.dev/build-reference/variants/).

## Expo/EAS-kontot

Inloggningen som **`sharbel1423`** har verifierats och ett riktigt [Cedar Mezze-projekt har skapats i EAS](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze). `app.config.ts` innehåller `owner: 'sharbel1423'` och projekt-id `a93fde8c-7227-4824-af1f-9bcffe77221d`. Det är publik konfiguration. Se [TESTER.md](TESTER.md) för status på projektläsning och byggen.

På din dator kan du kontrollera kontot och projektet så här:

```powershell
Set-Location apps/mobile
npx eas-cli@latest whoami
npx eas-cli@latest project:info
```

Om du behöver logga in igen: `npx eas-cli@latest login`. Om företaget senare flyttar till ett eget Expo-konto ska ägarskap och projektkoppling ändras medvetet. För ett annat projekt används `npx eas-cli@latest init`; den dynamiska konfigurationen kan behöva uppdateras manuellt. `EXPO_PUBLIC_EAS_PROJECT_ID` kan ersätta det konfigurerade id:t, men måste i så fall ange ett verkligt tillgängligt EAS-projekt. Att projektet finns bekräftar inte Apple-/Google-konton eller signering.

`eas.json` har tre miljöprofiler och en separat simulatorprofil:

| Profil / `APP_ENV` | Identitet | Användning |
| --- | --- | --- |
| `development` | `se.cedarmezze.app.dev` | Egen utvecklingsapp, intern Android APK |
| `ios-simulator` / `development` | `se.cedarmezze.app.dev` | iOS-simulatorbuild, ärver development |
| `preview` | `se.cedarmezze.app.preview` | Intern testapp, Android APK |
| `production` | `se.cedarmezze.app` | Butiksbygge, stigande byggnummer |

Namnen är arbetsidentiteter som företaget ska bekräfta före registrering i butikerna. Appnamn, ikon, splash, scheme och version bestäms av `app.config.ts`. Se [EAS-miljövariabler](https://docs.expo.dev/eas/environment-variables/).

Molnbygg från `apps/mobile` efter kontokoppling och rätt miljövariabler:

```powershell
npx eas-cli@latest build --platform android --profile development
npx eas-cli@latest build --platform ios --profile development
```

### Android development-APK från EAS

En APK från EAS kan installeras i samma Windows-AVD. `developmentClient:true` väljer Androids debugbygge; `android.withoutCredentials:true` hoppar över EAS-hanterade releaseuppgifter. Det används tillsammans med `:app:assembleDebug`, inte för en butikssignerad release. Se [Expos profilschema](https://docs.expo.dev/eas/json/) och [APK-guiden](https://docs.expo.dev/build-reference/apk/).

När sammanslagen källa och profil har verifierats startas bygget från `apps/mobile`:

```powershell
npx eas-cli@latest build --platform android --profile development --non-interactive --no-wait
```

Ingen Apple- eller Play Console-anslutning behövs för en Android debug-APK. När den är klar installeras den via EAS:s `build:run --platform android` eller `adb install` från den nedladdade APK-filen. Därefter startas Metro med `npm run dev:mobile` från roten. Aktuell status finns i [TESTER.md](TESTER.md); ett förberett kommando är ingen rapporterad build.

För simulatorartefakt utan fysisk iPhone används `npx eas-cli@latest build --platform ios --profile ios-simulator`. Ett riktigt [iOS-simulatorbygge har slutförts i EAS](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze/builds/1753e7c0-e7db-4627-adb1-0d6ed520def0), version 3.0.0 (1). Det använder en snapshot före senaste mediefallbacken, systemwebbläsarändringen och V2-sammanslagningen. Slutkällans separata verifieringar redovisas i [TESTER.md](TESTER.md). En simulatorartefakt installeras på en Mac med iOS Simulator och är inte en App Store-release.

En development build för fysisk iPhone kräver Apples rätta behörigheter, signering och enhetsregistrering. Windows kan starta en iOS-molnbyggning men kör inte Apples iOS Simulator eller Xcode lokalt. Se [Expos byggguide](https://docs.expo.dev/build/setup/) och [PUBLICERING.md](PUBLICERING.md).

## Vad som kräver en egen build

Menyer, order, säker lokal lagring, video och hosted Stripe Checkout används utan native PaymentSheet. Expo Go är för snabb UI-utveckling. Egen build behövs för projektets native-identitet och för att verifiera fjärrpush med egna plattformsuppgifter om det aktiveras. Native Apple Pay skulle dessutom kräva Merchant ID och certifikat. Konton, Stripe-sandbox och fysisk enhet behövs för att faktiskt bekräfta betalmetoderna.
