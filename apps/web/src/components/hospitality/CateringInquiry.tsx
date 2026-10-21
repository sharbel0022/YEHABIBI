"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Mail, X } from "lucide-react";
import {
  buildCateringEmail,
  cateringMailto,
  type CateringEmailFields,
  type HospitalityCatalog,
} from "@yehabibi/shared";
import { DishPhoto } from "@/components/catering/DishPhoto";
import { QuantityStepper } from "@/components/catering/QuantityStepper";
import { useCateringSelection } from "@/components/catering/useCateringSelection";
import { inquiryHref, menuArtwork, menuDishNames } from "@/components/catering/presentation";
import styles from "./CateringInquiry.module.css";

type PreparedInquiry = { body: string; selectionKey: string };

export function CateringInquiry({
  catalog,
  selectedMenu = "plockmeny",
  initialMenuIds,
  initialDishIds = [],
  initialQuantities,
  restoreDraft = false,
}: {
  catalog: HospitalityCatalog;
  selectedMenu?: string;
  initialMenuIds?: string[];
  initialDishIds?: string[];
  initialQuantities?: Record<string, number>;
  restoreDraft?: boolean;
}) {
  const helpId = useId();
  const choicesHeading = useRef<HTMLHeadingElement>(null);
  const { menuIds, quantities, setMenuIds, setDishQuantity } = useCateringSelection({
    catalog,
    initialMenuIds: initialMenuIds ?? [selectedMenu],
    initialDishIds,
    initialQuantities,
    restoreDraft,
  });
  const [prepared, setPrepared] = useState<PreparedInquiry | null>(null);
  const [message, setMessage] = useState("");
  const menus = catalog.menus.filter((menu) => menuIds.includes(menu.id));
  const dishes = catalog.dishes.filter((dish) => quantities[dish.id] > 0);
  const includedDishes = [...new Set(menus.flatMap(menuDishNames))];
  const menuName = menus.map((menu) => menu.name).join("; ") || "Egen plockmeny";
  const selectionKey = JSON.stringify({
    menus: menus.map((menu) => [menu.id, menu.name]),
    dishes: dishes.map((dish) => [dish.id, dish.name, quantities[dish.id]]),
  });
  const draft = prepared?.selectionKey === selectionKey ? prepared.body : "";
  const canEmail = catalog.contact.emailVerified && !!cateringMailto(catalog.contact.email, "Catering");
  const draftHref = canEmail && draft ? cateringMailto(catalog.contact.email, menuName, draft) : null;
  const chooseDishesHref = `${inquiryHref(menuIds, dishes.map((dish) => dish.id), quantities).replace("/catering/forfragan", "/catering")}#plockmeny`;

  // Restored food choices may change independently of a form event.
  useEffect(() => {
    if (prepared && prepared.selectionKey !== selectionKey) {
      setPrepared(null);
      setMessage("Dina val har ändrats. Förbered ett nytt mejlutkast.");
    }
  }, [prepared, selectionKey]);

  function invalidateDraft() {
    setPrepared(null);
    setMessage(prepared ? "Uppgifterna har ändrats. Förbered ett nytt mejlutkast." : "");
  }
  function toggleMenu(id: string) {
    invalidateDraft();
    setMenuIds(menuIds.includes(id) ? menuIds.filter((value) => value !== id) : [...menuIds, id]);
  }
  function changeQuantity(id: string, quantity: number) {
    invalidateDraft();
    setDishQuantity(id, quantity);
  }
  function removeMenu(id: string) {
    toggleMenu(id);
    choicesHeading.current?.focus();
  }
  function removeDish(id: string) {
    changeQuantity(id, 0);
    choicesHeading.current?.focus();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!menus.length && !dishes.length) {
      setMessage("Välj minst en meny eller rätt till din förfrågan.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const fields: CateringEmailFields = {
      name: String(form.get("name") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
      people: Number(form.get("people")),
      date: String(form.get("date") || ""),
      time: String(form.get("time") || ""),
      fulfillment: String(form.get("fulfillment") || ""),
      menuName,
      extraDishes: dishes.map((dish) => `${quantities[dish.id]} × ${dish.name} (önskat antal)`),
      allergies: String(form.get("allergies") || ""),
      message: String(form.get("message") || ""),
    };
    setPrepared({ body: buildCateringEmail(fields), selectionKey });
    setMessage("Mejlutkastet är klart att öppna i din e-postapp. Du skickar själv mejlet därifrån.");
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setMessage(`Förfrågan har kopierats. Klistra in den i ett mejl till ${catalog.contact.email}.`);
    } catch {
      setMessage("Markera och kopiera förfrågan i textrutan nedan.");
    }
  }
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (!catalog.menus.length && !catalog.dishes.length) {
    return <p>Inga menyer är publicerade just nu. Ring oss så hjälper vi dig med din catering.</p>;
  }
  return (
    <form className={`inquiry-form ${styles.form}`} onSubmit={submit} onChange={invalidateDraft}>
      <div className={styles.intro}>
        <h2>Förfrågan via e-post</h2>
        <p>Fyll i dina uppgifter och öppna förfrågan i din e-postapp.</p>
      </div>
      <section className={styles.selection} aria-labelledby={`${helpId}-choices`}>
        <h3 ref={choicesHeading} tabIndex={-1} className={styles.selectionHeading} id={`${helpId}-choices`}>Dina val</h3>
        {menus.length > 0 && (
          <ul className={styles.selectedMenus}>
            {menus.map((menu) => (
              <li key={menu.id}>
                <img className={styles.menuThumbnail} src={menuArtwork[menu.id] || menu.image} alt="" width={96} height={72} loading="lazy" />
                <span className={styles.selectionName}><strong>{menu.name}</strong><small>{menu.pricePerPerson === null ? "Pris enligt offert" : `${menu.pricePerPerson} kr/person`}</small></span>
                <button type="button" className={styles.remove} onClick={() => removeMenu(menu.id)} aria-label={`Ta bort ${menu.name}`}><X size={18} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
        {dishes.length > 0 && (
          <ul className={styles.selectedDishes} aria-label="Enskilda rätter och tillägg">
            {dishes.map((dish) => (
              <li key={dish.id}>
                <DishPhoto name={dish.name} className={styles.thumbnail} />
                <span className={styles.selectionName}><strong>{dish.name}</strong><small>{quantities[dish.id]} × önskat antal</small></span>
                <div className={styles.quantity}><QuantityStepper value={quantities[dish.id]} onChange={(quantity: number) => changeQuantity(dish.id, quantity)} label={dish.name} min={1} /></div>
                <button type="button" className={styles.remove} onClick={() => removeDish(dish.id)} aria-label={`Ta bort ${dish.name}`}><X size={18} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
        {!menus.length && !dishes.length && <p className={styles.hint}>Du har inte valt något ännu. Välj en meny eller rätter till din förfrågan.</p>}
        {includedDishes.length > 0 && (
          <details className={styles.disclosure}>
            <summary>Se vad som ingår i valda menyer</summary>
            <ul className={styles.includedGrid}>{includedDishes.map((name) => <li key={name}><DishPhoto name={name} /><span>{name}</span></li>)}</ul>
          </details>
        )}
        <details className={styles.disclosure}>
          <summary>Ändra menyval</summary>
          <fieldset className={styles.choiceFieldset}>
            <legend>Menyer till din förfrågan</legend>
            <div className={styles.menuGrid}>{catalog.menus.map((menu) => (
              <label className={styles.menuChoice} key={menu.id}>
                <input type="checkbox" name="menu" value={menu.id} checked={menuIds.includes(menu.id)} onChange={() => toggleMenu(menu.id)} />
                <span>{menu.name}</span>
              </label>
            ))}</div>
          </fieldset>
        </details>
        <Link className={styles.backToDishes} href={chooseDishesHref}><ArrowLeft size={15} aria-hidden="true" />Lägg till fler rätter</Link>
        <p className={styles.hint}>Rätternas antal är dina önskemål. Portioner, innehåll och pris bekräftas personligen.</p>
      </section>
      <section className={styles.contactFields} aria-labelledby={`${helpId}-contact`}>
        <h3 id={`${helpId}-contact`}>Dina uppgifter</h3>
        <div className="form-grid">
          <label>Namn<input name="name" autoComplete="name" required maxLength={120} /></label>
          <label>E-postadress<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Antal personer<input name="people" type="number" inputMode="numeric" min="1" max="10000" required /></label>
          <label>Datum<input name="date" type="date" min={today} required /></label>
          <label><span>Telefonnummer <small className={styles.optional}>(valfritt)</small></span><input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>
        </div>
        <details className={styles.disclosure}>
          <summary>Fler önskemål</summary>
          <div className={styles.optionalFields}>
            <div className="form-grid">
              <label><span>Önskad tid <small className={styles.optional}>(valfritt)</small></span><input name="time" type="time" /></label>
              <label>Hämtning eller leverans<select name="fulfillment"><option>Hämtning</option><option>Leverans – adress och möjlighet bekräftas personligen</option></select></label>
            </div>
            <label>Allergier och specialönskemål<textarea name="allergies" rows={2} maxLength={2000} placeholder="Beskriv vad vi behöver ta hänsyn till." /></label>
            <label>Övrigt meddelande<textarea name="message" rows={2} maxLength={3000} placeholder="Tillfälle, eventuell leveransadress och andra önskemål." /></label>
          </div>
        </details>
      </section>
      <p className={styles.hint} id={helpId}>Du skickar själv mejlet från din e-postapp. Ingen förfrågan skickas eller bokas från webbplatsen.</p>
      <button className={`btn btn-primary ${styles.submit}`} type="submit" disabled={!canEmail} aria-describedby={helpId}><Mail size={17} aria-hidden="true" />Förbered mejlutkast</button>
      {!canEmail && <p className={styles.hint}>Cateringadressen behöver bekräftas. Kontakta oss per telefon.</p>}
      <div role="status" aria-live="polite">{message && <p className={styles.status}>{message}</p>}</div>
      {draft && (
        <section className={styles.prepared} aria-labelledby={`${helpId}-draft`}>
          <h3 id={`${helpId}-draft`}>Ditt mejlutkast</h3>
          <p className={styles.hint}>Till: {catalog.contact.email}</p>
          <div className={styles.emailActions}>
            {draftHref && <a href={draftHref} className={`btn btn-primary ${styles.submit}`}><Mail size={17} aria-hidden="true" />Öppna i e-postappen</a>}
            <button type="button" className={`btn btn-outline-light ${styles.copy}`} onClick={copyDraft}>Kopiera förfrågan</button>
          </div>
          <textarea aria-label="Förberedd cateringförfrågan" readOnly rows={11} value={draft} />
          <p className={styles.hint}>Om din e-postapp inte öppnas kan du kopiera texten och mejla den till {catalog.contact.email}.</p>
        </section>
      )}
    </form>
  );
}
