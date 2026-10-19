# V4.4.1 – verifieringsprotokoll 2026-10-19

Bas: `419fec1748db476a294da9596a116268774c5873`. Slutlig funktionell källa: **c0d145260f904c584cde67940cd08264192d3b10**. Efterföljande rapportcommit ändrar bara dokumentation. PR: [#10](https://github.com/sharbel0022/YEHABIBI/pull/10), [CI för funktionell källa](https://github.com/sharbel0022/YEHABIBI/actions/runs/39247041632), [aktuella main-körningar](https://github.com/sharbel0022/YEHABIBI/actions?query=branch%3Amain). Länkarnas faktiska status avgör merge/CI; denna rapport påstår inte att push installerat databas, scheduler eller appbuild. Sites verifieras separat vid publicering och redovisas i leveranssvaret.

## Faktiska lokala resultat

| Kommando/prov | Resultat |
| --- | --- |
| `npm ci --no-audit --no-fund` | PASS, ren installation, 660 paket; exakt lås bevarat |
| `npm run syntax` | PASS |
| `npm test` | PASS **173/173**, inga hoppade eller kvarstående fel |
| `npm run typecheck` | PASS webb, mobil och api-client |
| `npm run build` | PASS Next.js-produktionsbygge |
| `npm run test:web` | PASS 10 sidor, 11 serverrenderade rätter, avstängda köp och inga testvägar/simulatorhemligheter i produktionsartefakten |
| `npm run export:mobile` | PASS Android/iOS/webb-export; fysisk körning och EAS är separata bevis |
| `npm run test:integration` | PASS riktig PostgreSQL18.3, PostgREST16.4 och Next HTTP: 11 order, 66 syntetiska mejlleveranser; externa tjänster=false |
| `npm run test:mode` | PASS 25 kontroller, 11 syntetiska order; verklig lokal databas och privat simulator |
| `npm run test:direct` | PASS 9 kontroller: fyra simulerade metoder, pris/leverans, återförsök, sista kapacitet under samtidiga riktiga PostgreSQL-anrop och cateringregression |
| `npm run test:background` | PASS separat verkligt schemalagd process utan webbläsare: kökspåminnelse, återtagning efter en övergiven femsekunderslease, samtidiga tick, autentiserad hälsa och bevarad order |
| `node scripts/security-audit.mjs` | PASS enbart mot dokumenterad exakt riskpolicy; audit är fortfarande 30 paketposter, 19 high/11 moderate, fyra advisories |
| Oberoende granskning | Två separata genomgångar av DB/betalning respektive autentisering/worker/notifiering. Alla identifierade P1/P2 rättade och riktade prov passerade |

Lokala loggar: `.tmp/v441-unit-final.log`, `v441-types-final.log`, `v441-build-final.log`, `v441-web-final.log`, `v441-mobile-final.log`, `v441-integration.log`, `v441-mode-final.log`, `v441-direct.log`, `v441-background.log`. De är lokala felsökningsfiler och publiceras inte. Versionshanterade auditrapporter och exakta lås-hashar finns i `docs/security/evidence/`.

## Acceptans A–L

| Krav | Faktiskt bevis |
| --- | --- |
| A. Kökslarm utan webbtrafik | SQL-test med styrbar tid + verklig separat worker/process utan öppnade webbläsare |
| B. Samtidiga workers | SQL claim/fence-test + parallella autentiserade HTTP-tick; stabil unik larmnyckel |
| C. Kraschåterhämtning | Utgången lease återtas; gammal token nekas. Integration överger en riktig femsekunderslease och får attempts=2/completed med order kvar |
| D. Långsamt mejl blockerar inte webhook | Webhook-HTTP-hjälparen väntar bara på beständig lagring; oavslutad separat mailpromise hindrar inte ACK |
| E. Fel signatur/konto/miljö/belopp | Kryptografiska tester, HTTP och DB: ogiltig auth/capture avvisas; giltig partiell refund/chargeback sparas som finansiell avvikelse |
| F. Saknad webhook | Avstämning ger väntande/manuell kontroll, utan debit-anrop eller osäker kapacitetsfrigöring |
| G. Sessionsresultat | Hosted Checkout-markering ger manuell avstämning och exakt noll statuspoll-anrop |
| H. Sen betalning | SQL-regression bevarar annan kunds reservation; verifierade pengar sparas och kapacitetsavvikelse skapas |
| I. Nybetalningsspärr | Nekad nyutfärdning men säkra gamla verifieringsanrop och event fortsätter |
| J. Köks-/jobbhälsa | Saknad/för gammal watchdog och otillgänglig mottagning blockerar ny direktkapacitet när regeln är aktiverad |
| K. Gammalt event efter avvikelse | Chargeback/refund-karantän överlever återlevererad äldre betalning |
| L. Produktionsgräns | Next-produktionssmoke skannar byggda serverfiler, försöker testvägar och kräver 404 även med avsiktliga testflaggor |

## Fel som upptäcktes och rättades

Första DB-körningen blottlade ett CRLF-känsligt migrationsutbyte; normaliseringen rättades och hela kedjan passerar. En provad uuid-override var inte reproducerbart kompatibel och återtogs; ingen felaktig patch påstås. En tidig enhetstestkörning överlappade installation och tappade PGlite-datafilen; ren omkörning efter avslutad installation ger 173/173. TypeScript hittade fel ordning på `abortSignal`/`single`; rättat före slutbygge.

PostgREST avslutades ibland med Windows exit3 före readiness. GDB spårade aborten till PostgreSQL18/libintl/gettext under ärvd `C.UTF-8`; isolerade Windowsbarn får nu `LANG=C`, `LC_ALL=C` och regressionstest. Databasen är fortfarande UTF-8 och affärstid Europe/Stockholm. Riktig start/stopp och integrationsprov passerade efter rättningen.

Gamla integrationsantaganden om omedelbar refund och omedelbara notifieringsåterförsök ändrades till att vänta på den beständiga kön. Runtime-backoff togs inte bort. Granskningen rättade reservkanal vid primärfel, partiella finansiella avvikelser, lösta kökslarm, tidszonsoberoende dedupnycklar och pushens totala tidsbudget. Inga kvarstående misslyckade lokala sviter redovisas som godkända.

## Blockerat och inte genomfört

Fysisk iPhone Safari/installerad app och Android Chrome/installerad app: **blockerat**; modeller/OS/build och skyddad godkänd anslutning saknas. Inget nytt emulatorprov eller nytt EAS-bygge påstås. Leverantörssandbox, Swish-/wallet-/kort-appbyte och extern push/e-postleverans är **blockerade**; ingen riktig småbetalning gjordes. Supabase-advisors lokalt kunde inte ansluta till54322 eftersom ingen Supabase-stack kör där; PGlite/ren PostgreSQL ersätter inte företagets rådgivningskontroll. Ingen fjärrmigration, hosting-scheduler, extern heartbeat eller produktionsdataändring har genomförts. Kökskalibrering har mall men saknar mätningar och godkännande.

## Exakta Windows-kommandon

```powershell
Set-Location 'C:\Users\sharbel\Downloads\YEHABIBI'
npm ci
npm run syntax
npm test
npm run typecheck
npm run build
npm run export:mobile
npm run test:web
npm run test:integration
npm run test:mode
npm run test:direct
npm run test:background
node scripts/security-audit.mjs
# Lokal isolerad webb + PostgreSQL + separat worker:
npm run test:server
# I en annan terminal för att stoppa just testsessionen:
npm run test:server -- --stop
```

Integration kräver PostgreSQLverktyg i `C:/Program Files/PostgreSQL/18/bin` och PostgREST16.4 i `.tmp/v41-tools/postgrest.exe`, eller uttryckligen `PG_BIN`/`POSTGREST_BIN`. Använd bara granskade verktyg och syntetiska data. För worker i godkänd hostmiljö: se BACKGROUND_JOBS.md; hemlighet laddas från säkert lager, aldrig från ett kommando i denna rapport.
