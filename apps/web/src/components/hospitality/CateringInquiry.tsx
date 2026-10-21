"use client";
import { useId, useState, type FormEvent } from "react";
import { Mail, X } from "lucide-react";
import {
  buildCateringEmail,
  cateringMailto,
  type CateringEmailFields,
  type HospitalityCatalog,
} from "@yehabibi/shared";
import { DishPhoto } from "@/components/catering/DishPhoto";
import { inquiryHref, menuDishNames } from "@/components/catering/presentation";
import styles from "./CateringInquiry.module.css";

export function CateringInquiry({
  catalog,
  selectedMenu = "plockmeny",
  initialMenuIds,
  initialDishIds = [],
}: {
  catalog: HospitalityCatalog;
  selectedMenu?: string;
  initialMenuIds?: string[];
  initialDishIds?: string[];
}) {
  const helpId = useId();
  const [menuIds, setMenuIds] = useState(() =>
    [...new Set(initialMenuIds ?? [selectedMenu])].filter((id) =>
      catalog.menus.some((menu) => menu.id === id),
    ),
  );
  const [dishIds, setDishIds] = useState(() =>
    [...new Set(initialDishIds)].filter((id) => {
      const dish = catalog.dishes.find((item) => item.id === id);
      const included = catalog.menus.filter((menu) => menuIds.includes(menu.id)).flatMap(menuDishNames);
      return !!dish && !included.includes(dish.name);
    }),
  );
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const menus = catalog.menus.filter((menu) => menuIds.includes(menu.id));
  const dishes = catalog.dishes.filter((dish) => dishIds.includes(dish.id));
  const includedDishes = [...new Set(menus.flatMap(menuDishNames))];
  const categories = [...new Set(catalog.dishes.map((dish) => dish.category))];
  const menuName = menus.map((menu) => menu.name).join("; ") || "Egen plockmeny";
  const canEmail =
    catalog.contact.emailVerified &&
    !!cateringMailto(catalog.contact.email, "Catering");

  function invalidateDraft() {
    setDraft("");
    setMessage(draft ? "Uppgifterna har ändrats. Förbered ett nytt mejlutkast." : "");
  }
  function persist(nextMenus: string[], nextDishes: string[]) {
    const url = new URL(window.location.href);
    url.search = new URL(inquiryHref(nextMenus, nextDishes), url.origin).search;
    window.history.replaceState(window.history.state, "", url);
  }
  function toggleMenu(id: string) {
    invalidateDraft();
    const nextMenus = menuIds.includes(id) ? menuIds.filter((value) => value !== id) : [...menuIds, id];
    const nextIncluded = catalog.menus.filter((menu) => nextMenus.includes(menu.id)).flatMap(menuDishNames);
    const nextDishes = dishIds.filter((dishId) => !nextIncluded.includes(catalog.dishes.find((dish) => dish.id === dishId)?.name || ""));
    setMenuIds(nextMenus);
    setDishIds(nextDishes);
    persist(nextMenus, nextDishes);
  }
  function toggleDish(id: string) {
    const dish = catalog.dishes.find((item) => item.id === id);
    if (!dish || includedDishes.includes(dish.name)) return;
    invalidateDraft();
    const next = dishIds.includes(id) ? dishIds.filter((value) => value !== id) : [...dishIds, id];
    setDishIds(next);
    persist(menuIds, next);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!menus.length && !dishes.length) {
      setMessage("Välj minst en meny eller rätt till din förfrågan.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const fields: CateringEmailFields = {
      name: String(form.get("name")),
      phone: String(form.get("phone")),
      email: String(form.get("email")),
      people: Number(form.get("people")),
      date: String(form.get("date")),
      time: String(form.get("time")),
      fulfillment: String(form.get("fulfillment")),
      menuName,
      extraDishes: dishes.map((dish) => dish.name),
      allergies: String(form.get("allergies")),
      message: String(form.get("message")),
    };
    setDraft(buildCateringEmail(fields));
    setMessage(
      "Ditt mejlutkast är förberett. Öppna det i ditt e-postprogram och skicka själv mejlet. Ingen förfrågan har skickats från webbplatsen.",
    );
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setMessage("Förfrågan har kopierats. Klistra in den i ett mejl och skicka till cateringadressen.");
    } catch {
      setMessage("Markera och kopiera förfrågan i textrutan nedan.");
    }
  }
  const draftHref = canEmail && draft
    ? cateringMailto(catalog.contact.email, menuName, draft)
    : null;
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (!catalog.menus.length && !catalog.dishes.length) {
    return <p>Inga menyer är publicerade just nu. Ring oss så hjälper vi dig med din catering.</p>;
  }
  return (
    <form className={`inquiry-form ${styles.form}`} onSubmit={submit} onChange={invalidateDraft}>
      <section className={styles.selection} aria-labelledby={`${helpId}-choices`}>
        <h2 id={`${helpId}-choices`}>Dina val</h2>
        <p className={styles.hint}>Menyer och rätter till din cateringförfrågan. Innehåll och pris bekräftas personligen.</p>
        {menus.length > 0 && (
          <ul className={styles.selectedMenus}>
            {menus.map((menu) => (
              <li key={menu.id}>
                <div>
                  <strong>{menu.name}</strong>
                  <span>{menu.pricePerPerson === null ? "Pris enligt offert" : `${menu.pricePerPerson} kr/person`}</span>
                </div>
                <button type="button" className={styles.remove} onClick={() => toggleMenu(menu.id)} aria-label={`Ta bort ${menu.name}`}>
                  <X size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {includedDishes.length > 0 && (
          <details className={styles.included} open>
            <summary>Det här ingår i dina valda menyer</summary>
            <ul className={styles.includedGrid}>
              {includedDishes.map((name) => (
                <li key={name}><DishPhoto name={name} /><span className={styles.includedName}>{name}</span></li>
              ))}
            </ul>
          </details>
        )}
        {dishes.length > 0 && (
          <div className={styles.chosenDishes}>
            <h3>Enskilda rätter och tillägg</h3>
            <ul className={styles.selectedDishes}>
              {dishes.map((dish) => (
                <li key={dish.id}>
                  <DishPhoto name={dish.name} className={styles.thumbnail} />
                  <span className={styles.selectedDishName}>{dish.name}</span>
                  <button type="button" className={styles.remove} onClick={() => toggleDish(dish.id)} aria-label={`Ta bort ${dish.name}`}>
                    <X size={18} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!menus.length && !dishes.length && <p>Du har inte valt något ännu. Lägg till en meny eller välj rätter nedan.</p>}
        <details className={styles.editChoices}>
          <summary>Välj eller ändra menyer</summary>
          <fieldset className={styles.choiceFieldset}>
            <legend>Välj menyer till din förfrågan</legend>
            <div className={styles.menuGrid}>
              {catalog.menus.map((menu) => (
                <label className={styles.menuChoice} key={menu.id}>
                  <input type="checkbox" name="menu" value={menu.id} checked={menuIds.includes(menu.id)} onChange={() => toggleMenu(menu.id)} />
                  <span><strong>{menu.name}</strong><small>{menu.pricePerPerson === null ? "Pris enligt offert" : `${menu.pricePerPerson} kr/person`}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
        </details>
        <details className={styles.editChoices}>
          <summary>Lägg till eller ändra enskilda rätter</summary>
          <fieldset className={styles.choiceFieldset}>
            <legend>Välj rätter med bilder</legend>
            <p className={styles.hint}>Välj till din plockmeny eller som extra önskemål. Pris enligt offert.</p>
            {categories.map((category) => (
              <div className={styles.category} key={category}>
                <h3>{category}</h3>
                <div className={styles.dishGrid}>
                  {catalog.dishes.filter((dish) => dish.category === category).map((dish) => (
                    <label key={dish.id} className={styles.dishChoice}>
                      <DishPhoto name={dish.name} />
                      <span className={styles.dishChoiceText}>
                        <input type="checkbox" name="dish" value={dish.id} checked={dishIds.includes(dish.id)} disabled={includedDishes.includes(dish.name)} onChange={() => toggleDish(dish.id)} />
                        <span className={styles.dishChoiceLabel}>{dish.name}{includedDishes.includes(dish.name) && <small>Ingår i vald meny</small>}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
        </details>
      </section>
      <section className={styles.contactFields} aria-labelledby={`${helpId}-contact`}>
        <h2 id={`${helpId}-contact`}>Dina uppgifter</h2>
        <div className="form-grid">
          <label>Namn<input name="name" autoComplete="name" required maxLength={120} /></label>
          <label>Telefonnummer<input name="phone" type="tel" autoComplete="tel" required maxLength={40} /></label>
          <label>E-postadress<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Antal personer<input name="people" type="number" inputMode="numeric" min="1" max="10000" required /></label>
          <label>Datum<input name="date" type="date" min={today} required /></label>
          <label>Önskad tid<input name="time" type="time" required /></label>
          <label>Hämtning eller leverans<select name="fulfillment"><option>Hämtning</option><option>Leverans – adress och möjlighet bekräftas personligen</option></select></label>
        </div>
        <label>Allergier och specialönskemål<textarea name="allergies" rows={3} maxLength={2000} placeholder="Beskriv vad vi behöver ta hänsyn till." /></label>
        <label>Övrigt meddelande<textarea name="message" rows={3} maxLength={3000} placeholder="Tillfälle, eventuell leveransadress och andra önskemål." /></label>
      </section>
      <p className={styles.hint} id={helpId}>
        Dina uppgifter förbereder ett mejl. Webbplatsen skickar och sparar ingen förfrågan. Du behöver själv skicka mejlet från ditt e-postprogram. Upplägg och pris bekräftas sedan personligen.
      </p>
      <button className={`btn btn-primary ${styles.submit}`} type="submit" disabled={!canEmail} aria-describedby={helpId}>
        <Mail size={17} aria-hidden="true" />Förbered cateringförfrågan
      </button>
      {!canEmail && <p className={styles.hint}>Cateringadressen behöver bekräftas. Kontakta oss per telefon.</p>}
      <div role="status" aria-live="polite">{message && <p className={styles.status}>{message}</p>}</div>
      {draft && (
        <div className={`prepared-email ${styles.prepared}`}>
          <h3>Din förfrågan</h3>
          <p>Till: {catalog.contact.email}</p>
          <textarea aria-label="Förberedd cateringförfrågan" readOnly rows={12} value={draft} />
          <div className="contact-actions">
            {draftHref && <a href={draftHref} className={`btn btn-primary ${styles.submit}`}>Öppna mejlutkast</a>}
            <button type="button" className={`btn btn-outline-light ${styles.copy}`} onClick={copyDraft}>Kopiera förfrågan</button>
          </div>
          <p className={styles.hint}>Om utkastet blir för långt för din e-postapp kan du kopiera texten och mejla den till {catalog.contact.email}.</p>
        </div>
      )}
    </form>
  );
}
