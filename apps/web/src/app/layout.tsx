import type { Metadata, Viewport } from 'next';
import type { CSSProperties } from 'react';
import { designColors } from '@yehabibi/shared';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { LocalStructuredData } from '@/components/LocalStructuredData';
import { PwaRegister } from '@/components/PwaRegister';
import { TestModeBanner } from '@/components/TestModeBanner';
import { getCatalog, getSettings } from '@/lib/data';
import { BRAND, isIndexable, siteUrl } from '@/lib/config';
import './globals.css';

// Även startsidans paket och sidfotens kontaktuppgifter ska följa adminändringar.
export const dynamic = 'force-dynamic';

export async function generateMetadata():Promise<Metadata> {
  const settings=await getSettings();
  return {
  metadataBase: new URL(siteUrl()),
  title: { default: `${settings.brand_name} | Matpaket och libanesisk catering${settings.location_city?` i ${settings.location_city}`:''}`, template: `%s | ${settings.brand_name}` },
  description: settings.description,
  applicationName: BRAND,
  robots: isIndexable() ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: { type: 'website', locale: 'sv_SE', title: `${BRAND} – Libanesisk catering`, images: ['/images/hero.webp'] }
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: designColors.green };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const catalog = await getCatalog();
  const settings = catalog.settings;
  return <html lang="sv" data-scroll-behavior="smooth">
    <body style={{ '--green': designColors.green, '--red': designColors.red, '--sand': designColors.soft, '--white': designColors.white } as CSSProperties}>
      <a href="#main" className="skip-link">Hoppa till innehåll</a>
      <TestModeBanner initialTestMode={catalog.test_mode === true}/>
      <Header />
      <main id="main">{children}</main>
      <Footer settings={settings} />
      <PwaRegister />
      {isIndexable() && <LocalStructuredData settings={settings} openingHours={catalog.opening_hours} />}
    </body>
  </html>;
}
