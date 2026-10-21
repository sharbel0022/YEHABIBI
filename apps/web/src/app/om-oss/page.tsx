import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Heart, Leaf, Quote, Star, UsersRound } from "lucide-react";
import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "Om Yei Habibi",
  description:
    "Libanesisk mat att dela och tillfällen att minnas. Yei Habibi presenterar catering och festlokaler i Västerås, med personlig service via mejl och telefon.",
  alternates: { canonical: "/om-oss" },
};

const values = [
  {
    icon: Heart,
    title: "Äkta libanesisk mat",
    description: "Libanesiska smaker och mat att dela.",
  },
  {
    icon: UsersRound,
    title: "Personlig service",
    description: "Vi planerar maten och upplägget tillsammans med dig.",
  },
  {
    icon: Star,
    title: "Unika festlokaler",
    description: "En inramning för ditt sällskap och ditt tillfälle.",
  },
  {
    icon: Leaf,
    title: "Hög kvalitet",
    description: "Omsorg om smakerna, råvarorna och detaljerna.",
  },
];

export default function AboutPage() {
  return (
    <div className={`brand-experience brand-story-page ${styles.page}`}>
      <img
        className={styles.photo}
        src="/images/hero.webp"
        alt=""
        width={1440}
        height={900}
        fetchPriority="high"
      />
      <section className={styles.inner} aria-labelledby="about-title">
        <div className={styles.copy}>
          <span className={styles.eyebrow}>OM OSS</span>
          <h1 className={styles.title} id="about-title">
            Vår passion,<br />din upplevelse.
          </h1>
          <p className={styles.intro}>
            Vi samlar människor kring libanesisk mat och minnesvärda tillfällen.
            Med catering, personlig service och festlokaler hjälper vi dig att
            planera ditt firande.
          </p>
        </div>

        <ul className={styles.values} aria-label="Det här står vi för">
          {values.map(({ icon: Icon, title, description }) => (
            <li className={styles.value} key={title}>
              <Icon size={27} strokeWidth={1.5} aria-hidden="true" />
              <h2>{title}</h2>
              <p>{description}</p>
            </li>
          ))}
        </ul>

        <figure className={styles.philosophy}>
          <Quote className={styles.quoteMark} size={23} strokeWidth={1.5} aria-hidden="true" />
          <blockquote>
            Vi tror att god mat och varm gästfrihet skapar minnen för livet.
          </blockquote>
          <figcaption><span aria-hidden="true">— </span>Ye Habibi<span className={styles.quoteLabel}> · Vår filosofi</span></figcaption>
        </figure>

        <nav className={styles.actions} aria-label="Upptäck Ye Habibi">
          <Link href="/catering">Upptäck vår catering<ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link href="/festlokal">Se våra festlokaler<ArrowUpRight size={16} aria-hidden="true" /></Link>
        </nav>
      </section>
    </div>
  );
}
