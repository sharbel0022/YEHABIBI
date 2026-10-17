# Publicering – V4.2

V4.2 innehåller EAS-profiler och en webbackend. Företagets konton, innehåll och externa betalningsflöden måste verifieras före aktivering. Ingen automatisk butiksuppladdning sker. Användarens beslut 2026-10-17: använd endast isolerad lokal testdatabas; använd inte det inaktiva Supabase-projektet eller Stripe-miljön Quick match.

Aktuell appkälla använder SDK 57 för iPhone/Expo Go. Skapa och verifiera nya SDK 57-artefakter för egna development-/butiksbyggen; de tidigare färdiga SDK 58-byggena är historiska testresultat.

## Separera miljöerna

| Miljö | App | Backend och betalningar |
| --- | --- | --- |
| Utveckling | `development`, `.dev` | Lokal server/testdatabas, Stripe testnycklar |
| Test | `preview`, `.preview` | Egen HTTPS-testserver och testdatabas, Stripe sandbox |
| Produktion | `production`, utan suffix | Företagets HTTPS-server, produktionsdatabas och godkända livekonton |

Profilerna skiljer apparnas identitet men skapar inte databaser eller backend-servrar automatiskt. Ange olika `EXPO_PUBLIC_API_URL` för EAS-miljöerna. Servern får sin egen konfiguration från hostingen. Lägg aldrig riktiga kunduppgifter i testdata.

`EXPO_PUBLIC_` och `NEXT_PUBLIC_` betyder att värdet kan hamna i klientkoden. Supabase service-role, Stripe secret, webhookhemlighet, Resend och orderhemligheter är **endast servervariabler**. Mobilen behöver ingen Supabase-servernyckel. Utgå från `apps/web/.env.example` och `apps/mobile/.env.example`.

## Webb och backend

1. Koppla rätt företag, domän, kontaktuppgifter, hämtadress och officiella Google-/sociala länkar. Ersätt demobilder med ägarens material och fyll i godkända priser/allergener.
2. Skapa separata Supabase-miljöer och kör SQL-migrationerna i ordning enligt [DATABAS.md](DATABAS.md). Bjud in ägaren i Supabase Auth, ange `ADMIN_EMAILS` och rätt `/auth/callback`-redirect.
3. Välj hosting med Next.js-serverstöd. Rotens `npm run build` bygger workspace `@yehabibi/web`. Statiska Expo-filer ersätter inte API-servern.
4. Ange `NEXT_PUBLIC_SITE_URL` till webbens riktiga HTTPS-domän. Appens API-adress ska nå samma backend. Ordermejl och QR använder webbadressen, aldrig emulatorns `10.0.2.2`.
5. Konfigurera företagsägd Stripe sandbox, verifierad Resend-avsändare och två olika orderhemligheter på minst 32 tecken. Håll `ORDERS_ENABLED=false` och `PAYMENTS_ENABLED=false` publikt tills innehåll och hela orderflödet verifierats. En separat godkänd testmiljö sätter betalspärren till true med testnyckel. Livebetalningar har dessutom `STRIPE_LIVE_ENABLED` som ska förbli false.
6. Lägg till Stripe-webhook på `/api/stripe/webhook`: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`. Lägg in dess egen signeringshemlighet.
7. Verifiera testkort, Swish om kontot stöder det, eventuell Apple Pay på stödd fysisk enhet, kontantflöde och återbetalning. Gå till livekonfiguration först efter godkänt testflöde.

Swish går genom hosted Checkout i SEK. Kontrollera faktisk kontotillgång och sätt först därefter `STRIPE_SWISH_ENABLED=true`. Apple Pay i Checkout visas när plattformen stöder det. Se [Stripes guide](https://docs.stripe.com/payments/swish/accept-a-payment?payment-ui=checkout).

## Befintliga ChatGPT Sites

[Yehabibi](https://yehabibi.asdasdsa213.chatgpt.site) behåller projektet `appgprj_6ace628740b88191ab7cae7e9704a5f2` och publik åtkomst. Webbens `src`/`public` samt `packages/shared` och `packages/api-client` synkroniseras från granskad main till det befintliga Vinext/Worker-bygglagret. Källkod, kontroller och arkiv sparas före native Sites-publicering. Inga `.env`, kunddata, mobilbyggen eller lokala testkluster följer med.

Workers använder Supabases HTTPS-API, inte en rå PostgreSQL-anslutning. Samma säkra serverrutter kan köras där; ingen databas eller betalning ersätts av en frontendbekräftelse. Sites har för närvarande inga företagsnycklar. Därför behålls båda spärrarna false. Om företagets framtida backend ligger separat ska Expo och webben peka mot samma verifierade HTTPS-API med uttrycklig CORS-konfiguration.

### Reproducerbar synkronisering efter grön main

Öppna först befintliga Site med Sites-pluginets source-helper och dess kortlivade skrivbehörighet. Därefter kan du köra från GitHub-repots rot:

```powershell
git fetch origin
node scripts/sync-sites.mjs C:/Users/sharbel/Downloads/YEHABIBI/.tmp/sites-yehabibi origin/main
```

Skriptet läser enbart versionshanterad Git-källa och kräver att källcommit finns på origin/main. Det bevarar Site-identiteten och dess Vinext/Worker-bygglager, anpassar testernas importsökvägar och gör shared/API-klienten till lokala workspaces. Inga hemligheter, .env-filer, mobilbyggen eller testdatabaser kopieras. Enbart .env.example får följa med.

Kör Sites-pluginets beroendeinstallation när package.json/lock ändrats. Kör syntax, typer och tester, bygg via pluginets build-site.mjs och paketera med site-workflow.mjs. Publicera det arkiv och den commit som hjälpen returnerar med save_site_version följt av deploy_site_version för nuvarande publika åtkomst. Kontrollera terminal deploymentstatus; en sparad version eller Git-push räknas inte som verifierad publicering. Slutlig main-SHA, CI-länkar och faktiskt Site-versionsnummer redovisas i leveransen efter de avslutade operationerna.

Katalogen har ingen separat Sites-menylista. Next.js, Expo och Sites använder samma shared-katalog i demo och samma serverkontrakt i en konfigurerad miljö. Utveckling, staging och produktion ska ha en gemensam Supabase-instans per miljö. Inga produktionsdatabaser har aktiverats här.

### Konfigurera företagets testmiljö

| Tjänst | Behövs på servern och i företagets konto |
| --- | --- |
| Supabase | Identifierat aktivt projekt, fem migrationer i ordning, `NEXT_PUBLIC_SUPABASE_URL`, publik anon-nyckel och serverns `SUPABASE_SERVICE_ROLE_KEY`; bjud in/bekräfta admin och ange `ADMIN_EMAILS`. Testa Storage-uppladdning och Auth-callback på rätt domän. |
| Katalog | Admin publicerar verkliga priser i öre, portionsstorlekar, rekommenderade mängder, allergener, bilder, paket, minimum och aktiva leveranszoner. Testpriser från specifikationen används inte publikt. |
| Order | Två olika slumpade hemligheter på minst 32 tecken: `ORDER_LINK_SECRET`, `ORDER_RATE_LIMIT_SECRET`. Granska villkor och kontakt. Aktivera `ORDERS_ENABLED` endast i verifierad testmiljö först. |
| Stripe | Företagsägd sandbox/testnyckel, `STRIPE_WEBHOOK_SECRET` för rätt URL och händelserna ovan. `PAYMENTS_ENABLED=true` bara i testmiljön. Verifiera kontoåtkomst till Swish före dess flagga; Apple Pay provas på kompatibel enhet. Liveflaggan förblir false. |
| Resend | `RESEND_API_KEY`, verifierad avsändare i `EMAIL_FROM`, rätt `OWNER_NOTIFICATION_EMAIL` och företagets godkända testmottagare. Verifiera faktisk leverans och återförsök, inte bara ett lyckat API-svar. |
| Expo | `EXPO_PUBLIC_API_URL` till samma HTTPS-testbackend. Enbart API-adressen är publik; inga servernycklar i appen. Push kräver företagets FCM/APNs och fysisk installerad app. |

När företagets externa testflöde är godkänt behövs ett separat uttryckligt beslut före skarpa order/betalningar. Den lokala verifieringen ersätter inte detta.

## Android och iOS via EAS

EAS-projektet är kopplat till `sharbel1423` med verifierat `project:info`; detaljer finns i [EXPO.md](EXPO.md). Bekräfta företagets framtida kontoägarskap och att `se.cedarmezze.app` är en lämplig och tillgänglig produktionsidentitet. Samma identifierare ska sedan användas i appkonfiguration, signering och butik.

Från `apps/mobile`, med produktionsmiljön inställd i EAS:

```powershell
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
```

Androids produktionsbygge ger en butiksartefakt; intern testning använder `preview`-profilens APK. iOS byggs i EAS moln från Windows och kräver rätt Apple Developer-behörighet och signering. Företaget ska äga Play Console-/App Store Connect-posterna och signeringsuppgifterna. Följ [EAS Build](https://docs.expo.dev/build/setup/).

När byggartefakterna verifierats behövs följande i butikerna:

- Godkända appnamn, ikon, skärmbilder, beskrivning och supportkontakt.
- Publik integritetspolicy och korrekta uppgifter om datainsamling.
- Rätt utvecklarkonton, appidentifierare, signering och åtkomst till butikerna.
- Testinstallation via Play-testspår respektive TestFlight och fysiska enheter.
- Granskad pris-/allergeninformation, beställningsvillkor och betalningsrutiner.

EAS Submit kan användas separat när företaget beslutat att ladda upp den verifierade versionen:

```powershell
npx eas-cli@latest submit --platform android --profile production
npx eas-cli@latest submit --platform ios --profile production
```

Kontrollera först vilken build som väljs. Kommandona är instruktioner, inte rapporterade publiceringar. Se [Android-submit](https://docs.expo.dev/submit/android/) och [iOS-submit](https://docs.expo.dev/submit/ios/).

## Google, QR och lansering

Behåll `NEXT_PUBLIC_INDEXABLE=false` tills företagsuppgifter, domän, metadata och publika sidor är klara. Aktivera sedan indexering, verifiera domänen i Search Console och skicka `/sitemap.xml`. Admin, API och privata ordersidor ska fortsatt vara utanför indexering.

Kontrollera att företagets Google Business Profile och Maps-länk är riktiga. Lägg bara in den officiella recensionslänken. Skanna `/api/qr/bestall` och `/api/qr/google` från en annan enhet. Koderna ska nå den publicerade webben respektive företagets riktiga recensionssida. SEO kan förbättra synlighet men kan inte garantera ranking, betyg eller recensioner.

Ägaren behöver också godkänna moms, avbokning, integritet, allergener och kontant-/kassahantering. Äldre [LANSERING.md](LANSERING.md) finns kvar som kompletterande ägarlista. Kör sista kontrollen i [TESTER.md](TESTER.md) före lansering.
