import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "Om Yei Habibi",
  description:
    "Libanesisk mat att dela och tillfällen att minnas. Yei Habibi presenterar catering och festlokaler i Västerås, med personlig service via mejl och telefon.",
  alternates: { canonical: "/om-oss" },
};
export default function AboutPage() {
  return (
    <div className="shell hospitality-page">
      <section className="about-detail">
        <div>
          <span className="eyebrow">YEI HABIBI · CATERING &amp; FEST</span>
          <h1>
            Mat att dela.
            <br />
            Tillfällen att minnas.
          </h1>
          <p className="intro">
            Libanesiska smaker hör hemma där människor möts. Här presenterar vi
            catering för era tillfällen och hjälper er att planera festen.
          </p>
          <p>
            Välj bland tre menyer med meze och grill eller fråga om en egen
            plockmeny. Berätta om sällskapet och era önskemål, så pratar vi om
            maten och upplägget tillsammans.
          </p>
          <p>
            För frågor och bokning av festlokaler ringer du oss. Catering
            planerar vi via mejl eller telefon.
          </p>
          <div className="contact-actions">
            <Link className="btn btn-primary" href="/catering">
              Se cateringmenyer
            </Link>
            <Link className="btn btn-outline-light" href="/festlokal">
              Se festlokaler
            </Link>
          </div>
        </div>
        <figure className="detail-photo">
          <img
            src="/images/catering-fest/meze.webp"
            alt="Libanesiska varma meze från företagets bildmaterial"
            width={1080}
            height={719}
          />
          <figcaption className="image-label">Bildexempel</figcaption>
        </figure>
      </section>
    </div>
  );
}
