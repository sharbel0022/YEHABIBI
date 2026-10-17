# Testplan för ägaren – gör detta före skarp lansering

Ägarchecklista för V4.3. Börja med [betalningsguiden](PAYMENTS_WITHOUT_STRIPE_V4_3.md) och [TESTER.md](TESTER.md). En simulerad lokal webhook räknas inte som Adyen-sandbox.

## Kundens flöde

- [ ] Öppna startsidan på iPhone och Android: bild visas direkt, video kan spelas/pausas och ljud är av.
- [ ] Slå på inställningen "Minska rörelse": video startar inte automatiskt.
- [ ] Välj alla menyer och kontrollera riktiga priser och allergener.
- [ ] Fyll i för få personer: beställning stoppas.
- [ ] Välj ogiltigt datum och saknad leveransadress: beställning stoppas.
- [ ] Skicka en testförfrågan: ägaren får mejl och kunden får spårningslänk.
- [ ] Öppna en påhittad eller felaktig spårningslänk: kunduppgifter visas inte.

## Ägarens flöde

- [ ] Okänd användare kan inte läsa `/admin` eller ändra API:er.
- [ ] Ägaren loggar in med engångslänk, godkänner, nekar och begär ändring.
- [ ] Kontant beställning skapar tydligt mejl om att den är **obetald**.
- [ ] Kontant fungerar bara vid hämtning och markeras betald först efter verklig betalning.
- [ ] Verifierad Adyen-testbetalning uppdaterar ordern en gång även om samma webhook skickas två gånger; fel belopp/signatur/konto/referens avvisas.
- [ ] Att bara besöka Checkout-sidan eller återvända till hemsidan markerar **inte** betalningen som klar.
- [ ] Begär återbetalning i admin och kontrollera pending → verifierad status samt sena refundfel/återföringar.
- [ ] Testa Swish mobilväxling/desktop-QR, Apple Pay på fysisk iPhone, Google Pay på fysisk Android och kortets 3D Secure i officiell testmiljö efter kontoaktivering.
- [ ] Ett oklart/utgånget försök skapar ingen ny debitering; ägaren ser avstämningsbehov. Betalspärr stoppar skapande men låter redan utfärdade signerade händelser avstämmas.
- [ ] Ladda upp en ägarbild och video; byt startsidans video och kontrollera fallback.
- [ ] Generera QR-kod, skanna med telefon och kontrollera att länken är korrekt.

## SEO och juridik

- [ ] Verifiera varumärke, domän, org-uppgifter och kontaktvägar.
- [ ] Bekräfta allergener, momssatser, ångerrätt/avbokningsregler och rätt kassahantering för verksamheten.
- [ ] Ägaren har godkänt integritetspolicy och uppgiftsbehandlingsavtal.
- [ ] Google Maps-profilen följer Googles riktlinjer.
- [ ] Google-recensioner är autentiska och den riktiga Google-länken används.
- [ ] `NEXT_PUBLIC_INDEXABLE=true` först efter att webbplatsen är färdig.
- [ ] Sökord och klick följs genom Search Console efter att profilen verifierats.
