import { z } from "zod";

export type CateringMenu = {
  id: string;
  slug: string;
  name: string;
  description: string;
  pricePerPerson: number | null;
  meze: string[];
  grill: string | null;
  image: string;
  imageAlt: string;
  allergens: string[];
  allergensVerified: boolean;
  approved: boolean;
  published: boolean;
};
export type CateringDish = {
  id: string;
  name: string;
  category: string;
  approved: boolean;
  published: boolean;
};
export type Venue = {
  id: string;
  slug: string;
  name: string;
  description: string;
  capacity: number | null;
  facilities: string[];
  address: string;
  phone: string;
  images: { src: string; alt: string }[];
  approved: boolean;
  published: boolean;
};
export type HospitalityContact = {
  phone: string;
  address: string;
  city: string;
  email: string;
  mapsUrl: string;
  socialLinks: { label: string; url: string }[];
  approved: boolean;
  emailVerified: boolean;
};
export type HospitalityCatalog = {
  menus: CateringMenu[];
  dishes: CateringDish[];
  venues: Venue[];
  contact: HospitalityContact;
  preview: boolean;
};

const text = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => text(max).min(1);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(100);
const secureUrl = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Använd en HTTPS-adress utan inloggningsuppgifter.");
const imageUrl = z.union([
  secureUrl,
  z
    .string()
    .regex(/^\/images\/[a-zA-Z0-9._/-]+$/)
    .refine((value) => !value.includes("..")),
]);
const phone = text(35).refine(
  (value) => !value || Boolean(phoneHref(value)),
  "Kontrollera telefonnumret.",
);

export const cateringMenuSchema = z
  .object({
    id: requiredText(100),
    slug: slug.refine(
      (value) => value !== "forfragan",
      "Sluggen forfragan är reserverad för cateringens kontaktsida.",
    ),
    name: requiredText(120),
    description: text(1200),
    pricePerPerson: z.number().min(0).max(100000).nullable(),
    meze: z.array(requiredText(150)).max(40),
    grill: text(200).nullable(),
    image: z.union([imageUrl, z.literal("")]),
    imageAlt: text(250),
    allergens: z.array(requiredText(100)).max(30).default([]),
    allergensVerified: z.boolean().default(false),
    approved: z.boolean(),
    published: z.boolean(),
  })
  .superRefine((value, context) => {
    if (
      value.approved &&
      (!value.image || !value.imageAlt || !value.description)
    ) {
      context.addIssue({
        code: "custom",
        message: "Godkänd meny behöver beskrivning, bild och alternativtext.",
      });
    }
  });
export const cateringDishSchema = z.object({
  id: requiredText(100),
  name: requiredText(120),
  category: requiredText(80),
  approved: z.boolean(),
  published: z.boolean(),
});
export const venueSchema = z
  .object({
    id: requiredText(100),
    slug,
    name: requiredText(120),
    description: text(2000),
    capacity: z.number().int().min(1).max(100000).nullable(),
    facilities: z.array(requiredText(150)).max(40),
    address: text(250),
    phone,
    images: z
      .array(z.object({ src: imageUrl, alt: requiredText(250) }))
      .max(12),
    approved: z.boolean(),
    published: z.boolean(),
  })
  .superRefine((value, context) => {
    if (
      value.published &&
      (!value.approved ||
        !value.description ||
        !value.capacity ||
        !value.address ||
        !value.phone ||
        !value.images.length ||
        /^lokal[ -]?\d+$/i.test(value.name) ||
        /^lokal-\d+$/.test(value.slug))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Publicering kräver godkänt verkligt namn och slug, beskrivning, kapacitet, adress, telefon och egna bilder.",
      });
    }
  });
export const hospitalityContactSchema = z
  .object({
    phone,
    address: text(250),
    city: text(100),
    email: z.union([z.email().max(200), z.literal("")]),
    mapsUrl: z.union([secureUrl, z.literal("")]),
    socialLinks: z
      .array(z.object({ label: requiredText(50), url: secureUrl }))
      .max(6),
    approved: z.boolean(),
    emailVerified: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.emailVerified && !value.email)
      context.addIssue({
        code: "custom",
        message: "En verifierad e-postadress får inte vara tom.",
      });
    if (value.approved && (!value.phone || !value.address || !value.city))
      context.addIssue({
        code: "custom",
        message:
          "Bekräfta telefon, adress och ort innan kontaktuppgifterna godkänns.",
      });
  });
export const hospitalityCatalogSchema = z
  .object({
    menus: z.array(cateringMenuSchema).length(4),
    dishes: z.array(cateringDishSchema).max(100),
    venues: z.array(venueSchema).length(4),
    contact: hospitalityContactSchema,
    preview: z.boolean(),
  })
  .superRefine((value, context) => {
    for (const [key, items] of [
      ["menus", value.menus],
      ["dishes", value.dishes],
      ["venues", value.venues],
    ] as const) {
      if (new Set(items.map((item) => item.id)).size !== items.length)
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Varje post behöver ett eget ID.",
        });
    }
    for (const [key, items] of [
      ["menus", value.menus],
      ["venues", value.venues],
    ] as const) {
      if (new Set(items.map((item) => item.slug)).size !== items.length)
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Varje sida behöver en unik slug.",
        });
    }
    if (
      !value.preview &&
      (!value.contact.approved ||
        value.menus.some(
          (menu) =>
            menu.published && (!menu.approved || !menu.allergensVerified),
        ) ||
        value.dishes.some((dish) => dish.published && !dish.approved))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Godkänn alla synliga menyer, verifiera allergeninformationen och bekräfta rätter och kontaktuppgifter innan utkastläget stängs av.",
      });
    }
  });

/** The public response contains only published records, so its lists can be shorter. */
export const publicHospitalityCatalogSchema = z
  .object({
    menus: z.array(cateringMenuSchema).max(4),
    dishes: z.array(cateringDishSchema).max(100),
    venues: z.array(venueSchema).max(4),
    contact: hospitalityContactSchema,
    preview: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.venues.some((venue) => !venue.approved || !venue.published))
      context.addIssue({
        code: "custom",
        message:
          "Den publika katalogen får bara innehålla publicerade och godkända lokaler.",
      });
    if (
      value.menus.some(
        (menu) =>
          !menu.published ||
          (!value.preview && (!menu.approved || !menu.allergensVerified)),
      ) ||
      value.dishes.some(
        (dish) => !dish.published || (!value.preview && !dish.approved),
      )
    )
      context.addIssue({
        code: "custom",
        message:
          "Den publika katalogen innehåller opublicerat eller obekräftat innehåll.",
      });
    if (!value.contact.emailVerified && value.contact.email)
      context.addIssue({
        code: "custom",
        message: "Den publika katalogen får inte innehålla obekräftad e-post.",
      });
  });

const firstMeze = ["Hummus", "Muhammara", "Baba Ganoush", "Labne", "Fatoush"];
const menuDraft = {
  approved: false,
  published: true,
  allergens: [],
  allergensVerified: false,
};
export const defaultHospitalityCatalog: HospitalityCatalog = {
  menus: [
    {
      id: "meny-1",
      slug: "meny-1",
      name: "Lilla Meny 1 – 5 Meze",
      description: "Fem meze och mixgrill med nöt- och kycklingspett.",
      pricePerPerson: 250,
      meze: [...firstMeze],
      grill: "Mixgrill (nöt- och kycklingspett)",
      image: "/images/catering-fest/meze.webp",
      imageAlt: "Bildexempel på libanesiska meze – slutlig menybild inväntas",
      ...menuDraft,
    },
    {
      id: "meny-2",
      slug: "meny-2",
      name: "Meny 2 – 8 Meze",
      description: "Kalla och varma meze tillsammans med mixgrill.",
      pricePerPerson: 300,
      meze: [...firstMeze, "Ostrulle", "Sambosak", "Kubbe"],
      grill: "Mixgrill (nöt- och kycklingspett)",
      image: "/images/catering-fest/grill.webp",
      imageAlt: "Bildexempel på grill och meze – slutlig menybild inväntas",
      ...menuDraft,
    },
    {
      id: "meny-3",
      slug: "meny-3",
      name: "Meny 3 – 10 Meze",
      description:
        "Tio meze och Mixgrill Special med nöt-, kyckling- och lammspett.",
      pricePerPerson: 399,
      meze: [
        "Hummus",
        "Muhammara",
        "Baba Ganoush",
        "Labne",
        "Tarator Djaj (kycklingröra)",
        "Fatoush",
        "Tabbouleh",
        "Kubbe",
        "Ostrulle",
        "Sambosak",
      ],
      grill: "Mixgrill Special (nöt-, kyckling- och lammspett)",
      image: "/images/catering-fest/catering.webp",
      imageAlt:
        "Bildexempel på en libanesisk buffé – slutlig menybild inväntas",
      ...menuDraft,
    },
    {
      id: "plockmeny",
      slug: "plockmeny",
      name: "Plockmeny – Skapa din egen catering",
      description:
        "Välj önskade rätter och antal personer. Innehåll och pris bekräftas i personlig kontakt.",
      pricePerPerson: null,
      meze: [],
      grill: null,
      image: "/images/catering-fest/meze.webp",
      imageAlt:
        "Bildexempel för plockmeny – innehåll och slutlig bild bekräftas av ägaren",
      ...menuDraft,
    },
  ],
  dishes: firstMeze
    .map((name, index) => ({
      id: `meze-${index + 1}`,
      name,
      category: name === "Fatoush" ? "Sallader" : "Kalla meze",
      approved: false,
      published: true,
    }))
    .concat([
      {
        id: "meze-6",
        name: "Ostrulle",
        category: "Varma meze",
        approved: false,
        published: true,
      },
      {
        id: "meze-7",
        name: "Sambosak",
        category: "Varma meze",
        approved: false,
        published: true,
      },
      {
        id: "meze-8",
        name: "Kubbe",
        category: "Varma meze",
        approved: false,
        published: true,
      },
      {
        id: "meze-9",
        name: "Tarator Djaj (kycklingröra)",
        category: "Kalla meze",
        approved: false,
        published: true,
      },
      {
        id: "meze-10",
        name: "Tabbouleh",
        category: "Sallader",
        approved: false,
        published: true,
      },
      {
        id: "grill-1",
        name: "Mixgrill (nöt- och kycklingspett)",
        category: "Grillrätter",
        approved: false,
        published: true,
      },
      {
        id: "grill-2",
        name: "Mixgrill Special (nöt-, kyckling- och lammspett)",
        category: "Grillrätter",
        approved: false,
        published: true,
      },
      { id: "meze-11", name: "Falafel", category: "Varma meze", approved: false, published: true },
      { id: "grill-3", name: "Kycklingspett", category: "Grillrätter", approved: false, published: true },
      { id: "grill-4", name: "Nötspett", category: "Grillrätter", approved: false, published: true },
      { id: "grill-5", name: "Lammspett", category: "Grillrätter", approved: false, published: true },
      { id: "side-1", name: "Libabröd", category: "Tillbehör", approved: false, published: true },
      { id: "side-2", name: "Ris", category: "Tillbehör", approved: false, published: true },
      { id: "side-3", name: "Såser", category: "Tillbehör", approved: false, published: true },
      { id: "dessert-1", name: "Baklava", category: "Desserter", approved: false, published: true },
    ]),
  venues: Array.from({ length: 4 }, (_, index) => ({
    id: `lokal-${index + 1}`,
    slug: `lokal-${index + 1}`,
    name: `Lokal ${index + 1}`,
    description: "",
    capacity: null,
    facilities: [],
    address: "",
    phone: "",
    images: [],
    approved: false,
    published: false,
  })),
  contact: {
    phone: "021-41 57 11",
    address: "Slakterigatan 14, 721 32 Västerås",
    city: "Västerås",
    email: "sharbelrasho@gmail.com",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Slakterigatan%2014%2C%20721%2032%20V%C3%A4ster%C3%A5s",
    socialLinks: [],
    approved: false,
    emailVerified: true,
  },
  preview: true,
};

/** Only this projection may reach public server components, API responses or Expo. */
export function publicHospitalityCatalog(
  catalog: HospitalityCatalog,
): HospitalityCatalog {
  return {
    menus: catalog.menus
      .filter(
        (menu) =>
          menu.published &&
          ((menu.approved && menu.allergensVerified) || catalog.preview),
      )
      .map((menu) => ({
        ...menu,
        allergens: menu.allergensVerified ? menu.allergens : [],
      })),
    dishes: catalog.dishes.filter(
      (dish) => dish.published && (dish.approved || catalog.preview),
    ),
    venues: catalog.venues.filter(
      (venue) =>
        venue.published &&
        venue.approved &&
        venueSchema.safeParse(venue).success,
    ),
    contact: {
      ...catalog.contact,
      email: catalog.contact.emailVerified ? catalog.contact.email : "",
    },
    preview: catalog.preview,
  };
}

export function phoneHref(value: string): string {
  const normalized = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+?\d{7,15}$/.test(normalized)) return "";
  return `tel:${normalized.startsWith("00") ? `+${normalized.slice(2)}` : normalized.startsWith("0") ? `+46${normalized.slice(1)}` : normalized}`;
}
export type CateringEmailFields = {
  name?: string;
  phone?: string;
  email?: string;
  people?: number | string;
  date?: string;
  time?: string;
  fulfillment?: string;
  menuName?: string;
  extraDishes?: string[];
  allergies?: string;
  message?: string;
};
export function buildCateringEmail(fields: CateringEmailFields = {}): string {
  return [
    "Hej Yei Habibi!",
    "",
    "Jag vill göra en cateringförfrågan.",
    "",
    `Namn: ${fields.name || ""}`,
    `Telefon: ${fields.phone || ""}`,
    `E-post: ${fields.email || ""}`,
    `Antal personer: ${fields.people || ""}`,
    `Datum: ${fields.date || ""}`,
    `Önskad tid: ${fields.time || ""}`,
    `Hämtning eller leverans: ${fields.fulfillment || ""}`,
    `Vald meny: ${fields.menuName || ""}`,
    `Önskade extra rätter: ${(fields.extraDishes || []).join(", ")}`,
    `Allergier och specialönskemål: ${fields.allergies || ""}`,
    `Övrigt meddelande: ${fields.message || ""}`,
    "",
    "Jag inväntar er personliga bekräftelse av innehåll, pris och tillgänglighet.",
  ].join("\n");
}
export function cateringMailto(
  email: string,
  menuName: string,
  body?: string,
): string | null {
  if (!z.email().safeParse(email).success || /[\r\n]/.test(email)) return null;
  return `mailto:${encodeURIComponent(email).replace("%40", "@")}?subject=${encodeURIComponent(`Cateringförfrågan – ${menuName.replace(/[\r\n]/g, " ")}`)}&body=${encodeURIComponent(body || buildCateringEmail({ menuName }))}`;
}
