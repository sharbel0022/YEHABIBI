# Fil för fil – V4.4.1

Jämförelse mot verifierad main `419fec1748db476a294da9596a116268774c5873`. Befintliga arbetsytor och versionsnummer behålls; V4.4.1 är driftberedskapsändringen. `package-lock.json` är oförändrad efter att en icke reproducerbar override återtagits.

| Fil | Ändring |
| --- | --- |
| [.github/workflows/check.yml](../.github/workflows/check.yml) | Behåller alla sviter; audit-evidens, läsrättigheter och schemalagd integrationskontroll. |
| [README.md](../README.md) | Länkar till aktuell driftberedskap och bibehåller befintlig arkitektur. |
| [apps/mobile/app/bestall.tsx](../apps/mobile/app/bestall.tsx) | Återanvänder servergodkända betalningsmetoder; operativsystem räknas inte som walletbevis. |
| [apps/mobile/app/direkt.tsx](../apps/mobile/app/direkt.tsx) | Återanvänder servergodkända betalningsmetoder; operativsystem räknas inte som walletbevis. |
| [apps/mobile/app/ordrar.tsx](../apps/mobile/app/ordrar.tsx) | Återanvänder servergodkända betalningsmetoder; operativsystem räknas inte som walletbevis. |
| [apps/mobile/lib/payment-methods.ts](../apps/mobile/lib/payment-methods.ts) | Skiljer nyutfärdning från gammal verifiering och cateringlänk från direktkassa; bevarar kontomiljö. |
| [apps/web/.env.example](../apps/web/.env.example) | Endast platshållare, avstängda betalnings-/notifieringsspärrar och egen jobbhemlighet. |
| [apps/web/src/app/api/admin/jobs/route.ts](../apps/web/src/app/api/admin/jobs/route.ts) | Gemensamt autentiserat jobbgränssnitt, driftregler eller övervakad process utan webbtrafik. |
| [apps/web/src/app/api/availability/route.ts](../apps/web/src/app/api/availability/route.ts) | Rätt metodlista och spärr för direktköp; kontant hämtning behålls. |
| [apps/web/src/app/api/internal/jobs/route.ts](../apps/web/src/app/api/internal/jobs/route.ts) | Gemensamt autentiserat jobbgränssnitt, driftregler eller övervakad process utan webbtrafik. |
| [apps/web/src/app/api/orders/direct/route.ts](../apps/web/src/app/api/orders/direct/route.ts) | Rätt metodlista och spärr för direktköp; kontant hämtning behålls. |
| [apps/web/src/app/api/payments/status/route.ts](../apps/web/src/app/api/payments/status/route.ts) | Skiljer nyutfärdning från gammal verifiering och cateringlänk från direktkassa; bevarar kontomiljö. |
| [apps/web/src/app/api/payments/webhook/route.ts](../apps/web/src/app/api/payments/webhook/route.ts) | Skiljer nyutfärdning från gammal verifiering och cateringlänk från direktkassa; bevarar kontomiljö. |
| [apps/web/src/components/DirectOrderForm.tsx](../apps/web/src/components/DirectOrderForm.tsx) | Rätt metodlista och spärr för direktköp; kontant hämtning behålls. |
| [apps/web/src/lib/data.ts](../apps/web/src/lib/data.ts) | Rätt metodlista och spärr för direktköp; kontant hämtning behålls. |
| [apps/web/src/lib/jobs/policy.ts](../apps/web/src/lib/jobs/policy.ts) | Gemensamt autentiserat jobbgränssnitt, driftregler eller övervakad process utan webbtrafik. |
| [apps/web/src/lib/jobs/runtime.ts](../apps/web/src/lib/jobs/runtime.ts) | Gemensamt autentiserat jobbgränssnitt, driftregler eller övervakad process utan webbtrafik. |
| [apps/web/src/lib/mailer.ts](../apps/web/src/lib/mailer.ts) | Lease-skyddad outbox, mottagarprogress, timeout/Retry-After, reservkanal och idempotensfönster. |
| [apps/web/src/lib/payments.ts](../apps/web/src/lib/payments.ts) | Skiljer nyutfärdning från gammal verifiering och cateringlänk från direktkassa; bevarar kontomiljö. |
| [apps/web/src/lib/payments/inbox.ts](../apps/web/src/lib/payments/inbox.ts) | Skiljer nyutfärdning från gammal verifiering och cateringlänk från direktkassa; bevarar kontomiljö. |
| [apps/web/src/lib/payments/provider.ts](../apps/web/src/lib/payments/provider.ts) | Skiljer nyutfärdning från gammal verifiering och cateringlänk från direktkassa; bevarar kontomiljö. |
| [apps/web/src/lib/payments/providers/adyen.ts](../apps/web/src/lib/payments/providers/adyen.ts) | Skiljer nyutfärdning från gammal verifiering och cateringlänk från direktkassa; bevarar kontomiljö. |
| [apps/web/src/lib/payments/runtime.ts](../apps/web/src/lib/payments/runtime.ts) | Skiljer nyutfärdning från gammal verifiering och cateringlänk från direktkassa; bevarar kontomiljö. |
| [apps/web/src/lib/payments/service.ts](../apps/web/src/lib/payments/service.ts) | Skiljer nyutfärdning från gammal verifiering och cateringlänk från direktkassa; bevarar kontomiljö. |
| [apps/web/src/lib/push.ts](../apps/web/src/lib/push.ts) | Godkännandespärr, begränsade parallella uppslag/kvittouppdateringar och gemensam tidsbudget. |
| [apps/web/src/lib/supabase.ts](../apps/web/src/lib/supabase.ts) | Tidsbegränsade serveranrop med möjlighet till gemensam avbrottssignal. |
| [docs/BACKGROUND_JOBS.md](../docs/BACKGROUND_JOBS.md) | Drift-/företags-/test-/säkerhetsunderlag; externa begränsningar redovisas uttryckligen. |
| [docs/BETALNINGAR.md](../docs/BETALNINGAR.md) | Drift-/företags-/test-/säkerhetsunderlag; externa begränsningar redovisas uttryckligen. |
| [docs/DATABAS.md](../docs/DATABAS.md) | Drift-/företags-/test-/säkerhetsunderlag; externa begränsningar redovisas uttryckligen. |
| [docs/FIL_FOR_FIL.md](../docs/FIL_FOR_FIL.md) | Drift-/företags-/test-/säkerhetsunderlag; externa begränsningar redovisas uttryckligen. |
| [docs/KITCHEN_CALIBRATION.md](../docs/KITCHEN_CALIBRATION.md) | Drift-/företags-/test-/säkerhetsunderlag; externa begränsningar redovisas uttryckligen. |
| [docs/KITCHEN_MEASUREMENTS.csv](../docs/KITCHEN_MEASUREMENTS.csv) | Drift-/företags-/test-/säkerhetsunderlag; externa begränsningar redovisas uttryckligen. |
| [docs/MERCHANT_SETUP.md](../docs/MERCHANT_SETUP.md) | Drift-/företags-/test-/säkerhetsunderlag; externa begränsningar redovisas uttryckligen. |
| [docs/PAYMENT_PROVIDER_DECISION.md](../docs/PAYMENT_PROVIDER_DECISION.md) | Drift-/företags-/test-/säkerhetsunderlag; externa begränsningar redovisas uttryckligen. |
| [docs/PAYMENT_RECONCILIATION.md](../docs/PAYMENT_RECONCILIATION.md) | Drift-/företags-/test-/säkerhetsunderlag; externa begränsningar redovisas uttryckligen. |
| [docs/PHYSICAL_DEVICE_TESTS.md](../docs/PHYSICAL_DEVICE_TESTS.md) | Drift-/företags-/test-/säkerhetsunderlag; externa begränsningar redovisas uttryckligen. |
| [docs/READINESS_V4_4_1.md](../docs/READINESS_V4_4_1.md) | Drift-/företags-/test-/säkerhetsunderlag; externa begränsningar redovisas uttryckligen. |
| [docs/SECURITY_REVIEW.md](../docs/SECURITY_REVIEW.md) | Drift-/företags-/test-/säkerhetsunderlag; externa begränsningar redovisas uttryckligen. |
| [docs/security/audit-policy.json](../docs/security/audit-policy.json) | Drift-/företags-/test-/säkerhetsunderlag; externa begränsningar redovisas uttryckligen. |
| [docs/security/evidence/after-all.json](../docs/security/evidence/after-all.json) | Reproducerbar audit-/beroendeevidens utan hemligheter. |
| [docs/security/evidence/after-production.json](../docs/security/evidence/after-production.json) | Reproducerbar audit-/beroendeevidens utan hemligheter. |
| [docs/security/evidence/before-all.json](../docs/security/evidence/before-all.json) | Reproducerbar audit-/beroendeevidens utan hemligheter. |
| [docs/security/evidence/before-production.json](../docs/security/evidence/before-production.json) | Reproducerbar audit-/beroendeevidens utan hemligheter. |
| [docs/security/evidence/explain-summary.json](../docs/security/evidence/explain-summary.json) | Reproducerbar audit-/beroendeevidens utan hemligheter. |
| [docs/security/evidence/manifest.json](../docs/security/evidence/manifest.json) | Reproducerbar audit-/beroendeevidens utan hemligheter. |
| [package.json](../package.json) | Implementerade kommandon jobs:worker, jobs:once och test:background; beroendelås oförändrat. |
| [packages/api-client/index.ts](../packages/api-client/index.ts) | Delat API-kontrakt för separat direktmetodlista och validering. |
| [packages/shared/types/index.ts](../packages/shared/types/index.ts) | Delat API-kontrakt för separat direktmetodlista och validering. |
| [scripts/background-worker.mjs](../scripts/background-worker.mjs) | Gemensamt autentiserat jobbgränssnitt, driftregler eller övervakad process utan webbtrafik. |
| [scripts/security-audit.mjs](../scripts/security-audit.mjs) | Fail-closed auditkontroll med exakta advisory-id:n, versioner, beroendevägar och slutdatum. |
| [scripts/sync-sites.mjs](../scripts/sync-sites.mjs) | Kopierar granskad main med produktionsgräns; native-/testadapterkällor utelämnas. |
| [supabase/migrations/20261018131608_complete_restaurant_capacity_catalog_v44.sql](../supabase/migrations/20261018131608_complete_restaurant_capacity_catalog_v44.sql) | Portabel CRLF-normalisering av befintligt migrationsutbyte. |
| [supabase/migrations/20261019112900_durable_readiness_jobs_v441.sql](../supabase/migrations/20261019112900_durable_readiness_jobs_v441.sql) | Additiv inbox, jobb, leases, merchant-snapshot, avstämning, köksregler, hälsa och service-role-ACL. |
| [test-support/local/environment.mjs](../test-support/local/environment.mjs) | Endast lokal overlay: syntetiska identiteter, beständig inbox och separat worker; ingen produktionsadapter. |
| [test-support/payments/dispatch.ts](../test-support/payments/dispatch.ts) | Endast lokal overlay: syntetiska identiteter, beständig inbox och separat worker; ingen produktionsadapter. |
| [test-support/payments/provider.ts](../test-support/payments/provider.ts) | Endast lokal overlay: syntetiska identiteter, beständig inbox och separat worker; ingen produktionsadapter. |
| [test-support/payments/runtime.ts](../test-support/payments/runtime.ts) | Endast lokal overlay: syntetiska identiteter, beständig inbox och separat worker; ingen produktionsadapter. |
| [tests/background-integration.mjs](../tests/background-integration.mjs) | Regression och acceptansprov för köer, worker, återhämtning och köksdrift. |
| [tests/background-jobs-db.test.mjs](../tests/background-jobs-db.test.mjs) | Regression och acceptansprov för köer, worker, återhämtning och köksdrift. |
| [tests/background-policy.test.mjs](../tests/background-policy.test.mjs) | Regression och acceptansprov för köer, worker, återhämtning och köksdrift. |
| [tests/direct-orders-integration.mjs](../tests/direct-orders-integration.mjs) | Regression och acceptansprov för befintliga API-/direkt-/simulatorflöden med asynkrona jobb. |
| [tests/integration.mjs](../tests/integration.mjs) | Regression och acceptansprov för befintliga API-/direkt-/simulatorflöden med asynkrona jobb. |
| [tests/mobile-payment-methods.test.mjs](../tests/mobile-payment-methods.test.mjs) | Regression och acceptansprov för betalningsidentitet, avstämning och säkra testflöden. |
| [tests/payment-readiness.test.mjs](../tests/payment-readiness.test.mjs) | Regression och acceptansprov för betalningsidentitet, avstämning och säkra testflöden. |
| [tests/payments.test.mjs](../tests/payments.test.mjs) | Regression och acceptansprov för betalningsidentitet, avstämning och säkra testflöden. |
| [tests/security-audit.test.mjs](../tests/security-audit.test.mjs) | Regression och acceptansprov för den tidsbegränsade auditpolicyn. |
| [tests/test-mode-environment.test.mjs](../tests/test-mode-environment.test.mjs) | Regression och acceptansprov för isolerad testmiljö och Windows-locale. |
| [tests/test-mode-integration.mjs](../tests/test-mode-integration.mjs) | Regression och acceptansprov för befintliga API-/direkt-/simulatorflöden med asynkrona jobb. |
| [tests/test-mode-payments.test.mjs](../tests/test-mode-payments.test.mjs) | Regression och acceptansprov för betalningsidentitet, avstämning och säkra testflöden. |

| Kompletterande dokument | Ändring |
| --- | --- |
| [docs/EXPO.md](EXPO.md) | Länkar aktuell fysisk testmatris och lokal worker-/Windowsguide; äldre bevis skiljs från nya. |
| [docs/PUBLICERING.md](PUBLICERING.md) | Skiljer Git/CI, Sites, migration, scheduler och EAS samt bevarar avstängda produktionsspärrar. |
| [docs/FILES_V4_4_1.md](FILES_V4_4_1.md) | Filgenomgången i denna sammanställning. |
| [docs/TEST_V4_4_1.md](TEST_V4_4_1.md) | 175 tester, lokala bevis, fel/rättningar, blockerade externa prov och exakta Windows-kommandon. |

READINESS_V4_4_1.md är ingången till fullständiga beslut, kvarstående risker och blockerade externa operationer.

