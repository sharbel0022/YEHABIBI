"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Phone, Plus, ShoppingBag, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { phoneHref, type CateringDish, type HospitalityCatalog } from "@yehabibi/shared";
import { keepDialogFocus } from "@/components/hospitality/dialog-focus";
import { DishPhoto } from "./DishPhoto";
import { QuantityStepper } from "./QuantityStepper";
import { inquiryHref } from "./presentation";
import { getPlockDish, plockCategories } from "./plock-data";
import styles from "./PlockMenuBuilder.module.css";

function quantity(value: number | undefined) {
  return Math.max(0, Math.min(999, Math.trunc(value || 0)));
}

export function PlockMenuBuilder({
  catalog,
  menuIds,
  quantities,
  onQuantityChange,
  onRemoveMenu,
}: {
  catalog: HospitalityCatalog;
  menuIds: string[];
  quantities: Record<string, number>;
  onQuantityChange: (id: string, quantity: number) => void;
  onRemoveMenu?: (id: string) => void;
}) {
  const [category, setCategory] = useState("all");
  const [candidates, setCandidates] = useState<Record<string, number>>({});
  const [activeDishId, setActiveDishId] = useState(catalog.dishes[0]?.id);
  const [announcement, setAnnouncement] = useState("");
  const detailDialog = useRef<HTMLDialogElement>(null);
  const summaryDialog = useRef<HTMLDialogElement>(null);
  const detailOpener = useRef<HTMLButtonElement | null>(null);
  const summaryOpener = useRef<HTMLButtonElement>(null);
  const desktopSummaryHeading = useRef<HTMLHeadingElement>(null);
  const mobileSummaryHeading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const detailHeadingId = useId();
  const summaryHeadingId = useId();
  const desktopSummaryHeadingId = useId();
  const chosenDishes = catalog.dishes.filter((dish) => quantity(quantities[dish.id]) > 0);
  const chosenMenus = catalog.menus.filter((menu) => menuIds.includes(menu.id));
  const totalQuantity = chosenDishes.reduce((total, dish) => total + quantity(quantities[dish.id]), 0);
  const hasSelection = chosenDishes.length > 0 || chosenMenus.length > 0;
  const activeDish = catalog.dishes.find((dish) => dish.id === activeDishId);
  const activeCategory = plockCategories.find((item) => item.id === category);
  const shownDishes = category === "all" ? catalog.dishes : catalog.dishes.filter((dish) => getPlockDish(dish).categoryId === category);
  const call = phoneHref(catalog.contact.phone);

  function setCandidate(id: string, value: number) {
    setCandidates((current) => ({ ...current, [id]: Math.max(1, Math.min(999 - quantity(quantities[id]), quantity(value))) }));
  }

  function candidate(id: string) {
    return Math.max(1, Math.min(999 - quantity(quantities[id]), candidates[id] ?? 1));
  }

  function addDish(dish: CateringDish) {
    if (quantity(quantities[dish.id]) >= 999) return;
    const next = quantity(quantities[dish.id]) + candidate(dish.id);
    onQuantityChange(dish.id, next);
    setCandidates((current) => ({ ...current, [dish.id]: 1 }));
    setAnnouncement(`${dish.name} har lagts till. Antal i din plockmeny: ${next}.`);
  }

  function changeChosen(dish: CateringDish, value: number) {
    const next = quantity(value);
    onQuantityChange(dish.id, next);
    setAnnouncement(next === 0 ? `${dish.name} har tagits bort.` : `${dish.name}: antal ${next}.`);
    if (next === 0) focusSummary();
  }

  function focusSummary() {
    requestAnimationFrame(() => {
      const heading = summaryDialog.current?.open ? mobileSummaryHeading.current : desktopSummaryHeading.current;
      heading?.focus();
    });
  }

  function removeMenu(id: string) {
    onRemoveMenu?.(id);
    focusSummary();
  }

  function openDish(dish: CateringDish, trigger: HTMLButtonElement) {
    detailOpener.current = trigger;
    setActiveDishId(dish.id);
    detailDialog.current?.showModal();
  }

  function summaryContent() {
    return (
      <>
        <p className={styles.quoteLabel}>Pris enligt offert</p>
        <p className={styles.summaryIntro}>Välj rätter och antal. Vi hjälper dig med mängder och upplägg för ditt tillfälle.</p>
        {chosenMenus.length > 0 && (
          <section className={styles.chosenMenuSection} aria-label="Valda fasta menyer">
            <h4>Dina valda menyer</h4>
            <ul className={styles.chosenMenus}>
              {chosenMenus.map((menu) => (
                <li key={menu.id}>
                  <Check size={15} aria-hidden="true" />
                  <span>{menu.name}</span>
                  {onRemoveMenu && <button type="button" className={styles.removeButton} onClick={() => removeMenu(menu.id)} aria-label={`Ta bort ${menu.name}`}><X size={17} aria-hidden="true" /></button>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {chosenDishes.length > 0 ? (
          <ul className={styles.summaryDishes}>
            {chosenDishes.map((dish) => (
              <li className={styles.summaryDish} key={dish.id}>
                <DishPhoto name={dish.name} className={styles.summaryPhoto} />
                <div className={styles.summaryDishContent}>
                  <strong>{dish.name}</strong>
                  <QuantityStepper value={quantity(quantities[dish.id])} onChange={(value) => changeChosen(dish, value)} label={`${dish.name} i din plockmeny`} />
                </div>
                <button type="button" className={styles.removeButton} onClick={() => changeChosen(dish, 0)} aria-label={`Ta bort ${dish.name}`}><X size={17} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptySummary}>Här visas dina valda rätter med bilder och antal. Lägg till från korten bredvid.</p>
        )}
        {chosenDishes.length > 0 && <p className={styles.totalRow}><span>{chosenDishes.length} {chosenDishes.length === 1 ? "rätt" : "rätter"}</span><strong>{totalQuantity} totalt</strong></p>}
        <div className={styles.summaryActions}>
          <p>Granska dina val här. I kassan fyller du i datum, antal gäster och kontaktuppgifter.</p>
          {hasSelection ? (
            <Link className={styles.primaryButton} href={inquiryHref(menuIds, chosenDishes.map((dish) => dish.id), quantities)}>Till kassan <ArrowRight size={17} aria-hidden="true" /></Link>
          ) : <p className={styles.emptyHint}>Välj minst en rätt eller meny för att fortsätta.</p>}
          {call && <a className={styles.phoneLink} href={call}><Phone size={15} aria-hidden="true" />Ring oss: {catalog.contact.phone}</a>}
        </div>
      </>
    );
  }

  return (
    <section className={styles.builder} id="plockmeny" tabIndex={-1} aria-labelledby={headingId}>
      <header className={styles.sectionHeader}>
        <Link className={styles.backLink} href={inquiryHref(menuIds, chosenDishes.map((dish) => dish.id), quantities).replace("/catering/forfragan", "/catering")}><ArrowLeft size={16} aria-hidden="true" />Alla cateringmenyer</Link>
        <span className={styles.eyebrow}>VÄLJ FRITT. VI PLANERAR TILLSAMMANS.</span>
        <h2 id={headingId}>Bygg din egen plockmeny</h2>
        <p>Välj en kategori, ange antal och lägg till dina favoriter. Dina val samlas under Din plockmeny och följer med till kassan.</p>
        <ol className={styles.steps} aria-label="Beställningens steg"><li aria-current="step"><span>1</span>Välj rätter</li><li><span>2</span>Dina uppgifter</li><li><span>3</span>Skicka förfrågan</li></ol>
      </header>

      <div className={styles.layout}>
        <nav className={styles.categories} aria-label="Rättkategorier">
          <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>
            <span>Alla rätter</span><span className={styles.categoryCount}>{catalog.dishes.length}</span>
          </button>
          {plockCategories.filter((item) => catalog.dishes.some((dish) => getPlockDish(dish).categoryId === item.id)).map((item) => (
            <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>
              <span>{item.label}</span><ChevronRight size={15} aria-hidden="true" />
            </button>
          ))}
        </nav>

        <div className={styles.dishSection}>
          <header className={styles.categoryHeading}>
            <h3>{activeCategory?.label || "Alla rätter"}</h3>
            <p>{activeCategory?.description || "Kalla och varma meze, sallader, grill och goda tillbehör."}</p>
          </header>
          <div className={styles.dishGrid}>
            {shownDishes.map((dish) => {
              const presentation = getPlockDish(dish);
              const selected = quantity(quantities[dish.id]);
              return (
                <article key={dish.id} className={styles.dishCard} data-plock-dish={dish.id} data-selected={selected > 0 || undefined}>
                  <button className={styles.cardMain} type="button" onClick={(event) => openDish(dish, event.currentTarget)} aria-haspopup="dialog" aria-label={`Visa ${dish.name}`}>
                    <DishPhoto name={dish.name} className={styles.cardPhoto} />
                    <span className={styles.cardName}>{dish.name}</span>
                    <span className={styles.cardDescription}>{presentation.description}</span>
                  </button>
                  <div className={styles.cardControls}>
                    <span className={styles.quantityLabel}>Antal</span>
                    <QuantityStepper value={candidate(dish.id)} min={1} max={Math.max(1, 999 - selected)} onChange={(value) => setCandidate(dish.id, value)} label={`${dish.name} att lägga till`} />
                    <button className={styles.addButton} type="button" onClick={() => addDish(dish)} disabled={selected >= 999}>
                      <Plus size={15} aria-hidden="true" />Lägg till<span className={styles.srOnly}> {dish.name}</span>
                    </button>
                    <span className={styles.addedStatus}>{selected > 0 && <><Check size={13} aria-hidden="true" />{selected} tillagda</>}</span>
                  </div>
                </article>
              );
            })}
          </div>
          {shownDishes.length === 0 && <p className={styles.emptySummary}>Inga rätter i den här kategorin just nu. Ring oss så hjälper vi dig.</p>}
        </div>

        <aside className={styles.desktopSummary} aria-labelledby={desktopSummaryHeadingId}>
          <h3 ref={desktopSummaryHeading} id={desktopSummaryHeadingId} tabIndex={-1}><ShoppingBag size={22} aria-hidden="true" />Din plockmeny</h3>
          {summaryContent()}
        </aside>
      </div>

      <div className={styles.mobileBar}>
        <button ref={summaryOpener} type="button" className={styles.mobileSummaryButton} aria-haspopup="dialog" onClick={() => summaryDialog.current?.showModal()}>
          <span>Din plockmeny <span className={styles.mobileCount}>{totalQuantity + chosenMenus.length}</span></span>
          <span>Visa val <ArrowRight size={17} aria-hidden="true" /></span>
        </button>
      </div>
      <p className={styles.photoNote}>Bilderna är illustrationer. Innehåll, mängder och pris bekräftas i offerten.</p>
      <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>

      <dialog ref={detailDialog} className={styles.detailDialog} aria-labelledby={detailHeadingId} onKeyDown={keepDialogFocus} onClose={() => detailOpener.current?.focus()}>
        <div className={styles.dialogTop}>
          <span className={styles.eyebrow}>EN SMAK AV LIBANON</span>
          <button className={styles.closeButton} type="button" autoFocus aria-label="Stäng rätt" onClick={() => detailDialog.current?.close()}><X size={22} aria-hidden="true" /></button>
        </div>
        {activeDish && (
          <div className={styles.detailContent}>
            <DishPhoto name={activeDish.name} className={styles.detailPhoto} />
            <div className={styles.detailCopy}>
              <h3 id={detailHeadingId}>{activeDish.name}</h3>
              <p>{getPlockDish(activeDish).description}</p>
              <p className={styles.quoteLabel}>Pris enligt offert</p>
              <span className={styles.quantityLabel}>Antal att lägga till</span>
              <QuantityStepper value={candidate(activeDish.id)} min={1} max={Math.max(1, 999 - quantity(quantities[activeDish.id]))} onChange={(value) => setCandidate(activeDish.id, value)} label={`${activeDish.name} att lägga till`} />
              <button className={styles.primaryButton} type="button" disabled={quantity(quantities[activeDish.id]) >= 999} onClick={() => addDish(activeDish)}><Plus size={18} aria-hidden="true" />Lägg till</button>
              <p className={styles.detailChosen}>{quantity(quantities[activeDish.id]) > 0 && <><Check size={16} aria-hidden="true" />{quantity(quantities[activeDish.id])} tillagda i din plockmeny</>}</p>
              <button className={styles.doneButton} type="button" onClick={() => detailDialog.current?.close()}>Fortsätt välja rätter <ArrowRight size={16} aria-hidden="true" /></button>
              <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>
            </div>
          </div>
        )}
      </dialog>

      <dialog ref={summaryDialog} className={styles.summaryDialog} aria-labelledby={summaryHeadingId} onKeyDown={keepDialogFocus} onClose={() => summaryOpener.current?.focus()}>
        <div className={styles.dialogTop}>
          <h3 ref={mobileSummaryHeading} id={summaryHeadingId} tabIndex={-1}>Din plockmeny</h3>
          <button className={styles.closeButton} type="button" autoFocus aria-label="Stäng din plockmeny" onClick={() => summaryDialog.current?.close()}><X size={22} aria-hidden="true" /></button>
        </div>
        <div className={styles.mobileSummaryContent}>{summaryContent()}</div>
        <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>
      </dialog>
    </section>
  );
}
