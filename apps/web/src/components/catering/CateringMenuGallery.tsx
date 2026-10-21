"use client";
import { ArrowRight, Check, Plus, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { CateringMenu, HospitalityCatalog } from "@yehabibi/shared";
import { keepDialogFocus } from "@/components/hospitality/dialog-focus";
import { DishPhoto } from "./DishPhoto";
import { PlockMenuBuilder } from "./PlockMenuBuilder";
import { menuArtwork, menuDishNames, type DishQuantities } from "./presentation";
import { useCateringSelection } from "./useCateringSelection";
import styles from "./CateringMenuGallery.module.css";

export function CateringMenuGallery({ catalog, initialMenuIds, initialDishIds, initialQuantities, restoreDraft }: {
  catalog: HospitalityCatalog; initialMenuIds?: string[]; initialDishIds?: string[]; initialQuantities?: DishQuantities; restoreDraft?: boolean;
}) {
  const { menuIds, quantities, setMenuIds, setDishQuantity } = useCateringSelection({ catalog, initialMenuIds, initialDishIds, initialQuantities, restoreDraft });
  const [activeId, setActiveId] = useState(catalog.menus[0]?.id);
  const [announcement, setAnnouncement] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const active = catalog.menus.find(menu => menu.id === activeId);
  function toggleMenu(menu: CateringMenu) {
    const chosen = menuIds.includes(menu.id);
    setMenuIds(chosen ? menuIds.filter(id => id !== menu.id) : [...menuIds, menu.id]);
    setAnnouncement(`${menu.name} har ${chosen ? "tagits bort från" : "lagts till i"} din förfrågan.`);
  }
  function openMenu(menu: CateringMenu, trigger: HTMLButtonElement) {
    if (menu.pricePerPerson === null) { openPlock(); return; }
    opener.current = trigger;
    setActiveId(menu.id);
    dialog.current?.showModal();
  }
  function openPlock() {
    const section = document.getElementById("plockmeny");
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }
  return (
    <div className={styles.gallery}>
      <div className={styles.menuGrid}>
        {catalog.menus.map((menu, index) => {
          const selected = menuIds.includes(menu.id);
          const plock = menu.pricePerPerson === null;
          return (
            <article className={styles.menuCard} key={menu.id} data-catering-menu={menu.id} data-selected={selected || undefined}>
              <button className={styles.posterButton} type="button" onClick={event => openMenu(menu, event.currentTarget)} aria-label={plock ? "Öppna plockmenyn" : `Visa rätter i ${menu.name}`} aria-haspopup={plock ? undefined : "dialog"}>
                <img src={menuArtwork[menu.id] || menu.image} alt="" width={1448} height={1086} loading={index < 2 ? "eager" : "lazy"} />
                <span className={styles.posterHint}>{plock ? "Skapa din meny" : "Visa menyn"} <ArrowRight size={16} aria-hidden="true" /></span>
              </button>
              <div className={styles.cardFooter}>
                <div><h2>{menu.name}</h2><p>{plock ? "Pris enligt offert" : `${menu.pricePerPerson} kr/person`}</p></div>
                {plock ? (
                  <button className={styles.selectButton} type="button" onClick={openPlock}>Välj rätter <ArrowRight size={16} aria-hidden="true" /></button>
                ) : (
                  <button className={styles.selectButton} type="button" aria-pressed={selected} onClick={event => { toggleMenu(menu); if (!selected) openMenu(menu, event.currentTarget); }}>
                    {selected ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{selected ? "Tillagd" : "Lägg till"}<span className={styles.srOnly}> {menu.name}</span>
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <PlockMenuBuilder catalog={catalog} menuIds={menuIds} quantities={quantities} onQuantityChange={setDishQuantity} onRemoveMenu={id => setMenuIds(menuIds.filter(item => item !== id))} />
      <p className={styles.srOnly} role="status">{announcement}</p>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onKeyDown={keepDialogFocus} onClose={() => opener.current?.focus()}>
        <div className={styles.dialogTop}><span className={styles.eyebrow}>CATERINGMENY</span><button type="button" className={styles.closeButton} aria-label="Stäng menyinnehåll" onClick={() => dialog.current?.close()} autoFocus><X size={22} /></button></div>
        {active && <>
          <header className={styles.dialogHeading}><h2 id={titleId}>{active.name}</h2><p>{active.description}</p><div className={styles.dialogActions}><strong>{active.pricePerPerson} kr/person</strong><button className={styles.selectButton} type="button" aria-pressed={menuIds.includes(active.id)} onClick={() => toggleMenu(active)}>{menuIds.includes(active.id) ? "Tillagd – ta bort" : "Lägg till hela menyn"}</button></div></header>
          <section className={styles.dialogSection} aria-label="Rätter som ingår i menyn"><h3>Det här ingår</h3><div className={styles.dishGrid}>{menuDishNames(active).map(name => <div className={styles.dishCard} key={name}><DishPhoto name={name} /><h4>{name}</h4></div>)}</div></section>
          <div className={styles.dialogBottom}><p>Lägg gärna till fler favoriter i plockmenyn.</p><button type="button" className={styles.continueButton} onClick={() => { opener.current = null; dialog.current?.close(); openPlock(); }}>Till mina val <ArrowRight size={17} /></button></div>
        </>}
      </dialog>
    </div>
  );
}
