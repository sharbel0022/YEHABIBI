# Bakgrundsjobb V4.4.1

En PostgreSQL-databas och befintlig Next-backend per miljö. `scripts/background-worker.mjs` är en separat övervakad process som anropar `POST /api/internal/jobs`. Den behöver inga öppna webbläsare. Samma begränsade tick kan anropas av en godkänd extern schemaläggare. Den installerar ingen scheduler automatiskt.

`BACKGROUND_JOB_SECRET` är en egen slumpad serverhemlighet på minst 32 tecken. Lägg den i hostingens hemlighetslager och processens miljö; aldrig i URL, klient, chatt eller GitHub. Varken anon-nyckel eller admincookie ger jobbehörighet. GET på samma skyddade endpoint visar aggregerad hälsa utan orderuppgifter. Behörig admin kan läsa och ändra driftregler via `/api/admin/jobs` (GET/PATCH med samma origin- och sessionskontroll som övrig admin).

Varje tick köar watchdog och säkert reservationsunderhåll högst en gång per minut samt begränsade avstämningar per betalningsförsök. Tre jobb och en notifiering tas per tick. Claim sker med `FOR UPDATE SKIP LOCKED`, unik ägare, slumpad lease-token och tre minuters lease. Ingen transaktion hålls öppen över leverantörsanrop. Efter krasch återtas utgången lease; gamla tokens kan inte kvittera eller påverka databasen. Åtta misslyckanden ger synlig felkö. Återförsök fördröjs och respekterar Retry-After. Parallella workers delar samma kö. Nätanrop har timeout, ägarpush gör högst tio parallella behörighetsuppslag och notifiering kräver minst en minuts återstående lease före sändningsarbetet.

Verifierade webhookar sparas i inbox innan HTTP 200. Betalningens affärsregler, kapacitet, outbox och inboxkvittens behandlas atomärt av jobbet. Mejl och push ligger utanför webhooksvaret. Outbox har separata mottagarkvittenser, stabila Resend-idempotensnycklar och samma lease även vid manuellt omskick. En timeout kan fortfarande ha levererats externt; ingen exactly-once-garanti lämnas. Resends idempotensfönster är 24 timmar; efter 23 timmar sedan första sändningsförsök stoppas automatisk sändning för manuell kontroll. Push är ett frivilligt komplement, och krasch efter push-claim kan ge utebliven push. E-postens kö finns kvar oberoende av detta. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

Hela pusharbetet delar en avbrottssignal på högst 25 sekunder inklusive behörighetsuppslag och kvittouppdateringar. Varje serverdatabasanrop begränsas dessutom till tio sekunder. Detta begränsar arbetstiden; det garanterar inte extern pushleverans.

## Kökets regler

`watchdog_enabled` aktiverar sparade kökslarm. Föreslagna **testvärden**, inte uppmätta driftlöften: tick varje minut, påminnelse efter två minuter, eskalering efter fem minuter, förberedelsepåminnelse 30 minuter före planerad förberedelsestart. Värden kan ändras i `/api/admin/jobs`. Varje larmtyp får en stabil nyckel per order/tid; upprepade kontroller skapar inga nya identiska larm. Behörig personals orderkvittering med användar-id är den mänskliga bekräftelsen. Leveranskvittens för mejl/push räcker inte.

Reservkanal är en separat företagsgodkänd e-postadress, `KITCHEN_BACKUP_EMAIL`, och kräver `notification_backup_approved=true` i databasen. Om ordinarie kanal misslyckas används godkänd reservadress; misslyckas båda lämnas eskaleringen i kön. Ingen SMS-tjänst eller mottagare skapas. Alla externa sändningar kräver dessutom `NOTIFICATIONS_ENABLED=true`; lokala tester fångar dem i en privat syntetisk inkorg.

`job_health_required=true` är den uttryckliga driftregeln som stänger nya direktköp när senaste lyckade watchdog är för gammal eller mottagningen är otillgänglig. Förslag i test: högst 180 sekunder. Aktivera först efter köksansvarigs godkännande och test av mottagning/övervakning. Befintliga betalningswebhookar fortsätter tas emot. `paused`/`pause_reason` beskriver separat operatörs-/watchdogpaus; rätta orsaken, kontrollera obekräftade order, kvittera och återuppta genom admin. Ändring av regler flyttar inga redan bekräftade kundtider.

## Start, stopp och återhämtning i Windows

Isolerad testmiljö (egen PostgreSQL, privat simulator, mejl fångas, inga riktiga pengar):

```powershell
Set-Location 'C:\Users\sharbel\Downloads\YEHABIBI'
npm ci
npm run test:server
```

Launcher startar webbserver och separat worker på loopback. Ctrl+C stoppar endast processerna som testsessionen skapade. Stopp från annan terminal: `npm run test:server -- --stop`. Ny tom testdatabas: `npm run test:server -- --reset`. Kontrollera testmarkeringen och använd bara syntetiska uppgifter.

I en uttryckligen konfigurerad godkänd miljö använder processhanteraren:

```powershell
# Ladda BACKGROUND_JOB_SECRET från godkänt hemlighetslager, inte denna guide.
$env:BACKGROUND_JOB_URL='https://<godkänd-backend>/api/internal/jobs'
$env:BACKGROUND_JOB_INTERVAL_MS='60000'
npm run jobs:worker
# En enstaka tick:
npm run jobs:once
```

Windows Task Scheduler eller en tjänstehanterare behöver starta om workern vid exit och övervaka dess felutgång/logg. HTTP-anrop använder timeout och följer inte redirects. En scheduler får inte förlita sig på timers i en kortlivad serverfunktion. Stoppa först nya beställningar vid driftfel, behåll verifieringscredentials och låt betalningsinbox fortsätta ta emot. Starta sedan om samma worker; skapa inga ersättningsorder eller nya debiteringar.

## Hosted scheduler och övervakning

Hosting och företagets projekt är ännu inte identifierade. Supabase Cron använder pg_cron, kan köra SQL eller HTTP via pg_net och rekommenderar högst åtta samtidiga jobb samt jobb kortare än tio minuter. Ett godkänt upplägg är **en** minutplan som anropar samma skyddade endpoint, med hemligheten i Supabase Vault och kort HTTP-timeout. Verifiera tillgängliga extensions, Vault-behörighet, nätåtkomst till backend, planens anropsgränser, exekveringshistorik och timeout i företagets isolerade testprojekt före aktivering. Ingen SQL-plan med hemlighet checkas in och ingen plan installeras genom migrationen. [Supabase Cron](https://supabase.com/docs/guides/cron).

Separat extern heartbeatövervakning är **inte ansluten**. Den behövs för att upptäcka att både scheduler och backend står stilla: läs skyddad hälsa med separat begränsad serveråtkomst, kontrollera senaste lyckade watchdog, ködjup, äldsta väntande post och felkö; larma godkänd ansvarig. Schedulerloggar ersätter inte detta. Dokumentera vald tjänst, kostnad, mottagare och eskaleringsansvar innan anslutning.

Felkö granskas av behörig driftansvarig. Återställ endast efter kontroll av bakomliggande fel, gammal lease och extern leveransstatus; gå inte förbi 24-timmarsfönstret med ett blint omskick. Betalningsjobb ska återanvända samma verifierade inboxpost/event-id. Misstänkt betalning ska avstämmas med leverantörsbevis, aldrig genom ny debitering. Loggar innehåller endast fasta felkoder och räknare.

Retentionförslag som företaget måste godkänna: rensa färdiga rent tekniska minutjobb efter 14 dagar, begränsa felsökningsåtkomst till driftansvariga och behåll finansiella normaliserade bevis enligt fastställda bokförings-/tvistkrav. Rensa aldrig obehandlad inbox/felkö automatiskt. Outboxens snapshot innehåller privat orderinformation och ska omfattas av samma åtkomst/retention som ordern. Ingen automatisk rensning av finansiella uppgifter införs.

Backup/återläsning: säkerhetskopiera rätt miljös PostgreSQL inklusive inbox/outbox och försök, kryptera och åtkomstbegränsa kopian, dokumentera återställningspunkt. Öva återläsning till ny isolerad databas med sändning och nybetalningar avstängda. Starta inte workers mot en gammal kopia förrän redan levererade händelser stämts av. En kodrollback ska lämna de additiva tabellerna kvar; stoppa nya köp och verifiera betalningsmottagningen före återgång.
