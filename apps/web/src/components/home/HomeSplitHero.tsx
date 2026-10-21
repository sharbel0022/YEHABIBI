import Image from "next/image";
import Link from "next/link";
import styles from "./HomeSplitHero.module.css";

const panels = [
  {
    href: "/catering",
    title: "Catering",
    description:
      "Tre färdiga menyer och en egen plockmeny. Vi planerar maten tillsammans med dig.",
    image: "/images/home/catering.png",
  },
  {
    href: "/festlokal",
    title: "Fest",
    description:
      "Boka festlokal för bröllop, födelsedag och speciella event – all bokning sker via telefon.",
    image: "/images/home/fest.png",
  },
];

export function HomeSplitHero() {
  return (
    <section className={`home-split-hero ${styles.hero}`} aria-labelledby="home-title">
      <h1 id="home-title" className={styles.srOnly}>
        Ye Habibi – Catering &amp; Fest
      </h1>
      {panels.map((panel, index) => (
        <Link
          key={panel.href}
          href={panel.href}
          className={styles.panel}
          aria-labelledby={`home-panel-${index}`}
          aria-describedby={`home-description-${index}`}
        >
          {/* These exact user-supplied artworks include the visible text.
              Preserve the complete image and its original PNG bytes. */}
          <Image
            className={styles.artwork}
            src={panel.image}
            alt=""
            aria-hidden="true"
            width={724}
            height={724}
            sizes="(max-width: 900px) 100vw, 50vw"
            preload
            unoptimized
          />
          <span className={styles.interactionShade} aria-hidden="true" />
          <div className={styles.srOnly}>
            <h2 id={`home-panel-${index}`}>{panel.title}</h2>
            <p id={`home-description-${index}`}>{panel.description}</p>
          </div>
        </Link>
      ))}
    </section>
  );
}
