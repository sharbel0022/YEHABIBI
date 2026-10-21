"use client";

import Link from "next/link";
import { ArrowRight, Check, Plus, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { CateringMenu, HospitalityCatalog } from "@yehabibi/shared";
import { keepDialogFocus } from "@/components/hospitality/dialog-focus";
import { DishPhoto } from "./DishPhoto";
import { inquiryHref, menuArtwork, menuDishNames } from "./presentation";
import styles from "./CateringMenuGallery.module.css";

export function CateringMenuGallery({
  catalog,
  initialMenuIds = [],
  initialDishIds = [],
}: {
  catalog: HospitalityCatalog;
  initialMenuIds?: string[];
  initialDishIds?: string[];
}) {
  const [menuIds, setMenuIds] = useState(() =>
    [...new Set(initialMenuIds)].filter((id) => catalog.menus.some((menu) => menu.id === id)),
  );
  const [dishIds, setDishIds] = useState(() =>
    [...new Set(initialDishIds)].filter((id) => {
      const dish = catalog.dishes.find((item) => item.id === id);
      const included = catalog.menus.filter((menu) => initialMenuIds.includes(menu.id)).flatMap(menuDishNames);
      return !!dish && !included.includes(dish.name);
    }),
  );
  const [activeId, setActiveId] = useState(catalog.menus[0]?.id);
  const [announcement, setAnnouncement] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const dialogTitle = useId();
  const summaryTitle = useId();
  const selectedMenus = catalog.menus.filter((menu) => menuIds.includes(menu.id));
  const includedNames = [...new Set(selectedMenus.flatMap(menuDishNames))];
  const selectedDishes = catalog.dishes.filter((dish) => dishIds.includes(dish.id));
  const activeMenu = catalog.menus.find((menu) => menu.id === activeId);
  const hasSelection = selectedMenus.length + selectedDishes.length > 0;

  function persist(nextMenus: string[], nextDishes: string[]) {
    const url = new URL(window.location.href);
    url.search = new URL(inquiryHref(nextMenus, nextDishes), url.origin).search;
    window.history.replaceState(window.history.state, "", url);
  }

  function toggleMenu(menu: CateringMenu) {
    const removing = menuIds.includes(menu.id);
    const next = removing ? menuIds.filter((id) => id !== menu.id) : [...menuIds, menu.id];
    const names = catalog.menus.filter((item) => next.includes(item.id)).flatMap(menuDishNames);
    const remainingDishes = dishIds.filter((id) => !names.includes(catalog.dishes.find((dish) => dish.id === id)?.name || ""));
    setMenuIds(next);
    setDishIds(remainingDishes);
    persist(next, remainingDishes);
    setAnnouncement(`${menu.name} har ${removing ? "tagits bort från" : "lagts till i"} din förfrågan.`);
  }

  function toggleDish(id: string, name: string) {
    const removing = dishIds.includes(id);
    const next = removing ? dishIds.filter((dishId) => dishId !== id) : [...dishIds, id];
    setDishIds(next);
    persist(menuIds, next);
    setAnnouncement(`${name} har ${removing ? "tagits bort från" : "lagts till i"} din förfrågan.`);
  }

  function openMenu(menu: CateringMenu, trigger: HTMLButtonElement) {
    opener.current = trigger;
    setActiveId(menu.id);
    dialog.current?.showModal();
  }

  return (
    <div className={styles.gallery}>
      <div className={styles.menuGrid}>
        {catalog.menus.map((menu, index) => {
          const chosen = menuIds.includes(menu.id);
          const artwork = menuArtwork[menu.id] || menu.image;
          return (
            <article className={styles.menuCard} key={menu.id} data-catering-menu={menu.id} data-selected={chosen || undefined}>
              <button
                className={styles.posterButton}
                type="button"
                onClick={(event) => openMenu(menu, event.currentTarget)}
                aria-label={`Visa rätter i ${menu.name}`}
                aria-haspopup="dialog"
              >
                <img src={artwork} alt="" width={1448} height={1086} loading={index < 2 ? "eager" : "lazy"} />
                <span className={styles.posterHint}>Visa menyn <ArrowRight size={17} aria-hidden="true" /></span>
              </button>
              <div className={styles.cardFooter}>
                <div>
                  <h2>{menu.name}</h2>
                  <p>{menu.pricePerPerson === null ? "Pris enligt offert" : `${menu.pricePerPerson} kr/person`}</p>
                </div>
                <button
                  className={styles.selectButton}
                  type="button"
                  aria-pressed={chosen}
                  onClick={(event) => {
                    toggleMenu(menu);
                    if (!chosen) openMenu(menu, event.currentTarget);
                  }}
                >
                  {chosen ? <Check size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
                  {chosen ? "Tillagd" : "Lägg till"}
                  <span className={styles.srOnly}> {menu.name}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {catalog.menus.length === 0 && <p className={styles.empty}>Ring oss så hjälper vi dig att välja catering.</p>}

      <section className={styles.summary} aria-labelledby={summaryTitle}>
        <div className={styles.summaryHeading}>
          <div>
            <span className={styles.eyebrow}>DITT VAL</span>
            <h2 id={summaryTitle}>Din cateringförfrågan</h2>
          </div>
          {hasSelection && <span className={styles.selectionCount}>{selectedMenus.length} {selectedMenus.length === 1 ? "meny" : "menyer"} · {selectedDishes.length} {selectedDishes.length === 1 ? "extra rätt" : "extra rätter"}</span>}
        </div>
        {hasSelection ? (
          <>
            {selectedMenus.length > 0 && (
              <ul className={styles.selectedMenus}>
                {selectedMenus.map((menu) => (
                  <li key={menu.id}>
                    <span><Check size={17} aria-hidden="true" />{menu.name}</span>
                    <button type="button" className={styles.removeButton} onClick={() => toggleMenu(menu)} aria-label={`Ta bort ${menu.name}`}><X size={17} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            )}
            {includedNames.length > 0 && (
              <div className={styles.selectedGroup}>
                <h3>Ingår i dina valda menyer</h3>
                <div className={styles.selectedDishGrid}>
                  {includedNames.map((name) => (
                    <div className={styles.selectedDish} key={name}>
                      <DishPhoto name={name} className={styles.summaryPhoto} />
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedDishes.length > 0 && (
              <div className={styles.selectedGroup}>
                <h3>{selectedMenus.every((menu) => menu.pricePerPerson === null) ? "Dina valda rätter" : "Dina extra rätter"}</h3>
                <div className={styles.selectedDishGrid}>
                  {selectedDishes.map((dish) => (
                    <div className={styles.selectedDish} key={dish.id}>
                      <DishPhoto name={dish.name} className={styles.summaryPhoto} />
                      <span>{dish.name}</span>
                      <button type="button" className={styles.removeButton} aria-label={`Ta bort ${dish.name}`} onClick={() => toggleDish(dish.id, dish.name)}><X size={16} aria-hidden="true" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.summaryActions}>
              <p>Fortsätt med datum, antal gäster och dina kontaktuppgifter. Pris och upplägg bekräftas personligen.</p>
              <Link className={styles.continueButton} href={inquiryHref(menuIds, dishIds)}>Fortsätt med förfrågan <ArrowRight size={18} aria-hidden="true" /></Link>
            </div>
          </>
        ) : (
          <p className={styles.empty}>Lägg till en meny eller öppna en menybild för att välja enskilda rätter. Dina val med bilder visas här.</p>
        )}
      </section>
      <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>

      <dialog ref={dialog} className={styles.dialog} aria-labelledby={dialogTitle} onKeyDown={keepDialogFocus} onClose={() => opener.current?.focus()}>
        <div className={styles.dialogTop}>
          <span className={styles.eyebrow}>VÄLJ DIN CATERING</span>
          <button className={styles.closeButton} type="button" aria-label="Stäng menyinnehåll" onClick={() => dialog.current?.close()} autoFocus><X size={22} aria-hidden="true" /></button>
        </div>
        {activeMenu && (
          <>
            <header className={styles.dialogHeading}>
              <h2 id={dialogTitle}>{activeMenu.name}</h2>
              <p>{activeMenu.description}</p>
              <div className={styles.dialogActions}>
                <strong>{activeMenu.pricePerPerson === null ? "Pris enligt offert" : `${activeMenu.pricePerPerson} kr/person`}</strong>
                <button className={styles.selectButton} type="button" aria-pressed={menuIds.includes(activeMenu.id)} onClick={() => toggleMenu(activeMenu)}>
                  {menuIds.includes(activeMenu.id) ? <Check size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
                  {menuIds.includes(activeMenu.id) ? "Menyn är tillagd" : "Lägg till hela menyn"}
                </button>
              </div>
            </header>
            {menuDishNames(activeMenu).length > 0 && (
              <section className={styles.dialogSection} aria-label="Rätter som ingår i menyn">
                <h3>Det här ingår</h3>
                <div className={styles.dishGrid}>
                  {menuDishNames(activeMenu).map((name) => (
                    <div className={styles.dishCard} key={name}>
                      <DishPhoto name={name} />
                      <h4>{name}</h4>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <section className={styles.dialogSection} aria-label="Välj enskilda rätter">
              <h3>{activeMenu.pricePerPerson === null ? "Bygg din egen plockmeny" : "Vill du lägga till enskilda rätter?"}</h3>
              <p>Välj de rätter du önskar. Pris och mängder enligt offert.</p>
              <div className={styles.dishGrid}>
                {catalog.dishes.map((dish) => {
                  const included = includedNames.includes(dish.name);
                  const chosen = dishIds.includes(dish.id);
                  return (
                    <div className={styles.dishCard} key={dish.id}>
                      <DishPhoto name={dish.name} />
                      <h4>{dish.name}</h4>
                      <button className={styles.dishButton} type="button" disabled={included} aria-pressed={chosen || included} onClick={() => toggleDish(dish.id, dish.name)}>
                        {chosen || included ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
                        {included ? "Ingår i vald meny" : chosen ? "Tillagd – ta bort" : "Lägg till"}
                        <span className={styles.srOnly}> {dish.name}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
            <div className={styles.dialogBottom}>
              <p>{menuIds.length + dishIds.length > 0 ? `${menuIds.length} ${menuIds.length === 1 ? "meny" : "menyer"} och ${dishIds.length} ${dishIds.length === 1 ? "extra rätt" : "extra rätter"} valda` : "Dina val samlas i din cateringförfrågan."}</p>
              <button className={styles.continueButton} type="button" onClick={() => dialog.current?.close()}>Klar med mina val <Check size={17} aria-hidden="true" /></button>
            </div>
            <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>
          </>
        )}
      </dialog>
    </div>
  );
}
