> Historiskt dokument. Beskrivningar av Stripe gäller dåvarande version och är inte aktiva i V4.3. Aktuell betalningsarkitektur, kontokrav och testgränser finns i [PAYMENTS_WITHOUT_STRIPE_V4_3.md](PAYMENTS_WITHOUT_STRIPE_V4_3.md).

# Läs koden – Cedar Mezze V2

**V2-historik:** Detta dokument bevarar beskrivningen av versionen på `main` före Expo-uppgraderingen. Webbens sökvägar har flyttats till `apps/web/src/`. För aktuell V3-struktur och datakompatibilitet, läs [FIL_FOR_FIL.md](FIL_FOR_FIL.md) och [DATABAS.md](DATABAS.md). Prisregler och validering delas nu också med Expo genom `packages/shared`.

Projektet använder **TypeScript**, **React/Next.js**, **ren CSS** och **SQL/PostgreSQL**.

- **TypeScript**: regler för priser, beställningar, betalning och admin.
- **React + Next.js**: sidor, knappar, formulär, API och serverfunktioner.
- **CSS**: utseende (vit bakgrund, cedergrönt och diskreta röda detaljer).
- **PostgreSQL via Supabase**: menyer, maträtter, förfrågningar, priser, kampanjer och inställningar.
- **Stripe**: Swish/kort/Apple Pay **efter ägarens godkännande**. **Resend**: mejl.
- **Inga** egna kortuppgifter lagras. Hemcatering är förbeställning, inte direktköp.

## Läs i den här ordningen

1. `apps/web/src/lib/domain.ts` – enkla rena funktioner för **pris**, leveransavgift, kampanjdatum och orderstatus. Börja här.
2. `apps/web/src/components/ItemPicker.tsx` – plus/minus på varje maträtt.
3. `apps/web/src/components/OrderForm.tsx` – alla tre stegen vid beställning.
4. `apps/web/src/app/api/orders/route.ts` – servern granskar och räknar om allt från godkända databaspriser.
5. `supabase/migrations/0002_cedar_mezze_v2.sql` – nya databastabellen och fälten.

## Vyer för kunder

| Fil | Vad den gör |
| --- | --- |
| `apps/web/src/app/page.tsx` | Startsida med video, hem/fest/företag, paket, säsong och omdömeslänk. |
| `apps/web/src/app/menyer/page.tsx` | Meny med två val: färdiga paket eller bygg eget. |
| `apps/web/src/components/MenuCatalog.tsx` | Väljer menyflik, sällskapsstorlek och visar totalsumma i realtid. |
| `apps/web/src/components/ItemPicker.tsx` | Rätternas bilder, allergener, kategorier, antal och styckpriser. |
| `apps/web/src/app/bestall/page.tsx` | Hämtar data från databasen och visar formuläret. |
| `apps/web/src/components/OrderForm.tsx` | Formuläret – mat, plats/datum, kontakt/betalsätt. |
| `apps/web/src/components/Header.tsx` | Fyra enkla länkar och Beställ-knappen. |
| `apps/web/src/components/HeroMedia.tsx` | Ägarens ljudlösa video med pausknapp och reservbild. |
| `apps/web/src/app/globals.css` | Vit design, kort, responsiv mobilvy och tillgängliga knappar. |
| `apps/web/src/app/layout.tsx` | Sidmetadata, sökmotorbeskrivning och den gemensamma layouten. |
| `apps/web/src/app/sitemap.ts` | Adresser som sökmotorer kan hitta. |
| `apps/web/src/app/robots.ts` | Stoppar indexering innan webbplatsen är lanseringsklar. |

## API och databas

| Fil | Vad den gör |
| --- | --- |
| `apps/web/src/lib/domain.ts` | `calcTotal`, `calcItemsTotal`, `deliveryFeeFor` och kontantregler. |
| `apps/web/src/lib/data.ts` | Hämtar paket, styckrätter och företagsinställningar på servern. |
| `apps/web/src/lib/config.ts` | Demodata. **Demopriser är inte godkända priser.** |
| `apps/web/src/lib/validators.ts` | Validerar inkommande värden, antal, datum och adminändringar med Zod. |
| `apps/web/src/types/domain.ts` | TypeScript-typer som visar exakt vilka fält data har. |
| `apps/web/src/app/api/orders/route.ts` | Skyddat order-API: antispam, godkända priser, snapshot, sparar förfrågan. |
| `apps/web/src/app/api/admin/items/route.ts` | Skapa maträtter (admin). |
| `apps/web/src/app/api/admin/items/[id]/route.ts` | Uppdatera maträtter (admin). |
| `apps/web/src/app/api/admin/orders/[id]/route.ts` | Godkänn, neka, skapa Stripe-betallänk eller registrera kontanter mottagna. |
| `apps/web/src/app/api/stripe/webhook/route.ts` | Verifierar Stripes webhook innan ordern markeras betald. |
| `apps/web/src/lib/payments.ts` | Skapar säker checkout **efter godkännande**. |
| `apps/web/src/lib/mailer.ts` | Mejl till kund/ägare och särskild kontantnotis. |
| `apps/web/src/lib/auth.ts` | Säkerställer att bara ägaren får ändra inställningar. |
| `apps/web/src/lib/supabase.ts` | Ansluter till PostgreSQL; hemliga nycklar är bara på servern. |
| `supabase/migrations/0001_cedar_mezze.sql` | Ursprungliga tabeller: paket, order, företag och händelser. |
| `supabase/migrations/0002_cedar_mezze_v2.sql` | Ny tabell `menu_items`, orderrader som JSON och kampanj-/leveransinställningar. |

## Administration

| Fil | Vad den gör |
| --- | --- |
| `apps/web/src/app/admin/ratter/page.tsx` | Skyddad sida för maträtter. |
| `apps/web/src/components/admin/AdminItems.tsx` | Skapa/redigera namn, kategori, pris per styck, portion, allergener och foto. |
| `apps/web/src/components/admin/AdminSettings.tsx` | Kontakt, hemleverans, postnummerzoner, media och säsongskampanj. |
| `apps/web/src/components/admin/AdminMenus.tsx` | Ändrar färdiga paket och pris per person. |
| `apps/web/src/components/admin/AdminOrders.tsx` | Visar order och radpriser, godkänner och registrerar betalningar. |
| `apps/web/src/app/api/admin/settings/route.ts` | Validerar och sparar företagets inställningar. |

## Tre enkla exempel

**Pris:** 12 ostrullar × 25 kr = 300 kr. Om hela ordern blir 1 047 kr för 6 personer visas 174,50 kr/person. En order betalas ändå gemensamt.

**Leverans:** Postnummer `722 12` kan matcha prefix `722` och avgiften för just den zonen. Vid hämtning är leveransavgiften alltid 0 kr.

**Kontant:** Förfrågan skickas till ägaren. Ägaren godkänner först, sedan betalar kunden vid hämtning. Systemet markerar **inte** betalt automatiskt.

## Kör och testa

```bash
npm install
npm run syntax
npm run test
npm run typecheck
npm run build
npm run dev
```

Innan riktiga ordrar: kör SQL-filerna i ordning, konfigurera företagskonton, kontrollera varje allergen och godkänn villkor, prissättning och foto-/videorättigheter. Ägaren måste sätta `ORDERS_ENABLED=true` när allt är granskat.

**Viktigt:** Förfrågan om ändrat pris kan bara kommuniceras; ändrade offerter kräver en ny godkänd förfrågan. Ingen automatisk omskrivning av en redan godkänd order finns i V2. Google-rankning och omdömen kan inte garanteras.
