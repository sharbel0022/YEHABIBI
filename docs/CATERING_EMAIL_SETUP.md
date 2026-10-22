# Direktmejl för cateringförfrågningar

Formuläret skickar via servern till **sharbelrasho@gmail.com**. Betalning sker på plats efter personlig bekräftelse. Ingen onlinebetalning, köhantering eller automatisk bokningsbekräftelse aktiveras av detta flöde.

## Aktivera Resend

1. Skapa ett eget konto på [Resend](https://resend.com/signup).
2. Lägg till en domän du äger och slutför Resends DNS-verifiering hos domänleverantören. Använd en avsändaradress på den verifierade domänen. Gmail-adressen är mottagare, inte en egen verifierbar avsändardomän.
3. Skapa en API-nyckel med minsta nödvändiga skickbehörighet för den domänen.
4. Lägg in serverhemligheten `RESEND_API_KEY` och serverinställningarna `EMAIL_FROM` (exempel `Yei Habibi <catering@din-verifierade-doman.se>`) samt `NOTIFICATIONS_ENABLED=true` i Sites miljöinställningar. Nyckeln ska aldrig skickas i chatten, läggas i Git eller använda prefixet `NEXT_PUBLIC_`.
5. Kontrollera att `NEXT_PUBLIC_SITE_URL` är den exakta publika HTTPS-adressen. Samma ursprung krävs vid formulärinskick.
6. Kontrollera att den publika innehållskatalogens kontaktmejl är verifierat och är `sharbelrasho@gmail.com`. Servern nekar andra mottagare även om katalogen ändras.
7. Publicera med de nya miljöinställningarna. Gör ett uttryckligen godkänt provinskick och kontrollera både Resends logg och mottagarens inkorg/skräppost. Prova också svar till kundens e-postadress.

Utan dessa inställningar är direktinskick avstängt och API:t svarar 503. En lyckad API-respons betyder att Resend accepterat mejlet, inte att mottagaren har läst det eller att en bokning är bekräftad. Fel från Resend ger ett återförsökbart fel och ingen falsk lyckad bekräftelse.

## Drift och begränsningar

- API:t godtar bara JSON från det publika ursprunget, högst 20 KiB, med servervaliderade kontaktuppgifter, datum och aktuella publika meny-/rätt-ID:n.
- Mottagare, avsändare, priser och betalningslänkar kan inte anges av klienten. Meddelandet är ren text och använder namn/priser från aktuell serverkatalog.
- Begärans UUID och ett hashvärde av det kanoniska mejlinnehållet bildar Resends idempotensnyckel. Vid timeout behåller klienten samma begäran för återförsök. Resends nycklar gäller i 24 timmar; detta är ingen permanent orderdatabas.
- En dold fälla och en enkel minimitid bromsar bottar. En begränsad minneskarta tillåter högst 6 försök per adress och 40 totalt per tio minuter i en instans. IP-headers beror på driftsmiljön; detta är endast ett enkelt skydd, inte ett globalt eller beständigt tak. Vid större trafik behövs plattformens verifierade IP-/missbruksskydd eller ett gemensamt beständigt rate limit-system.
- Varken kunduppgifter, meddelanden eller API-nycklar skrivs till applikationsloggar. Resend behandlar själva mejlinnehållet enligt sitt kontoavtal.
- Ingen databas eller ny betalningstjänst behövs. Äldre order-/notisfunktioner behåller sina separata aktiveringskrav.

Källor: [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email), [idempotensnycklar](https://resend.com/docs/dashboard/emails/idempotency-keys), [domänverifiering](https://resend.com/docs/dashboard/domains/introduction).
