# Att publicera Cedar Mezze – enkel ordning

Ägarlista uppdaterad för V4.3. Börja med [betalningsguiden](PAYMENTS_WITHOUT_STRIPE_V4_3.md) och [PUBLICERING.md](PUBLICERING.md) och [EXPO.md](EXPO.md).

**Läge:** Koden är förberedd för Next.js-hosting men inte klar för skarpa beställningar utan företagets konton och innehåll.

1. **Varumärke och domän.** Be ägaren skriftligen godkänna Cedar Mezze, kontrollera rättigheter till namn och köp domän i ägarens namn.
2. **Innehåll.** Samla äkta cateringmenyer, priser, allergener, minsta antal, leveransorter, hämtadress, kontaktsätt, bilder och kort ljudlös video som ägaren har användningsrätt till.
3. **Supabase.** Skapa företagets projekt och kör migrationen. Bjud in ägarens e-post i Auth. Konfigurera redirect till `/auth/callback`.
4. **Betalningsleverantör.** Granska Adyen-offert och tillgång till Swish/Apple Pay/Google Pay/Visa/Mastercard i SEK. Företaget godkänner leverantör/konto innan anslutning. Konfigurera därefter eget testkonto och verifiera riktiga sandboxwebhooks. Livebetalningar förblir avstängda.
5. **E-post.** Verifiera avsändardomän, anslut Resend, testa mejl till ägaren och till kunden.
6. **Avtal.** Ägaren ansvarar för korrekt moms, företagsuppgifter, allergener, avbokningsvillkor, GDPR, kassaregister och när beställningen blir bindande. Se över utkasten med kompetent rådgivare.
7. **Publicera.** Hostingen måste stödja Next.js serverfunktioner och hemliga servervariabler. En statisk HTML-sida/ChatGPT Sites utan backend kan **inte** ensam hantera orderdatabas, admin, betalningswebhooks eller säker inloggning.
8. **Sökning.** När allt är godkänt, aktivera indexering, lägg till rätt domän i Search Console och skicka sitemap. Verifiera företagets rätt till Google Business Profile; catering utan publik lokal visas normalt som serviceområde.
9. **QR-koder.** Hämta SVG för `/api/qr/bestall` och `/api/qr/google` från adminpanelen. Den andra finns bara när ägaren lagt in sin riktiga Google-recensionslänk.
10. **Sluttest.** Testa varje faktiskt aktiverat betalningsval, statusmejl, okända länkar, mobilspelning, pausanimering, fallback-bild och kontant vid hämtning.

**Google:** Sökord som `catering Västerås`, `libanesisk catering Västerås`, `festcatering Västerås` och `catering till företag` används där de är relevanta. Placering styrs av Google, bland annat plats och konkurrens. Inga topplaceringar eller betyg garanteras. Företagets recensioner kan inte skrivas direkt till Google av vår hemsida.

**ChatGPT Sites:** Om ni väljer ChatGPT Sites som framsida krävs att det finns stöd för fullständig säker serverdrift eller att ni kopplar den till en separat säker backend. Denna kodbas är en Next.js-applikation, inte ett färdigt ChatGPT Sites-projekt. Publicera inte som om betalningar fungerar innan dessa kopplingar har verifierats.
