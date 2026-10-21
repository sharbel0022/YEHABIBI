import type { Metadata } from 'next';
import Link from 'next/link';
export const metadata: Metadata = { title: 'Catering för bröllop och fest i Västerås', description: 'Libanesisk buffé och meze till bröllop, födelsedag och studentfirande i Västerås. Välj en cateringmeny eller fråga Yei Habibi om plockmeny.', alternates: { canonical: '/festcatering-vasteras' } };
export default function EventCateringPage() {
  return <section className="shell hospitality-page"><header className="page-intro"><span className="eyebrow">FESTCATERING I VÄSTERÅS</span><h1>En fest att minnas.</h1><p>Libanesisk catering för bröllop, födelsedagar och studentfirande. Meze och grill att dela med dem du vill samla.</p></header><p>Välj bland våra tre cateringmenyer eller fråga om en plockmeny. Vi planerar datum, antal personer och era önskemål via mejl eller telefon.</p><div className="contact-actions"><Link href="/catering" className="btn btn-primary">Se cateringmenyer</Link><Link href="/festlokal" className="btn btn-outline-light">Utforska festlokaler</Link></div></section>;
}
