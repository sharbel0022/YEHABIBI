import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getHospitalityCatalog } from "@/lib/hospitality";
import { ContactActions } from "@/components/hospitality/ContactActions";
import { DraftNotice } from "@/components/hospitality/Content";
import { CateringInquiry } from "@/components/hospitality/CateringInquiry";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await getHospitalityCatalog();
  const menu = catalog.menus.find((item) => item.slug === slug);
  if (!menu) notFound();
  return menu
    ? {
        title: `${menu.name} – libanesisk catering`,
        description: `${menu.description} ${menu.pricePerPerson === null ? "Pris enligt offert." : `${menu.pricePerPerson} kr/person enligt menyunderlaget.`} Kontakta Yei Habibi för innehåll, allergener och upplägg.`,
        alternates: { canonical: `/catering/${menu.slug}` },
        robots: menu.approved ? undefined : { index: false, follow: true },
      }
    : {};
}
export default async function MenuPage({ params }: Props) {
  const [{ slug }, catalog] = await Promise.all([
    params,
    getHospitalityCatalog(),
  ]);
  const menu = catalog.menus.find((item) => item.slug === slug);
  if (!menu) notFound();
  return (
    <div className="shell hospitality-page">
      <nav className="breadcrumbs" aria-label="Brödsmulor">
        <Link href="/catering">Catering</Link>
        <span aria-hidden="true">/</span>
        <span>{menu.name}</span>
      </nav>
      <DraftNotice
        preview={catalog.preview || !menu.approved || !menu.allergensVerified}
      />
      <section className="menu-detail">
        <figure className="detail-photo">
          <img
            src={menu.image}
            alt={menu.imageAlt}
            width={900}
            height={1000}
            fetchPriority="high"
          />
          {!menu.approved && (
            <figcaption className="image-label">
              Bildexempel – visar inte exakt menyinnehåll
            </figcaption>
          )}
        </figure>
        <div className="menu-detail-copy">
          <span className="eyebrow">LIBANESISKA SMAKER</span>
          <h1>{menu.name}</h1>
          <p className="detail-price">
            {menu.pricePerPerson === null ? (
              "Pris enligt offert"
            ) : (
              <>
                {menu.pricePerPerson} <span>kr/person</span>
              </>
            )}
          </p>
          <p>{menu.description}</p>
          {menu.meze.length > 0 && (
            <>
              <h2>Det här ingår</h2>
              <ul className="meze-list">
                {menu.meze.map((dish) => (
                  <li key={dish}>{dish}</li>
                ))}
              </ul>
            </>
          )}
          {menu.grill && (
            <>
              <h2>Från grillen</h2>
              <p>{menu.grill}</p>
            </>
          )}
          {menu.pricePerPerson === null && (
            <p>
              Välj kalla och varma meze, något från grillen eller en söt
              avslutning. Vi bekräftar rätter, mängder och pris tillsammans med
              dig.
            </p>
          )}
          {menu.allergensVerified && menu.allergens.length > 0 && (
            <p>
              <strong>Allergener:</strong> {menu.allergens.join(", ")}.
            </p>
          )}
          <p className="field-hint">
            Fråga oss om mängder, allergener och specialkost. Menyns meze och
            grill visas separat; innehållet bekräftas av företaget.
          </p>
          <Link
            className="btn btn-primary choose-menu"
            href={`/catering/forfragan?meny=${encodeURIComponent(menu.id)}`}
          >
            Välj denna meny
          </Link>
          <ContactActions contact={catalog.contact} menuName={menu.name} />
        </div>
      </section>
      {menu.pricePerPerson === null && (
        <section className="hospitality-section inquiry-section">
          <h2>Skapa din egen catering</h2>
          <p>
            Markera dina favoriter och berätta hur många ni blir. Pris enligt
            offert.
          </p>
          <CateringInquiry catalog={catalog} selectedMenu={menu.id} />
        </section>
      )}
      <p className="back-link">
        <Link className="text-link" href="/catering">
          ← Till alla cateringmenyer
        </Link>
      </p>
    </div>
  );
}
