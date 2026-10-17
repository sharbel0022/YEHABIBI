import type { Metadata, Viewport } from 'next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { LocalStructuredData } from '@/components/LocalStructuredData';
import { PwaRegister } from '@/components/PwaRegister';
import { getSettings } from '@/lib/data';
import { BRAND, isIndexable, siteUrl } from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${BRAND} | Libanesisk catering i Västerås`, template: `%s | ${BRAND}` },
  description: 'Libanesisk catering till hemmet, bröllop, fester och företag i Västerås med omnejd. Se våra menyer och skicka en enkel beställningsförfrågan.',
  applicationName: BRAND,
  robots: isIndexable() ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: { type: 'website', locale: 'sv_SE', title: `${BRAND} – Libanesisk catering`, images: ['/images/hero.webp'] }
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#155A43' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return <html lang="sv">
    <body>
      <Header />
      <main id="main">{children}</main>
      <Footer settings={settings} />
      <PwaRegister />
      {isIndexable() && <LocalStructuredData settings={settings} />}
    </body>
  </html>;
}
