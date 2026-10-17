import type { Metadata } from 'next';
import { getCatalog } from '@/lib/data';
import Link from 'next/link';
import { formatSek } from '@/lib/domain';
import { MenuCard } from '@/components/MenuCard';
import { isSupabaseReady } from '@/lib/config';
export const metadata: Metadata = { title: 'Cateringmenyer i Västerås', alternates: { canonical: '/menyer' }, description: 'Se våra libanesiska cateringmenyer: mezze, grill och bufféer för fest, hem och företag.' };
export default async function Menus() {
  const { menus, dishes } = await getCatalog();
  return <section className="shell section inner-page"><span className="eyebrow">LIBANESISKA SMAKER</span><h1>Våra cateringmenyer</h1><p className="intro">Upptäck våra favoriter för små och stora sällskap. Alla priser och allergener bekräftas före beställning.</p>
    {!isSupabaseReady() && <p className="preview-note">Detta är en förhandsvisning. Ägaren behöver lägga in verkliga priser.</p>}
    <div className="menu-grid">{menus.map(menu => <MenuCard key={menu.id} menu={menu} preview={!isSupabaseReady()} />)}</div>
    {!menus.length && <p>Menyer publiceras här så snart ägaren har godkänt dem.</p>}
    <div className="order-panel campaign"><span className="eyebrow">DU VÄLJER</span><h2>Bygg din egen catering</h2><p>Välj rätter och antal portioner. Se styckpris, radpris, total och pris per person direkt.</p><Link href="/bestall?meny=egen" className="btn btn-primary">Välj dina maträtter →</Link></div>
    <div className="menu-grid">{dishes.map(dish => <article className="menu-card" key={dish.id}>{dish.image_url && <div className="menu-image-wrap"><img src={dish.image_url} alt={dish.title} loading="lazy"/></div>}<div className="menu-card-body"><h3>{dish.title}</h3><p>{dish.description}</p><strong>{dish.price_ore > 0 ? `${formatSek(dish.price_ore)} / ${dish.portion_label}` : 'Pris fastställs av ägaren'}</strong><p>Allergener: {dish.allergens.join(', ') || 'Bekräftas av ägaren'}</p></div></article>)}</div>
  </section>;
}
