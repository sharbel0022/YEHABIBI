import type { Metadata } from 'next';
import Link from 'next/link';
export const metadata: Metadata = { title: 'Catering för företag och företagsfest i Västerås', description: 'Libanesisk catering för företagets event och fest i Västerås. Meze, grill och plockmeny med personlig planering hos Yei Habibi.', alternates: { canonical: '/foretagscatering-vasteras' } };
export default function CorporateCateringPage() {
  return <section className="shell hospitality-page"><header className="page-intro"><span className="eyebrow">FÖRETAGSCATERING I VÄSTERÅS</span><h1>Samla kollegorna kring god mat.</h1><p>Libanesisk buffé för företagets event och fest. Välj meze och grill eller fråga om en plockmeny för ert sällskap.</p></header><p>Berätta om datum, gästantal och önskemål. Vi bekräftar innehåll, pris och upplägg i personlig kontakt via mejl eller telefon.</p><Link className="btn btn-primary" href="/catering">Se cateringmenyer</Link></section>;
}
