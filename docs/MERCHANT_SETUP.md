# Företagsuppgifter inför betalning och drift

Mall skapad 2026-10-19. Allt nedan är platshållare. Företaget äger framtida betalkonton och produktionsdata. Att företaget har Swish är bekräftat; bank, produkt, integratör och leverantör är fortfarande okända. Fyll i via företagets godkända interna kanal. Inga registreringar, livebetalningar eller produktionsändringar ingår.

## Företag och ansvar

- [ ] Juridiskt namn: `<företag>`
- [ ] Organisationsnummer: `<orgnr>`; företagsform: `<form>`
- [ ] Företagskontakt: `<namn/roll och företagskontakt>`
- [ ] Domänägare: `<företag>`; DNS-ansvarig och delegerad åtkomst: `<roll>`
- [ ] Ansvarig för betalningar: `<roll>`
- [ ] Ansvarig för återbetalningar/chargeback och dubbelkontroll: `<roll>`
- [ ] Driftansvarig och ersättare: `<roller>`
- [ ] Köksansvarig, kvitteringsrutin och reservkanal: `<roll/rutin>`

## Bank och betalning

- [ ] Bank: `<bank>`
- [ ] Exakt Swishprodukt: `<Swish Handel | Swish Företag | ännu okänd>`
- [ ] Swishintegratör och avtalsägare: `<företag/ingen/okänd>`
- [ ] Befintlig kort-/kassaleverantör: `<leverantör>`
- [ ] Kortavtalet omfattar e-handel: `<ja/nej/utreds>`
- [ ] Metoder kontrollerade med valt konto: `<Swish, Visa/Mastercard, Apple Pay, Google Pay>`
- [ ] Uppskattad ordervolym: `<order/månad>`; snittbelopp: `<SEK>`; högsta cateringbelopp: `<SEK>`
- [ ] Längsta tid mellan betalning och leverans: `<dagar>`
- [ ] Utbetalningsrutin, avstämning och bokföringsansvar: `<rutin/roll>`
- [ ] Återbetalningsrutin, godkännandegräns och reservrutin: `<rutin>`
- [ ] Prisoffert: `<fast kostnad, minimifaktura, transaktion, refund, chargeback, utbetalning>`
- [ ] Företagets val och skriftliga godkännande: `<leverantör, integrationsmodell, datum, roll>`

## Teknik och miljöer

| Uppgift | Isolerad lokal test | Godkänd sandbox/test | Produktion |
|---|---|---|---|
| Hosting och ansvarig | `<lokalt>` | `<hosting/roll>` | `<hosting/roll>` |
| Backendcommit | `<SHA>` | `<SHA>` | `<SHA>` |
| Supabase-projekt/databas | `<separat syntetisk databas>` | `<projektref>` | `<annat projektref>` |
| Merchant-konto och miljö | `<local_test>` | `<testkonto-ID>` | `<livekonto-ID>` |
| Företagsägda konton/utvecklarroller | `<roller>` | `<roller>` | `<minsta roller>` |
| Scheduler och heartbeatövervakning | `<lokal worker>` | `<godkänd scheduler>` | `<godkänd scheduler>` |
| Godkända notifieringstjänster/mottagare | `<interceptad testinkorg>` | `<godkända syntetiska mottagare>` | `<godkända roller/kanaler>` |
| Domän och TLS | `<loopback>` | `<skyddad testdomän>` | `<företagets domän>` |

- [ ] Apple Developer-, Google Play- och Expo/EAS-identiteter tillhör rätt ägare: `<konton/roller>`
- [ ] Native buildidentitet, signingägare och återkallningsrutin: `<roll/rutin>`
- [ ] För vald hostad/native walletmodell: `<endast de Merchant ID/certifikat/domänverifieringar/entitlements som faktiskt krävs>`
- [ ] Skyddad telefonanslutning godkänd av företaget: `<testdomän/VPN, ansvarig, datum>`
- [ ] `PAYMENTS_ENABLED=false`, `PAYMENTS_LIVE_APPROVED=false` och `NOTIFICATIONS_ENABLED=false` tills respektive steg är godkänt och verifierat.

## Hemligheter och förnyelse

API-hemligheter, privata certifikat, banklösenord, BankID-koder och identitetshandlingar ska aldrig lämnas i chatt, GitHub, dokumentmallen eller offentliga miljövariabler. Ange bara namn på posten och ansvarig i företagets godkända hemlighetslager. Test och live har separata poster och behörigheter. `NEXT_PUBLIC_*` och `EXPO_PUBLIC_*` är offentliga värden.

| Hemlighet/identitet (namn, aldrig värde) | Lagringsreferens | Ägare | Tillåtna roller/miljö | Rotation/förnyelse | Senast kontrollerad |
|---|---|---|---|---|---|
| Backend service role | `<postref>` | `<roll>` | `<server endast>` | `<datum/rutin>` | `<datum>` |
| Betalnings-API och webhooknyckel | `<separata test/live-postref>` | `<roll>` | `<betalningsserver>` | `<datum/rutin>` | `<datum>` |
| Jobbautentisering | `<postref>` | `<roll>` | `<scheduler/server>` | `<datum/rutin>` | `<datum>` |
| Orderlänkshemlighet | `<postref>` | `<roll>` | `<server>` | `<plan som bevarar giltiga orderlänkar>` | `<datum>` |
| Direkt Swish mTLS, endast om valt | `<certifikatpostref>` | `<roll>` | `<vald server>` | `<utgång, påminnelse, förnyelseprov>` | `<datum>` |
| Native signing, endast där behövs | `<postref>` | `<roll>` | `<buildansvarig>` | `<utgång/förnyelse>` | `<datum>` |

- [ ] Minsta behörighet, MFA och borttagning av utvecklaråtkomst vid avslut dokumenterade.
- [ ] Rotation övas i test: installera ny nyckel, verifiera trafik, återkalla gammal; behåll verifieringsmöjlighet för äldre betalningsförsök enligt vald leverantör.
- [ ] Certifikatsutgång övervakas med förvarning och ansvarig ersättare.
- [ ] Backup/återläsning, loggmaskning, åtkomst och retention godkända: `<rutin/roll/datum>`.
