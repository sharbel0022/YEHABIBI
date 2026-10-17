# Expo SDK 57 i Windows – V4.2

Mobilen behåller Expo 57.0.30, React Native 0.86.3 och React 19.2.3. V4.2 inför inga nya native-moduler. Appversionen är 4.2.0 och det befintliga [EAS-projektet sharbel1423/cedar-mezze](https://expo.dev/accounts/sharbel1423/projects/cedar-mezze) bevaras, projekt-ID `a93fde8c-7227-4824-af1f-9bcffe77221d`.

API-anrop och affärsregler finns nu i `packages/api-client` och `packages/shared`. Native navigation, tangentbord, datumväljare, lagring och pushbehörighet stannar i `apps/mobile`. EAS skapar ingen extra backend eller databas.

## Starta iPhone och Android

Använd Node.js 22.13 eller senare. Kör från repots rot:

```powershell
npm ci
if (!(Test-Path apps/web/.env.local)) {
  Copy-Item apps/web/.env.example apps/web/.env.local
}
if (!(Test-Path apps/mobile/.env.local)) {
  Copy-Item apps/mobile/.env.example apps/mobile/.env.local
}
ipconfig
```

Anslut dator och fysisk mobil till samma Wi-Fi. Sätt datorns IPv4-adress som API-bas i `apps/mobile/.env.local`:

```dotenv
EXPO_PUBLIC_API_URL=http://DATORNS-LAN-IP:3000
APP_ENV=development
```

`10.0.2.2` fungerar för Android-emulatorn, medan en fysisk iPhone/Android behöver datorns LAN-adress. Publicerade appar kräver företagets HTTPS-adress. HTTP tillåts uttryckligen av API-klienten i utvecklingsläge.

```powershell
# Terminal 1, från repots rot: webb och gemensamt API
npm run dev
# Terminal 2, från repots rot: Expo Go med SDK 57
npm run dev:mobile
```

Skanna QR med iPhones Kamera och öppna Expo Go med SDK 57-stöd. Använd samma Expo-konto i CLI och telefonen, här `sharbel1423`. Vid behov kör du `npx expo whoami` och `npx expo login` från `apps/mobile`.

Öppna `http://DATORNS-LAN-IP:3000/api/health` i mobilens webbläsare om appen inte når servern. Starta om Metro efter ändrad API-adress. En Metro-tunnel gör inte ditt lokala API automatiskt tillgängligt. Expo Web kräver också korrekt `MOBILE_WEB_ORIGINS` på servern.

Om en gammal terminal har en localhost-override kan den tas bort före LAN-start:

```powershell
Remove-Item Env:REACT_NATIVE_PACKAGER_HOSTNAME -ErrorAction SilentlyContinue
```

## Android Studio och egen development build

Starta en AVD i Android Studio → Device Manager. Den tidigare lokala installationen använder `Medium_Phone_API_36.0` och SDK i `C:\Users\sharbel\AppData\Local\Android\Sdk`. Ange `http://10.0.2.2:3000` som mobilens API-adress, starta webb/API och Expo, tryck `a` för Expo Go.

`npm run android` använder en installerad egen development build. `npm run build:android` försöker kompilera native lokalt. Ett tidigare Windowsförsök stoppades av långa CMake-sökvägar; det bevisar inte ett aktuellt V4.2-byggfel eller att EAS lyckats med V4.2.

Om iPhone kör Expo Go på port 8081 kan en separat installerad Android-klient använda port 8082. Kör från `apps/mobile`:

```powershell
$env:EXPO_PUBLIC_API_URL='http://10.0.2.2:3000'
npx expo start --dev-client --host lan --port 8082 --clear
```

Variabeln gäller bara den terminalen och ändrar inte iPhones LAN-adress i miljöfilen. Använd rätt klient för `--go` respektive `--dev-client`.

## Gemensam katalog, utkast och order

`lib/api.ts` skapar API-klienten med `EXPO_PUBLIC_API_URL`. Alla produkt- och orderanrop går till samma Next.js-backend som webbplatsen. Ingen Supabase service-role, Stripe secret eller Resend-nyckel finns i mobilen.

`CateringProvider` hämtar katalogen vid start, när appen åter blir aktiv och vid drag för att uppdatera. Samtidiga kataloghämtningar delar samma anrop. Adminändringar i priser, bilder, aktivering eller leveransregler blir synliga vid nästa hämtning. Priser i gamla order påverkas inte.

Matutkast sparas i SecureStore på native och localStorage i Expo Web. Kontaktuppgifter sparas inte i utkastet. Privata orderreferenser sparas i SecureStore respektive sessionStorage, högst 20. Samma förfrågan behåller SHA-256-fingerprint och UUID för ett identiskt återförsök efter omstart. Om en äldre native-app saknar Expo Crypto används en tydligt meddelad sessionsreserv.

Demo och nätverksfel behåller tidigare matval. Endast en verifierad katalog rensar avpublicerade val. Nätverksfel stänger möjligheten att skicka en förfrågan tills katalogen kan hämtas igen. Delad formulärvalidering gäller även på servern.

## EAS-profiler och verifieringsgräns

| Profil | Appidentitet | Användning |
| --- | --- | --- |
| `development` | `se.cedarmezze.app.dev` | Intern development client; Android debug-APK |
| `ios-simulator` | `se.cedarmezze.app.dev` | Osignerad simulatorartefakt som körs på Mac |
| `preview` | `se.cedarmezze.app.preview` | Intern testapp med rätt signering |
| `production` | `se.cedarmezze.app` | Butiksbygge efter separat verifiering |

`APP_ENV` väljer identitet. `EXPO_PUBLIC_API_URL` väljer backendmiljö. Utvecklings-, staging- och produktionsappar ska peka på avsedd gemensam miljö, inte varsin databas per plattform. Inga butiksuppladdningar sker automatiskt.

För att begära nya molnbyggen kör du från `apps/mobile`:

```powershell
npx eas-cli@latest whoami
npx eas-cli@latest project:info
npx eas-cli@latest build --platform android --profile development --non-interactive --no-wait
npx eas-cli@latest build --platform ios --profile ios-simulator --non-interactive --no-wait
```

Detta är byggkommandon, inget påstående om att nya V4.2-artefakter har skapats. Kontrollera alltid källcommit, appversion, jobbets slutstatus och artefakt. Äldre V4-jobb/APK:er verifierar inte V4.2. Windows kan starta iOS-molnbyggen men kör inte Xcode/iOS Simulator. En fysisk iPhone-development build kräver Apple-behörighet, signering och registrerad enhet.

`npm run export:mobile` från roten paketerar iOS, Android och webb. Det bevisar inte ett nytt native EAS-bygge, installation, APNs/FCM eller test på fysisk telefon. Körda kontroller och kvarvarande enhetstester redovisas i [TESTER.md](TESTER.md).

## Push och betalningar

Fjärrpush kräver en installerad development-/EAS-app, fysisk enhet och företagets APNs/FCM-konfiguration. Expo Go visar kundappen men stöder inte fjärrpush. Native notismoduler laddas först när kunden väljer registrering. Kundens tokenregistrering kräver privat orderkod/token; ägarens registrering kräver verifierad webbadmin. Serverns pushflaggor är avstängda i exempelmiljön.

Checkout använder samma serverlogik som webbplatsen och öppnas i systemwebbläsaren. Återkomsten markerar inte ordern betald; servern måste verifiera betalningen. Apple Pay hör till kortbetalning på kompatibla enheter. Företagets externa betalningar och verklig pushleverans behöver egna tester enligt [BETALNINGAR.md](BETALNINGAR.md).
