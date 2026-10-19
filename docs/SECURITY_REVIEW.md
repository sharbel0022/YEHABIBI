# Säkerhetsgranskning V4.4.1

Granskad 2026-10-19 från `419fec1748db476a294da9596a116268774c5873` och dess exakta `package-lock.json`, därefter omgranskning efter ren installation på samma lås. Node `22.16.0`, npm `11.4.2`, Windows. Slutlig kodcommit och svitresultat redovisas i `READINESS_V4_4_1.md`. Inga produktionskonton, hemligheter eller produktionsdatabaser användes.

## Reproducerbar evidens och omfattning

Före- och efterrapporter finns i `docs/security/evidence/`. `manifest.json` anger bascommit, datum, låsfilernas SHA-256 och kommandon. `explain-summary.json` sammanfattar verkliga `npm explain braces node-forge decode-uri-component uuid --json`; komplett lokal råfil ligger i `.tmp/security-v4-4-1/explain-before.json`. Sammanfattningen tar bort npm:s upprepade cykler men bevarar paket, versioner och beroendekanter. Inga hemligheter finns i dessa paketrapporter.

Kör lokalt:

```powershell
npm ci --no-audit --no-fund
npm audit --json
npm audit --omit=dev --json
npm explain braces node-forge decode-uri-component uuid --json
node scripts/security-audit.mjs
node --test tests/security-audit.test.mjs
```

`npm audit` avslutar med kod 1 när sårbarheter hittas. Det är ett faktiskt fynd, inte ett misslyckat nätverksanrop. Kontrollera att JSON innehåller fullständig `metadata` och `vulnerabilities` innan resultat bedöms. `--omit=dev` skiljer inte automatiskt mobilens byggverktyg från serverdrift: Expo ligger i mobilens `dependencies` och därför finns dess CLI även i den rapporten.

## Fyra advisories och deras exponering

Före åtgärd: **30 sårbara paketposter: 19 high, 11 moderate, 0 critical** i både full och `--omit=dev`. De är fyra advisories med flera ärvda metavulnerabilities, inte 30 oberoende brister. Inget fynd i den här npm-rapporten gäller Next.js, webbens React, Supabase eller Resend. Detta är en begränsad observation om det granskade registret och låset, ingen garanti om att övrig kod saknar säkerhetsfel.

Efter kontrollerad utvärdering och ren `npm ci`: **oförändrat 30: 19 high, 11 moderate, 0 critical**. Ingen beroendeändring behölls. En uuid-override provades lokalt men npm-resolvern bevarade den gamla versionen vid låsgenerering. En explicit verifieringsinstallation med `11.1.1` gav `npm ls` → `ELSPROBLEMS` (ogiltig dependency mot Xcodes `^7.0.3`). Försöket återtogs helt; baslåset återställdes och ny `npm ci` installerade 660 paket. Detta redovisas som kvarstående risk, inte som genomförd patch. Inga tester på den tillfälliga installationen räknas som slutligt underlag.

### GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 — braces

- **Paket/version/svårighet:** `braces@3.0.3`, high enligt npm. Djupt nästlade brace-mönster kan orsaka stacköverskridning och processavbrott.
- **Väg:** `@yehabibi/mobile → expo@57.0.30 → @expo/metro → metro-file-map → micromatch@4.0.8 → braces@3.0.3` samt React Native/Metro-kedjorna. Exakta låsta platser i `audit-policy.json`.
- **Exponering:** globmönster i Metro/bygg-/utvecklingsprocess. Ingen identifierad kund-API tar emot globmönster och ingen sådan kedja importeras av webbserverns verksamhetskod. En angripare behöver få ett farligt mönster behandlat av byggverktygen, exempelvis genom obetrodd konfiguration. Bygg inte främmande konfiguration med produktionshemligheter.
- **Åtgärd:** ingen publicerad patch i npm eller advisory vid granskning. Ingen påhittad `3.0.4`, äldre osäker version eller SDK-nedgradering införs. Kör Metro endast lokalt/skyddat och håll PR-CI utan hemligheter och skrivtoken. Kvarstår även om SDK58 införs om den fortfarande tar samma beroende.
- **Ansvarig/omprövning:** repositoryts underhållsansvarig, **2026-10-26**, före publik mobil-/byggdistribution om tidigare.
- **Primärt underlag:** [upstream-rapport](https://github.com/micromatch/braces/issues/70) och [berörd kod](https://github.com/micromatch/braces/blob/3.0.3/lib/compile.js); [advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

### GHSA-86w9-cpqp-85rv / CVE-2026-85393 — node-forge

- **Paket/version/svårighet:** `node-forge@1.4.0`, high. RSA PKCS#1 v1.5-verifieringen accepterar extra nästlade DigestAlgorithm-element; utnyttjande kräver verifiering av angriparkontrollerade signaturer och en berörd RSA-nyckel.
- **Väg:** `@yehabibi/mobile → expo@57.0.30 → @expo/cli@57.0.31 → node-forge@1.4.0` och `@expo/code-signing-certificates@0.0.6 → node-forge@1.4.0`.
- **Exponering:** Expo CLI/certifikatverktyg. Yehabibis webhook-HMAC använder `node:crypto`, inte forge. Appen konfigurerar ingen egen OTA-signaturverifiering med forge. Byggkedjans kryptografiska kod finns ändå installerad och får inte betraktas som lagad. Slutlig native/OTA-signingkonfiguration har inte verifierats i något företagskonto.
- **Åtgärd:** ingen publicerad patch vid kontrollen. Omergad/upublicerad upstream-kod används inte som paketpatch. Begränsa signingåtkomst, använd betrodda konton och isolera CI; granska signingmodellen före EAS/OTA-publicering.
- **Ansvarig/omprövning:** build- och säkerhetsansvarig, **2026-10-26**, före signerad extern release om tidigare.
- **Primärt underlag:** [upstream-rapport](https://github.com/digitalbazaar/forge/issues/1149), [föreslagen upstream-fix](https://github.com/digitalbazaar/forge/pull/1152); [advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv).

### GHSA-vcc3-ghjq-m6fr / CVE-2026-45822 — decode-uri-component

- **Paket/version/svårighet:** `decode-uri-component@0.2.2`, moderate. Felaktigt procentkodad indata kan orsaka extrem CPU-belastning och låst app. Ingen dokumenterad dataläcka eller kodexekvering i denna advisory.
- **Väg:** `@yehabibi/mobile → expo-router@57.0.28 → query-string@7.1.3 → decode-uri-component@0.2.2`.
- **Exponering:** finns i mobilens navigationskod. Expo Routers React Navigation-parser anropar `query-string.parse` på URL-query. Därför är en manipulerad extern deep link en relevant risk för tillgänglighet, även om inga returparametrar får markera en order betald. Detta är ett kvarstående mobilfynd; det göms inte som enbart CI-risk.
- **Åtgärd:** `0.5.0` är patchad men har ESM-export. `query-string@7.1.3` använder CommonJS `require` som en direkt funktionsreferens och deklarerar `^0.2.2`; ett direkt override till `0.5.0` är därför inte en verifierat kompatibel patch. Den senast kontrollerade SDK57-routern är redan `57.0.28` och använder samma beroende. Ingen stor SDK-uppgradering gjordes utan godkännande. Publik mobilrelease väntar på lösning och fysiska regressionstester.
- **Ansvarig/omprövning:** mobilansvarig, **2026-10-26**. Expo SDK58-migration behöver separat godkännande och verifiering enligt planen nedan.
- **Primärt underlag:** [maintainerns advisory](https://github.com/SamVerschueren/decode-uri-component/security/advisories/GHSA-vcc3-ghjq-m6fr), [patchrelease 0.5.0](https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.0). Registryadvisory anger även `0.4.2` som berörd; ingen uppgradering till den versionen räknas som lösning.

### GHSA-w5hq-g745-h8pq / CVE-2026-41907 — uuid

- **Paket före:** `uuid@7.0.3`, moderate. `v3/v5/v6` kan skriva partiellt utanför anroparens avsedda bufferintervall utan förväntat fel. Advisory anger uttryckligen att `v4` har gränskontroll.
- **Väg:** `@yehabibi/mobile → expo/config-plugins → xcode@3.0.1 → uuid@7.0.3`.
- **Exponering:** Xcode-projektgenerering i byggkedjan. `xcode/lib/pbxProject.js` använder endast `uuid.v4()` utan egen buffer. Den sårbara funktionen har inte identifierats i den vägen. Ingen webbserver- eller kundbetalningsfunktion använder detta paket.
- **Åtgärd/återstående risk:** `11.1.1` erbjuder CJS `require` och patch, men det lokala försöket gav ingen ren, resolvergodkänd dependencyuppsättning i aktuell npm/workspacekedja. Override och tillfällig låsändring återtogs; `7.0.3` kvarstår med oförändrat baslås. Ingen vunnen säkerhetsnivå påstås. Använd inte nya UUID-buffer-API i Xcode-kedjan; granska upstream xcode-fix eller Expo-konfigurationskedja i separat kompatibilitetsändring.
- **Ansvarig/omprövning:** build- och säkerhetsansvarig, **2026-10-26**, före signerad native release om tidigare.
- **Primärt underlag:** [maintainerns advisory](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq), [11.1.1-release](https://github.com/uuidjs/uuid/releases/tag/v11.1.1). Övriga upplistade paket är ärvda kedjor, se evidens och policy.

## Tydlig gräns mellan server, mobil och CI

| Miljö | Faktisk riskbedömning | Begränsning/återstående bevis |
|---|---|---|
| Next.js webbserver | Inget av de fyra identifierade root-paketen importeras av serververksamheten. HMAC är `node:crypto`. | Hostingen ska paketera webbens runtime och inte starta Expo CLI. Håll webb och syntetiska testmiljöer åtskilda; slutlig hosting är inte ansluten här. |
| Mobilbundle | decode-uri-component används av navigationskedjan; manipulerad URL kan låsa klienten. | Kräver kompatibel routerlösning/SDK-migration samt fysisk testning. En export är inget säkerhetsgodkännande för release. |
| Utveckling/build/CI | braces och node-forge finns i Expo-verktygen, uuid finns i Xcode-genereringen men den identifierade användningen är ej berörd v4. | Inga produktionshemligheter i PR-jobb, checkout utan kvarlämnade credentials, begränsade permissions; ingen publik Metro/tunnel. |

`npm audit fix --force` och `--legacy-peer-deps` användes inte. npm föreslog bland annat Expo44/React Native0.72 och tidigare splash-versioner; dessa automatiska förslag är inkompatibla SDK-nedgraderingar och är inte godkända säkerhetslösningar.

## CI-kontroll med synliga undantag

`node scripts/security-audit.mjs` kör full audit och produktionsaudit på varje CI-körning. Den höjer ingen svårighetströskel. Alla nya advisories, paketplatser, låsta versioner, ändrad svårighet och ofullständiga/felande registryrapporter stoppar kontrollen. Endast fyra uttryckliga advisoryposter i `docs/security/audit-policy.json` får passera till och med **2026-10-26**; varje advisory har ägare och orsak. Förnyelse kräver ny granskning och kodgranskad policyändring, inte automatisk framflyttning. Risker som har försvunnit får passera och tas därefter bort ur policyn.

CI visar alla antal och arkiverar audit-JSON sju dagar. Källarkivet innehåller enbart `git archive HEAD`, inte `.env`, `.tmp` eller installerade hemligheter. Workflow använder `contents: read`, inga produktionshemligheter och `persist-credentials: false`. PostgREST-verktyget är versionslåst och dess SHA-256 verifieras före exekvering. Actionreferenser är huvudversionstaggar och runner är `ubuntu-latest`; fullständig image-/action-SHA-låsning återstår som separat supply-chain-förbättring (underhållsansvarig, omprövning 2026-10-26).

Meningsfulla tester av kontrollen bevisar att kända exakta vägar godtas och att nya advisories, critical-eskalering, ändrad plats/version, passerat datum och registryfel avvisas.

## Applikationssäkerhet

| Område | Verifierad kodgräns | Återstående ansvar |
|---|---|---|
| Admin och roller | Samtliga granskade admin-API kräver `requireAdmin`; serverns `getUser()` + bekräftad e-post + serverstyrd `ADMIN_EMAILS`. Ingen behörighet från användarredigerbar `user_metadata`. Skrivanrop kontrollerar origin. | Modellen är en adminallowlist; separata personal-/ekonomirole finns inte. Använd få företagsägda konton och MFA; faktisk Auth/MFA-konfiguration är extern och inte verifierad (driftansvarig, 2026-10-26). |
| RLS och RPC | Privata order-, betalnings-, reservations- och notifieringstabeller har RLS och återkallade `public/anon/authenticated`-grants; interna RPC är endast `service_role`. Jobbmigrationen `20261019112900_durable_readiness_jobs_v441.sql` ger samma gräns för `background_jobs` och `payment_event_inbox` samt uttryckliga RPC-ACL. | Service role kringgår RLS och får bara finnas på servern. Deployade projekts faktiska grants/schema är inte granskade här; DB-testernas slutresultat redovisas av huvudprotokollet. |
| Privata ordertoken | HMAC-SHA256 med minst 32 teckens hemlighet, hash i DB och konstanttidsjämförelse; orderkod/token-format kontrolleras före läsning. Order-URL är en åtkomstnyckel. Native referenser sparas i SecureStore, webb i sessionStorage. `no-store`, `no-referrer` och noindex på order/status. | Ingress/CDN måste maskera `token`-query. Länktoken saknar individuell rotation/utgång; hemlighetsrotation kan bryta gamla länkar. Planera bevarande och incidentåterkallning (driftansvarig, 2026-10-26). |
| Webhook och jobb | HMAC/autentisering kontrolleras serverledes; betalningsadaptern använder fasta officiella API-origins och inga råa leverantörsfelkroppar i logg. Jobb kräver separat serverhemlighet, aldrig anon-nyckel. Inbox/lease verifieras av nya automatiska tester. | Extern webhookregistrering, tjänstnycklar, scheduler och heartbeat behöver företagets godkända miljö. |
| Kundretur | Ingen mobil URL-query sätter `paid`; återgång/fokus läser serverns status med ordertoken. Checkout öppnas i systemets browser/appflöde. | Riktigt appbyte/Swish/wallet är blockerat enligt enhetsmatrisen. |
| Wallet/metodval | Mobilens tre betalningsskärmar använder en gemensam hjälpfunktion. Den antar ingen Apple Pay-/Google Pay-förmåga från OS; bara verifierad simulator visar simulerade wallets. Direktmetoder kräver separat `direct_payment_methods` från servern. | Riktiga wallets väntar på vald leverantör och verifierad kapabilitetskontroll. Backend måste alltid kontrollera konto, metod, belopp och flöde även om en manipulerad klient skickar något annat. |
| Externa notifieringar | `NOTIFICATIONS_ENABLED=false` är avsedd avstängd huvudspärr tills tjänst, kanal och mottagare är godkända. Lokal testtransport fångar syntetisk e-post/push. Leverans är ingen mänsklig kvittering. | Företaget väljer tjänst/mottagare/kostnad; leverantörens idempotensfönster begränsar säkra automatiska återförsök. Ingen exactly-once-garanti. |
| Produktionsartefakt | Simulator och testadmin tillförs endast i ignorerad lokal overlay. Befintlig `test:web` skannar `.next/server` efter simulatorimplementation/testhemlighetsmarkörer och kräver 404 på testvägar även med avsiktliga testflaggor. | Slutlig produktionsbuild och `test:web` ska passera på samma kod; separat Sites/EAS-publicering är inte utförd genom Git-push. |

## Loggar, åtkomst och retention

Råa privata orderlänkar, checkout-sessioner, push-token, webhookkroppar och credentials får inte loggas eller kopieras till GitHub-artefakter. Testtransporten maskerar privata nyckelfält och fångar enbart syntetiska meddelanden. Leverantörsanrop kastar fasta felmeddelanden i stället för råa responskroppar.

Föreslagen driftpolicy, **ännu inte företagsgodkänd eller aktiverad i extern hosting**: operativa jobb-/webhookfel med händelse-ID, klass och tid i 30 dagar med åtkomst enbart för driftansvariga; syntetiska lokala `.tmp`-bevis raderas efter avslutad felsökning; CI-audit sju dagar och källarkiv tre dagar enligt workflow. Affärs-/bokföringshändelser och persondata kräver separat fastställd retention och rättighetsmodell. Inför inte automatisk radering av betalningshistorik med denna mall. Ansvarig: företagets data-/driftansvarig, beslut före extern testdrift, omprövning 2026-10-26.

## Separat migrationsplan för mobilens kvarstående risk

1. Företag/repositoryägare godkänner en separat Expo SDK57 → SDK58-migration och signerade testbyggen. Det är ännu inte godkänt eller utfört här.
2. Verifiera aktuella [Expo-upgraderåd](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/) och release notes. Lås en kompatibel uppsättning Expo, Router, React Native, Reanimated/Worklets och native moduler i separat gren.
3. Bekräfta att routerkedjan faktiskt använder patchad decoder; SDK58-etiketten i sig är inget bevis. Kör ny audit och granska kvarstående braces/forge separat.
4. Kör rena installationer, doctor, typecheck, alla webb-/domän-/DB-sviter och mobil export. Verifiera särskilt URL-parsning av svenska tecken, query-arrayer, returlänkar och felaktig procentkodning utan att skapa offentliga exploitlänkar.
5. Skapa uttryckligen godkända native testbyggen och genomför hela `PHYSICAL_DEVICE_TESTS.md`. Ta bort beroendeundantag först när audit visar att de faktiskt försvunnit.
