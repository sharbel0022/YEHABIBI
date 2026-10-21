import type { Metadata } from "next";
import { HomeSplitHero } from "@/components/home/HomeSplitHero";

export const metadata: Metadata = {
  title: "Yei Habibi – Libanesisk catering & fest i Västerås",
  alternates: { canonical: "/" },
  description:
    "Yei Habibi – libanesisk catering i Västerås och festlokaler för era stora stunder. Tre meze-menyer och en egen plockmeny. Personlig kontakt via mejl och telefon.",
};

export default function HomePage() {
  return <HomeSplitHero />;
}
