> Historiskt dokument. Beskrivningar av Stripe gäller dåvarande version och är inte aktiva i V4.3. Aktuell betalningsarkitektur, kontokrav och testgränser finns i [PAYMENTS_WITHOUT_STRIPE_V4_3.md](PAYMENTS_WITHOUT_STRIPE_V4_3.md).

# V4.1 – verifierat nuläge inför V4.2

Granskad 2026-10-17. Utgångspunkt är `main`, commit `4c77c4c3b78068ebd0b2ae2ebaa544145b974a11`. [GitHub Actions 39064407515](https://github.com/sharbel0022/YEHABIBI/actions/runs/39064407515) är godkänd för denna commit, inklusive den isolerade HTTP-/databasintegrationen. Rapporten skiljer den verifierade V4.1-källan från V4.2:s senare ändringar och från externa tjänster som ännu saknar företagskonfiguration.

## Resultat före refaktorering

Inget kritiskt fel påvisades i V4.1:s backend, databas eller betalningsavstämning. `npm test` passerade med 36 tester. `npm run test:integration` passerade mot verklig lokal PostgreSQL 18.3, PostgREST 16.4 och Next.js-rutter: fyra syntetiska order och 26 idempotenta testmejl. Auth, Stripe och Resend ersätts av isolerade HTTP-transporter i denna körning; resultatet är inte en verifiering av leverantörernas konton.

| Krav | Befintligt stöd och verifiering |
| --- | --- |
| Samma menyer och priser | Webbens serverläsare och `/api/catalog` läser samma `menus`, `dishes`, `delivery_zones`, `campaigns` och `business_settings`. Expo använder katalog-API:t. V2:s `menu_items` är en uppdateringsbar kompatibilitetsvy över `dishes`. |
| Styckpris och portionspris | Gemensamma rena funktioner räknar i öre. Paket multipliceras med gästantal; egen meny summerar rättmängder. Servern kontrollerar aktuella databaspriser igen och SQL låser de berörda raderna innan ordern sparas. |
| Menybyggare och utkast | Båda gränssnitten stöder paket/egna rätter. Webb använder sessionStorage, native använder SecureStore och Expo Web localStorage för menyutkast. Befintliga tester täcker priser, mängder, minimiantal, datum och zoner; tidigare mobilprov beskrivs i [TESTER.md](TESTER.md). |
| Samma order-API | Båda skickar samma orderformat till `POST /api/orders`. En `request_id`, fingeravtryck, transaktionslås och unik begränsning ger samma order vid samtidiga återförsök. Ändrat innehåll med samma nyckel avvisas. |
| En orderdatabas och admin | Endast `orders` och tillhörande `order_items` används. Det finns inga separata webb-/mobilordertabeller. Next.js-admin läser samma tabeller. |
| Prisändring och historik | Separat förslag, revisionsnummer och uttrycklig kundacceptans. Gamla styckpriser/orderrader bevaras; en godkänd prisjustering redovisas separat. Föråldrade och samtidiga godkännanden testas. |
| Betalning | Checkout tillåts efter godkännande och rätt accepterad revision. Signerad Stripe-webhook kontrollerar order, session, SEK och belopp innan SQL avstämmer status. Dubbel webhook, sen misslyckad betalning, sessionsförnyelse och återbetalning testas. Returlänk ändrar inte betalstatus. |
| Atomäritet och notiser | Order, orderrader och notifieringshändelse ingår i samma databastransaktion. Ett framtvingat radfel rullar tillbaka allt. Misslyckat mejl lämnar ordern och väntande mottagarkvittens kvar. |
| Behörighet och hemligheter | Admin kräver serververifierad Supabase-användare, bekräftad e-post och `ADMIN_EMAILS`. RLS och indragna tabell-/funktionsrättigheter stoppar direkt orderläsning. SQL-funktionerna använder `SECURITY INVOKER`. Service-role, Stripe och mejlnycklar används på servern. |
| Miljöer | Utveckling, test och produktion dokumenteras med separata backend-/databasadresser och betalningsmiljöer. Offentliga beställnings- och betalspärrar är avstängda som standard. Att dessa miljöer är konfigurerade hos företaget har inte verifierats. |

## Beroendekarta i V4.1

| Del | Filer och beroenden |
| --- | --- |
| Webbens meny och beställning | `apps/web/src/components/MenuCatalog.tsx`, `OrderForm.tsx` och `order-draft.ts` använder delade regler och serverdata; inskick går till `/api/orders`. |
| Mobilens meny och beställning | `apps/mobile/app/menyer.tsx`, `bygg.tsx`, `bestall.tsx` → `apps/mobile/lib/store.tsx` och `api.ts` → samma Next.js-API. Native navigation, kalender och lagring är plattformsspecifika. |
| Delade kontrakt och regler | `packages/shared/types/index.ts`, `pricing/index.ts`, `validation/index.ts`. Webbens `lib/domain.ts`, `lib/validators.ts` och `types/domain.ts` återexporterar dessa. |
| Publik katalog | `apps/web/src/app/api/catalog/route.ts` → `apps/web/src/lib/data.ts` → serverns `adminDb()` → gemensamma katalogtabeller. |
| Skapa order | `apps/web/src/app/api/orders/route.ts` → delad validering/beräkning → `create_catering_order` → `orders` + `order_items` + notifieringskö i samma transaktion. |
| Privat order och kundacceptans | `apps/web/src/app/api/orders/[code]/route.ts` → `lib/tracking.ts` + `publicOrderView()` → `accept_catering_change` och eventuell `attach_catering_checkout`. |
| Gemensam admin | `apps/web/src/app/admin/orders/page.tsx` läser `orders`/`order_items`. `api/admin/*` → `requireAdmin()` → samma serverdatabas. Katalogens äldre API:er är kompatibilitetsingångar till samma tabeller. |
| Betalning | `lib/payments.ts` → `lib/checkout.ts` → Stripe Checkout. `api/stripe/webhook/route.ts` verifierar signatur och orderbelopp → `apply_stripe_event` → `payment_events` och orderstatus. |
| Notifieringar | SQL-trigger → `order_notifications` med sparad händelse → `lib/mailer.ts`/`lib/push.ts` → Resend/Expo. Kund och ägare kvitteras var för sig; Resend använder beständiga idempotensnycklar. |
| Databasschema | Fem migrationer i `supabase/migrations`, från `0001_cedar_mezze.sql` till `20261017192114_v41_notifications_and_settings.sql`. Katalog-ID:n, ordernummer och historiska priser bevaras. |
| Automatiska bevis | `tests/domain.test.mjs`, `v2.test.mjs`, `v3.test.mjs`, `v4.test.mjs`: rena regler och migrationskedjan i PGlite. `tests/integration.mjs`: verklig PostgreSQL/PostgREST/Next-HTTP. `.github/workflows/check.yml`: installation, syntax, typer, tester, bygge, mobilexport och HTTP-integration. |

Paketens innehåll finns redan i `menus.included`; prisreferenser och betalningsreferenser finns på ordern samt i `order_items`/`payment_events`. Prisändringshistorik finns i `orders.quote_history`. V4.2 behöver därför inget parallellt orderschema eller destruktiv migration för att samla webb och mobil.

## Återstående verifieringsgränser

Företagets Supabase Auth/Storage, Stripe-sandbox med kort/Swish/Apple Pay, levererad Resend-e-post samt APNs/FCM är inte verifierade. Fysisk iPhone och nya native-artefakter måste provas för den aktuella versionen. Äldre visuella prov och V4-byggen får inte räknas som nya V4.2-prov.

V4.1:s webbläsar-E2E saknar verifierat resultat; tidigare originåtkomst avvisades. Fulla monorepons kända beroendefynd och lokala security-advisorgränser är dokumenterade i [TESTER.md](TESTER.md). Notifieringar återförsöks av relevanta anrop eller admin; någon fristående bakgrundsarbetare är inte konfigurerad. Push kan utebli vid processkrasch efter sändningsanspråk, medan e-post har separat kvittens.

Dessa punkter blockerar en påstådd verifierad skarp lansering men hindrar inte den lokala V4.2-refaktoreringen. V4.2:s slutliga tester och publiceringsresultat redovisas separat.
