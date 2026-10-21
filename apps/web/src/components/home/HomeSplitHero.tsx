import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HospitalityCatalog } from "@yehabibi/shared";
import styles from "./HomeSplitHero.module.css";

export function HomeSplitHero({ catalog }: { catalog: HospitalityCatalog }) {
  const food = catalog.menus.find((menu) => menu.approved && menu.image);
  const venuePhoto = catalog.venues.find((venue) => venue.images.length)?.images[0];
  const panels = [
    {
      href: "/catering",
      title: "Catering",
      description: (
        <>
          Tre färdiga menyer och en egen plockmeny.
          <br />
          Vi planerar maten tillsammans med dig.
        </>
      ),
      image: food?.image || "/images/catering-fest/meze.webp",
      alt: food?.imageAlt || "Bildexempel: ostrullar och kubbe på serveringsfat",
      example: !food,
      position: "47% center",
    },
    {
      href: "/festlokal",
      title: "Fest",
      description:
        "Boka festlokal för bröllop, födelsedag och speciella event – all bokning sker via telefon.",
      image: venuePhoto?.src || "/images/catering-fest/dukning.webp",
      alt: venuePhoto?.alt || "Bildexempel: festdukning med blommor och glas",
      example: !venuePhoto,
      position: "50% center",
    },
  ];

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
          <Image
            className={styles.photo}
            src={panel.image}
            alt={panel.alt}
            fill
            sizes="(max-width: 700px) 100vw, 50vw"
            preload
            // HTTPS images from the admin catalog retain the existing delivery
            // policy; local assets use Next's responsive image optimization.
            unoptimized={!panel.image.startsWith("/")}
            style={{ objectPosition: panel.position }}
          />
          <span className={styles.shade} aria-hidden="true" />
          <span className={styles.interactionShade} aria-hidden="true" />
          {panel.example && <span className={styles.imageLabel}>Bildexempel</span>}
          <div className={styles.content}>
            <span className={styles.kicker}>{panel.title.toUpperCase()}</span>
            <h2 id={`home-panel-${index}`} className={styles.title}>
              {panel.title}
            </h2>
            <p id={`home-description-${index}`} className={styles.description}>
              {panel.description}
            </p>
          </div>
          <span className={styles.arrow} aria-hidden="true">
            <ArrowRight size={19} strokeWidth={1.2} />
          </span>
        </Link>
      ))}
    </section>
  );
}
