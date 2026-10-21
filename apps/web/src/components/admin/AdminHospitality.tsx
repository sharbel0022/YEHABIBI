"use client";

import { useState, type ReactNode } from "react";
import {
  hospitalityCatalogSchema,
  type CateringMenu,
  type HospitalityCatalog,
  type HospitalityContact,
  type Venue,
} from "@yehabibi/shared";
import { uploadAdminFile } from "@/lib/browser-upload";

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
const lines = (value: string) => value.split("\n");
const cleanLines = (value: string[]) =>
  value.map((part) => part.trim()).filter(Boolean);

export function AdminHospitality({
  initialCatalog,
  initialRevision,
}: {
  initialCatalog: HospitalityCatalog;
  initialRevision: number;
}) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [revision, setRevision] = useState(initialRevision);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [emailVerificationConfirmed, setEmailVerificationConfirmed] =
    useState(false);
  function menu<K extends keyof CateringMenu>(
    index: number,
    key: K,
    value: CateringMenu[K],
  ) {
    setCatalog((old) => ({
      ...old,
      menus: old.menus.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]: value,
              ...(["allergens", "meze", "grill"].includes(key)
                ? { allergensVerified: false }
                : {}),
            }
          : item,
      ),
    }));
  }
  function venue<K extends keyof Venue>(
    index: number,
    key: K,
    value: Venue[K],
  ) {
    setCatalog((old) => ({
      ...old,
      venues: old.venues.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    }));
  }
  function contact<K extends keyof HospitalityContact>(
    key: K,
    value: HospitalityContact[K],
  ) {
    if (key === "email") setEmailVerificationConfirmed(false);
    setCatalog((old) => ({
      ...old,
      contact: {
        ...old.contact,
        [key]: value,
        ...(key === "email" && old.contact.email !== value
          ? { emailVerified: false }
          : {}),
      },
    }));
  }
  async function upload(file: File | undefined, update: (url: string) => void) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setMessage("Laddar upp bilden…");
    try {
      update(await uploadAdminFile(file));
      setMessage("Bilden är uppladdad. Spara innehållet för att använda den.");
    } catch (reason) {
      setMessage("");
      setError(
        reason instanceof Error
          ? reason.message
          : "Bilden kunde inte laddas upp.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setMessage("");
    setError("");
    const parsed = hospitalityCatalogSchema.safeParse({
      ...catalog,
      menus: catalog.menus.map((item) => ({
        ...item,
        meze: cleanLines(item.meze),
        allergens: cleanLines(item.allergens),
      })),
      venues: catalog.venues.map((item) => ({
        ...item,
        facilities: cleanLines(item.facilities),
      })),
    });
    if (!parsed.success)
      return setError(
        parsed.error.issues
          .map((issue) => `${issue.path.join(" · ")}: ${issue.message}`)
          .slice(0, 4)
          .join(" "),
      );
    setBusy(true);
    try {
      const response = await fetch("/api/admin/hospitality", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog: parsed.data,
          revision,
          emailVerificationConfirmed,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Innehållet kunde inte sparas.");
      setCatalog(result.catalog);
      setRevision(result.revision);
      setEmailVerificationConfirmed(false);
      setMessage(
        "Sparat i den gemensamma databasen. Webbplatsen och mobilappen hämtar samma innehåll.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Innehållet kunde inte sparas.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="admin-panel hospitality-editor">
      <p className="admin-note">
        Spara utkast, kontrollera webb och mobil, godkänn sedan respektive
        uppgift. Arbetsnamnen Lokal 1–4 visas aldrig publikt. En lokal behöver
        egna bilder och bekräftade fakta före publicering.
      </p>
      {message && (
        <p role="status" className="form-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <fieldset className="plain-fieldset" disabled={busy}>
        <label className="hospitality-check">
          <input
            type="checkbox"
            checked={catalog.preview}
            onChange={(event) =>
              setCatalog((old) => ({ ...old, preview: event.target.checked }))
            }
          />{" "}
          Visa innehållsutkast och publiceringsstatus på webb och mobil
        </label>
        <p>
          Utkastläget tillåter granskning av menyskisser. Avpublicerade lokaler
          och obekräftade e-postadresser lämnas alltid utanför den publika
          katalogen.
        </p>
        <section aria-labelledby="content-menus">
          <h2 id="content-menus">Cateringmenyer</h2>
          <p>
            Priser anges i kronor per person. Tomt pris betyder Pris enligt
            offert. Behåll källornas menynamn och rättlistor tills köket har
            bekräftat eventuella skillnader.
          </p>
          {catalog.menus.map((item, index) => (
            <details key={item.id} className="hospitality-admin-section">
              <summary>
                {item.name} · {item.approved ? "Godkänd" : "Utkast"}
              </summary>
              <div className="admin-grid">
                <Field id={`menu-${index}-name`} label="Namn">
                  <input
                    id={`menu-${index}-name`}
                    value={item.name}
                    onChange={(event) =>
                      menu(index, "name", event.target.value)
                    }
                  />
                </Field>
                <Field id={`menu-${index}-slug`} label="Sidans slug">
                  <input
                    id={`menu-${index}-slug`}
                    value={item.slug}
                    onChange={(event) =>
                      menu(index, "slug", event.target.value)
                    }
                  />
                </Field>
                <Field id={`menu-${index}-description`} label="Beskrivning">
                  <textarea
                    id={`menu-${index}-description`}
                    value={item.description}
                    onChange={(event) =>
                      menu(index, "description", event.target.value)
                    }
                  />
                </Field>
                <Field
                  id={`menu-${index}-price`}
                  label="Pris per person, kr (tomt för offert)"
                >
                  <input
                    id={`menu-${index}-price`}
                    type="number"
                    min="0"
                    max="100000"
                    step="0.01"
                    value={item.pricePerPerson ?? ""}
                    onChange={(event) =>
                      menu(
                        index,
                        "pricePerPerson",
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                      )
                    }
                  />
                </Field>
                <Field id={`menu-${index}-meze`} label="Meze, en rätt per rad">
                  <textarea
                    id={`menu-${index}-meze`}
                    rows={6}
                    value={item.meze.join("\n")}
                    onChange={(event) =>
                      menu(index, "meze", lines(event.target.value))
                    }
                  />
                </Field>
                <Field id={`menu-${index}-grill`} label="Grill som ingår">
                  <textarea
                    id={`menu-${index}-grill`}
                    value={item.grill || ""}
                    onChange={(event) =>
                      menu(index, "grill", event.target.value || null)
                    }
                  />
                </Field>
                <Field
                  id={`menu-${index}-allergens`}
                  label="Kökets bekräftade allergener, en per rad"
                >
                  <textarea
                    id={`menu-${index}-allergens`}
                    value={item.allergens.join("\n")}
                    onChange={(event) =>
                      menu(index, "allergens", lines(event.target.value))
                    }
                  />
                </Field>
                <Field id={`menu-${index}-image`} label="Bildadress">
                  <input
                    id={`menu-${index}-image`}
                    value={item.image}
                    onChange={(event) =>
                      menu(index, "image", event.target.value)
                    }
                  />
                </Field>
                <Field
                  id={`menu-${index}-alt`}
                  label="Alternativtext för bilden"
                >
                  <input
                    id={`menu-${index}-alt`}
                    value={item.imageAlt}
                    onChange={(event) =>
                      menu(index, "imageAlt", event.target.value)
                    }
                  />
                </Field>
                <Field
                  id={`menu-${index}-upload`}
                  label="Ladda upp godkänd menybild"
                >
                  <input
                    id={`menu-${index}-upload`}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) =>
                      void upload(event.target.files?.[0], (url) =>
                        menu(index, "image", url),
                      )
                    }
                  />
                </Field>
              </div>
              <label className="hospitality-check">
                <input
                  type="checkbox"
                  checked={item.allergensVerified}
                  onChange={(event) =>
                    menu(index, "allergensVerified", event.target.checked)
                  }
                />{" "}
                Köket har verifierat allergeninformationen. Tom lista är ingen
                generell garanti om allergenfri mat.
              </label>
              <label className="hospitality-check">
                <input
                  type="checkbox"
                  checked={item.approved}
                  onChange={(event) =>
                    menu(index, "approved", event.target.checked)
                  }
                />{" "}
                Innehåll, pris och bildrättigheter är kontrollerade
              </label>
              <label className="hospitality-check">
                <input
                  type="checkbox"
                  checked={item.published}
                  onChange={(event) =>
                    menu(index, "published", event.target.checked)
                  }
                />{" "}
                Visa menyn (utkast märks tills uppgifterna är godkända)
              </label>
            </details>
          ))}
        </section>
        <section aria-labelledby="content-dishes">
          <h2 id="content-dishes">Plockmeny och rätter</h2>
          <p>
            Rätterna används i cateringförfrågningar. Inget totalpris beräknas.
          </p>
          {catalog.dishes.map((dish, index) => (
            <div key={dish.id} className="hospitality-admin-section">
              <div className="admin-grid">
                <Field id={`dish-${index}-name`} label="Rättens namn">
                  <input
                    id={`dish-${index}-name`}
                    value={dish.name}
                    onChange={(event) =>
                      setCatalog((old) => ({
                        ...old,
                        dishes: old.dishes.map((item, at) =>
                          at === index
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                </Field>
                <Field id={`dish-${index}-category`} label="Kategori">
                  <input
                    id={`dish-${index}-category`}
                    list="dish-categories"
                    value={dish.category}
                    onChange={(event) =>
                      setCatalog((old) => ({
                        ...old,
                        dishes: old.dishes.map((item, at) =>
                          at === index
                            ? { ...item, category: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                </Field>
              </div>
              <label className="hospitality-check">
                <input
                  type="checkbox"
                  checked={dish.approved}
                  onChange={(event) =>
                    setCatalog((old) => ({
                      ...old,
                      dishes: old.dishes.map((item, at) =>
                        at === index
                          ? { ...item, approved: event.target.checked }
                          : item,
                      ),
                    }))
                  }
                />{" "}
                Godkänd rätt
              </label>
              <label className="hospitality-check">
                <input
                  type="checkbox"
                  checked={dish.published}
                  onChange={(event) =>
                    setCatalog((old) => ({
                      ...old,
                      dishes: old.dishes.map((item, at) =>
                        at === index
                          ? { ...item, published: event.target.checked }
                          : item,
                      ),
                    }))
                  }
                />{" "}
                Visa i plockmenyn
              </label>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setCatalog((old) => ({
                    ...old,
                    dishes: old.dishes.filter((_, at) => at !== index),
                  }))
                }
              >
                Ta bort ur innehållskatalogen
              </button>
            </div>
          ))}
          <datalist id="dish-categories">
            {[
              "Kalla meze",
              "Varma meze",
              "Grillrätter",
              "Vegetariska alternativ",
              "Bröd och såser",
              "Desserter",
            ].map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setCatalog((old) => ({
                ...old,
                dishes: [
                  ...old.dishes,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    category: "Kalla meze",
                    approved: false,
                    published: false,
                  },
                ],
              }))
            }
          >
            Lägg till rätt
          </button>
        </section>
        <section aria-labelledby="content-venues">
          <h2 id="content-venues">Festlokaler</h2>
          {catalog.venues.map((item, index) => (
            <details key={item.id} className="hospitality-admin-section">
              <summary>
                {item.name} ·{" "}
                {item.published ? "Publicerad" : "Opublicerat utkast"}
              </summary>
              <div className="admin-grid">
                <Field id={`venue-${index}-name`} label="Godkänt lokalnamn">
                  <input
                    id={`venue-${index}-name`}
                    value={item.name}
                    onChange={(event) =>
                      venue(index, "name", event.target.value)
                    }
                  />
                </Field>
                <Field
                  id={`venue-${index}-slug`}
                  label="Slug från verkligt lokalnamn"
                >
                  <input
                    id={`venue-${index}-slug`}
                    value={item.slug}
                    onChange={(event) =>
                      venue(index, "slug", event.target.value)
                    }
                  />
                </Field>
                <Field id={`venue-${index}-description`} label="Beskrivning">
                  <textarea
                    id={`venue-${index}-description`}
                    rows={4}
                    value={item.description}
                    onChange={(event) =>
                      venue(index, "description", event.target.value)
                    }
                  />
                </Field>
                <Field
                  id={`venue-${index}-capacity`}
                  label="Verifierad maxkapacitet"
                >
                  <input
                    id={`venue-${index}-capacity`}
                    type="number"
                    min="1"
                    max="100000"
                    value={item.capacity ?? ""}
                    onChange={(event) =>
                      venue(
                        index,
                        "capacity",
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                      )
                    }
                  />
                </Field>
                <Field
                  id={`venue-${index}-address`}
                  label="Lokalens egen adress"
                >
                  <input
                    id={`venue-${index}-address`}
                    value={item.address}
                    onChange={(event) =>
                      venue(index, "address", event.target.value)
                    }
                  />
                </Field>
                <Field
                  id={`venue-${index}-phone`}
                  label="Verifierad bokningstelefon"
                >
                  <input
                    id={`venue-${index}-phone`}
                    type="tel"
                    value={item.phone}
                    onChange={(event) =>
                      venue(index, "phone", event.target.value)
                    }
                  />
                </Field>
                <Field
                  id={`venue-${index}-facilities`}
                  label="Verifierade faciliteter, en per rad"
                >
                  <textarea
                    id={`venue-${index}-facilities`}
                    value={item.facilities.join("\n")}
                    onChange={(event) =>
                      venue(index, "facilities", lines(event.target.value))
                    }
                  />
                </Field>
              </div>
              <h3>Bildgalleri</h3>
              {item.images.map((image, imageIndex) => (
                <div key={imageIndex} className="hospitality-admin-section">
                  <div className="admin-grid">
                    <Field
                      id={`venue-${index}-image-${imageIndex}`}
                      label="Bildadress"
                    >
                      <input
                        id={`venue-${index}-image-${imageIndex}`}
                        value={image.src}
                        onChange={(event) =>
                          venue(
                            index,
                            "images",
                            item.images.map((entry, at) =>
                              at === imageIndex
                                ? { ...entry, src: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field
                      id={`venue-${index}-alt-${imageIndex}`}
                      label="Bildens alternativtext"
                    >
                      <input
                        id={`venue-${index}-alt-${imageIndex}`}
                        value={image.alt}
                        onChange={(event) =>
                          venue(
                            index,
                            "images",
                            item.images.map((entry, at) =>
                              at === imageIndex
                                ? { ...entry, alt: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      venue(
                        index,
                        "images",
                        item.images.filter((_, at) => at !== imageIndex),
                      )
                    }
                  >
                    Ta bort bild
                  </button>
                </div>
              ))}
              <Field
                id={`venue-${index}-upload`}
                label="Ladda upp en bild som hör till lokalen"
              >
                <input
                  id={`venue-${index}-upload`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) =>
                    void upload(event.target.files?.[0], (url) =>
                      venue(index, "images", [
                        ...item.images,
                        { src: url, alt: `Bild av ${item.name}` },
                      ]),
                    )
                  }
                />
              </Field>
              <button
                type="button"
                className="btn"
                disabled={item.images.length >= 12}
                onClick={() =>
                  venue(index, "images", [...item.images, { src: "", alt: "" }])
                }
              >
                Lägg till bildadress
              </button>
              <label className="hospitality-check">
                <input
                  type="checkbox"
                  checked={item.approved}
                  onChange={(event) =>
                    venue(index, "approved", event.target.checked)
                  }
                />{" "}
                Lokalens fakta, egna foton och publiceringsrätt är bekräftade
              </label>
              <label className="hospitality-check">
                <input
                  type="checkbox"
                  checked={item.published}
                  onChange={(event) =>
                    venue(index, "published", event.target.checked)
                  }
                />{" "}
                Publicera lokalen och dess detaljsida
              </label>
            </details>
          ))}
        </section>
        <section aria-labelledby="content-contact">
          <h2 id="content-contact">Kontakt och företagsuppgifter</h2>
          <div className="admin-grid">
            {(
              [
                ["phone", "Telefon"],
                ["address", "Kontaktadress"],
                ["city", "Ort"],
                ["email", "Cateringens e-postadress"],
                ["mapsUrl", "Kartlänk"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} id={`contact-${key}`} label={label}>
                <input
                  id={`contact-${key}`}
                  type={
                    key === "email" ? "email" : key === "phone" ? "tel" : "text"
                  }
                  value={catalog.contact[key]}
                  onChange={(event) => contact(key, event.target.value)}
                />
              </Field>
            ))}
          </div>
          <label className="hospitality-check">
            <input
              type="checkbox"
              checked={catalog.contact.emailVerified}
              onChange={(event) => {
                contact("emailVerified", event.target.checked);
                setEmailVerificationConfirmed(event.target.checked);
              }}
            />{" "}
            Ägaren har bekräftat den angivna mottagaradressen. En ändrad adress
            kräver ny bekräftelse.
          </label>
          <label className="hospitality-check">
            <input
              type="checkbox"
              checked={catalog.contact.approved}
              onChange={(event) => contact("approved", event.target.checked)}
            />{" "}
            Företagets kontaktuppgifter är godkända för publicering
          </label>
          <h3>Officiella sociala medier</h3>
          {catalog.contact.socialLinks.map((social, index) => (
            <div key={index} className="hospitality-admin-section">
              <div className="admin-grid">
                <Field id={`social-${index}-label`} label="Kanal">
                  <input
                    id={`social-${index}-label`}
                    value={social.label}
                    onChange={(event) =>
                      contact(
                        "socialLinks",
                        catalog.contact.socialLinks.map((item, at) =>
                          at === index
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
                <Field id={`social-${index}-url`} label="Officiell HTTPS-länk">
                  <input
                    id={`social-${index}-url`}
                    value={social.url}
                    onChange={(event) =>
                      contact(
                        "socialLinks",
                        catalog.contact.socialLinks.map((item, at) =>
                          at === index
                            ? { ...item, url: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  contact(
                    "socialLinks",
                    catalog.contact.socialLinks.filter((_, at) => at !== index),
                  )
                }
              >
                Ta bort kanal
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            disabled={catalog.contact.socialLinks.length >= 6}
            onClick={() =>
              contact("socialLinks", [
                ...catalog.contact.socialLinks,
                { label: "", url: "" },
              ])
            }
          >
            Lägg till officiell kanal
          </button>
        </section>
        <div className="hospitality-admin-save">
          <button type="submit" className="btn btn-primary">
            {busy ? "Sparar…" : "Spara innehållet"}
          </button>
          <a className="btn" href="/" target="_blank" rel="noreferrer">
            Öppna webbplatsen för kontroll
          </a>
        </div>
      </fieldset>
    </form>
  );
}
