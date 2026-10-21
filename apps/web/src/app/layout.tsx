import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { designColors } from "@yehabibi/shared";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocalStructuredData } from "@/components/LocalStructuredData";
import { PwaRegister } from "@/components/PwaRegister";
import { TestModeBanner } from "@/components/TestModeBanner";
import { getHospitalityCatalog } from "@/lib/hospitality";
import { paymentRuntimeInfo } from "@/lib/payments";
import { isIndexable, siteUrl } from "@/lib/config";
import "./globals.css";
import "./hospitality.css";

// Även startsidans paket och sidfotens kontaktuppgifter ska följa adminändringar.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const catalog = await getHospitalityCatalog();
  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: "Yei Habibi | Catering & Fest",
      template: "%s | Yei Habibi",
    },
    description:
      "Libanesisk catering och fest i Västerås. Tre färdiga menyer och plockmeny med personlig kontakt via mejl eller telefon.",
    applicationName: "Yei Habibi",
    manifest: "/manifest.webmanifest",
    robots:
      isIndexable() && !catalog.preview
        ? { index: true, follow: true }
        : { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "sv_SE",
      title: "Yei Habibi – Catering & Fest",
      images: ["/images/catering-fest/catering.webp"],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: designColors.green,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [catalog, runtime] = await Promise.all([
    getHospitalityCatalog(),
    paymentRuntimeInfo(),
  ]);
  return (
    <html lang="sv" data-scroll-behavior="smooth">
      <body
        style={
          {
            "--green": designColors.green,
            "--red": designColors.red,
            "--sand": designColors.soft,
            "--white": designColors.white,
          } as CSSProperties
        }
      >
        <a href="#main" className="skip-link">
          Hoppa till innehåll
        </a>
        {runtime.isSimulation && <TestModeBanner initialTestMode />}
        <Header phone={catalog.contact.phone} />
        <main id="main">{children}</main>
        <Footer contact={catalog.contact} />
        <PwaRegister />
        {isIndexable() && !catalog.preview && catalog.contact.approved && (
          <LocalStructuredData contact={catalog.contact} />
        )}
      </body>
    </html>
  );
}
