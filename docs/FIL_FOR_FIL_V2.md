# Läs koden – Cedar Mezze V2

Projektet använder **TypeScript**, **React/Next.js**, **ren CSS** och **SQL/PostgreSQL**.

- **TypeScript**: regler för priser, beställningar, betalning och admin.
- **React + Next.js**: sidor, knappar, formulär, API och serverfunktioner.
- **CSS**: utseende (vit bakgrund, cedergrönt och diskreta röda detaljer).
- **PostgreSQL via Supabase**: menyer, maträtter, förfrågningar, priser, kampanjer och inställningar.
- **Stripe**: Swish/kort/Apple Pay **efter ägarens godkännande**. **Resend**: mejl.
- **Inga** egna kortuppgifter lagras. Hemcatering är förbeställning, inte direktköp.

## Läs i den här ordningen

1. `src/lib/domain.ts` – enkla rena funktioner för **pris**, leveransavgift, kampanjdatum och orderstatus. Börja här.
2. `src/components/ItemPicker.tsx` – plus/minus på varje maträtt.
3. `src/components/OrderForm.tsx` – alla tre stegen vid beställning.
4. `src/app/api/orders/route.ts` – servern granskar och räknar om allt från godkända databaspriser.
5. `supabase/migrations/0002_cedar_mezze_v2.sql` – nya databastabellen och fälten.

## Vyer för kunder

| Fil | Vad den gör |
| --- | --- |
| `src/app/page.tsx` | Startsida med video, hem/fest/företag, paket, säsong och omdömeslänk. |
| `src/app/menyer/page.tsx` | Meny med två val: färdiga paket eller bygg eget. |
| `src/components/MenuCatalog.tsx` | Väljer menyflik, sällskapsstorlek och visar totalsumma i realtid. |
| `src/components/ItemPicker.tsx` | Rätternas bilder, allergener, kategorier, antal och styckpriser. |
| `src/app/bestall/page.tsx` | Hämtar data från databasen och visar formuläret. |
| `src/components/OrderForm.tsx` | Formuläret – mat, plats/datum, kontakt/betalsätt. |
| `src/components/Header.tsx` | Fyra enkla länkar och Beställ-knappen. |
| `src/components/HeroMedia.tsx` | Ägarens ljudlösa video med pausknapp och reservbild. |
| `src/app/globals.css` | Vit design, kort, responsiv mobilvy och tillgängliga knappar. |
| `src/app/layout.tsx` | Sidmetadata, sökmotorbeskrivning och den gemensamma layouten. |
| `src/app/sitemap.ts` | Adresser som sökmotorer kan hitta. |
| `src/app/robots.ts` | Stoppar indexering innan webbplatsen är lanseringsklar. |

## API och databas

| Fil | Vad den gör |
| --- | --- |
| `src/lib/domain.ts` | `calcTotal`, `calcItemsTotal`, `deliveryFeeFor` och kontantregler. |
| `src/lib/data.ts` | Hämtar paket, styckrätter och företagsinställningar på servern. |
| `src/lib/config.ts` | Demodata. **Demopriser är inte godkända priser.** |
| `src/lib/validators.ts` | Validerar inkommande värden, antal, datum och adminändringar med Zod. |
| `src/types/domain.ts` | TypeScript-typer som visar exakt vilka fält data har. |
| `src/app/api/orders/route.ts` | Skyddat order-API: antispam, godkända priser, snapshot, sparar förfrågan. |
| `src/app/api/admin/items/route.ts` | Skapa maträtter (admin). |
| `src/app/api/admin/items/[id]/route.ts` | Uppdatera maträtter (admin). |
| `src/app/api/admin/orders/[id]/route.ts` | Godkänn, neka, skapa Stripe-betallänk eller registrera kontanter mottagna. |
| `src/app/api/stripe/webhook/route.ts` | Verifierar Stripes webhook innan ordern markeras betald. |
| `src/lib/payments.ts` | Skapar säker checkout **efter godkännande**. |
| `src/lib/mailer.ts` | Mejl till kund/ägare och särskild kontantnotis. |
| `src/lib/auth.ts` | Säkerställer att bara ägaren får ändra inställningar. |
| `src/lib/supabase.ts` | Ansluter till PostgreSQL; hemliga nycklar är bara på servern. |
| `supabase/migrations/0001_cedar_mezze.sql` | Ursprungliga tabeller: paket, order, företag och händelser. |
| `supabase/migrations/0002_cedar_mezze_v2.sql` | Ny tabell `menu_items`, orderrader som JSON och kampanj-/leveransinställningar. |

## Administration

| Fil | Vad den gör |
| --- | --- |
| `src/app/admin/ratter/page.tsx` | Skyddad sida för maträtter. |
| `src/components/admin/AdminItems.tsx` | Skapa/redigera namn, kategori, pris per styck, portion, allergener och foto. |
| `src/components/admin/AdminSettings.tsx` | Kontakt, hemleverans, postnummerzoner, media och säsongskampanj. |
| `src/components/admin/AdminMenus.tsx` | Ändrar färdiga paket och pris per person. |
| `src/components/admin/AdminOrders.tsx` | Visar order och radpriser, godkänner och registrerar betalningar. |
| `src/app/api/admin/settings/route.ts` | Validerar och sparar företagets inställningar. |

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
