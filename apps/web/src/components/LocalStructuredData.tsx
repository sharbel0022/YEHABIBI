import type { HospitalityContact } from "@yehabibi/shared";
import { siteUrl } from "@/lib/config";

export function LocalStructuredData({
  contact,
}: {
  contact: HospitalityContact;
}) {
  const business = {
    "@context": "https://schema.org",
    "@type": "FoodEstablishment",
    name: "Yei Habibi",
    url: siteUrl(),
    description: "Libanesisk catering och fest i Västerås.",
    servesCuisine: "Lebanese",
    hasMenu: `${siteUrl()}/catering`,
    telephone: contact.phone,
    address: contact.address,
    areaServed: { "@type": "City", name: contact.city },
    ...(contact.emailVerified ? { email: contact.email } : {}),
    sameAs: contact.socialLinks.map((link) => link.url),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(business).replace(/</g, "\\u003c"),
      }}
    />
  );
}
