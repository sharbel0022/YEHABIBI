"use client";
import Link from "next/link";
import { ArrowRight, Plus, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { CateringMenu, HospitalityCatalog } from "@yehabibi/shared";
import { keepDialogFocus } from "@/components/hospitality/dialog-focus";
import { DishPhoto } from "./DishPhoto";
import { inquiryHref, menuArtwork, menuDishNames, type DishQuantities } from "./presentation";
import { useCateringSelection } from "./useCateringSelection";
import styles from "./CateringMenuGallery.module.css";

export function CateringMenuGallery({ catalog, initialMenuIds, initialDishIds, initialQuantities, restoreDraft }: {
  catalog: HospitalityCatalog; initialMenuIds?: string[]; initialDishIds?: string[]; initialQuantities?: DishQuantities; restoreDraft?: boolean;
}) {
  const { menuIds, quantities, setMenuIds } = useCateringSelection({ catalog, initialMenuIds, initialDishIds, initialQuantities, restoreDraft });
  const [activeId, setActiveId] = useState(catalog.menus[0]?.id);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const active = catalog.menus.find(menu => menu.id === activeId);
  const dishIds = Object.keys(quantities);
  const plockHref = inquiryHref(menuIds, dishIds, quantities).replace("/catering/forfragan", "/catering/plockmeny");
  const nextMenus = (menu: CateringMenu) => [...new Set([...menuIds, menu.id])];
  const checkoutHref = (menu: CateringMenu) => inquiryHref(nextMenus(menu), dishIds, quantities);
  function openMenu(menu: CateringMenu, trigger: HTMLButtonElement) {
    opener.current = trigger;
    setActiveId(menu.id);
    dialog.current?.showModal();
  }
  return (
    <div className={styles.gallery}>
      <div className={styles.menuGrid}>
        {catalog.menus.map((menu, index) => {
          const selected = menuIds.includes(menu.id);
          const plock = menu.pricePerPerson === null;
          return (
            <article className={styles.menuCard} key={menu.id} data-catering-menu={menu.id} data-selected={selected || undefined}>
              {plock ? <Link className={styles.posterButton} href={plockHref} aria-label="Öppna plockmenyn">
                <img src={menuArtwork[menu.id] || menu.image} alt="" width={1448} height={1086} loading="lazy" />
                <span className={styles.posterHint}>Skapa din meny <ArrowRight size={16} aria-hidden="true" /></span>
              </Link> : <button className={styles.posterButton} type="button" onClick={event => openMenu(menu, event.currentTarget)} aria-label={`Visa rätter i ${menu.name}`} aria-haspopup="dialog">
                <img src={menuArtwork[menu.id] || menu.image} alt="" width={1448} height={1086} loading={index < 2 ? "eager" : "lazy"} />
                <span className={styles.posterHint}>Visa menyn <ArrowRight size={16} aria-hidden="true" /></span>
              </button>}
              <div className={styles.cardFooter}>
                <div><h2>{menu.name}</h2><p>{plock ? "Pris enligt offert" : `${menu.pricePerPerson} kr/person`}</p></div>
                {plock ? (
                  <Link className={styles.selectButton} href={plockHref}>Välj rätter <ArrowRight size={16} aria-hidden="true" /></Link>
                ) : (
                  <Link className={styles.selectButton} href={checkoutHref(menu)} onClick={() => setMenuIds(nextMenus(menu))}>
                    {selected ? <ArrowRight size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{selected ? "Till kassan" : "Lägg till"}<span className={styles.srOnly}> {menu.name}</span>
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onKeyDown={keepDialogFocus} onClose={() => opener.current?.focus()}>
        <div className={styles.dialogTop}><span className={styles.eyebrow}>CATERINGMENY</span><button type="button" className={styles.closeButton} aria-label="Stäng menyinnehåll" onClick={() => dialog.current?.close()} autoFocus><X size={22} /></button></div>
        {active && <>
          <header className={styles.dialogHeading}><h2 id={titleId}>{active.name}</h2><p>{active.description}</p><div className={styles.dialogActions}><strong>{active.pricePerPerson} kr/person</strong><Link className={styles.continueButton} href={checkoutHref(active)} onClick={() => setMenuIds(nextMenus(active))}>Välj menyn och gå till kassan <ArrowRight size={17} aria-hidden="true" /></Link></div></header>
          <section className={styles.dialogSection} aria-label="Rätter som ingår i menyn"><h3>Det här ingår</h3><div className={styles.dishGrid}>{menuDishNames(active).map(name => <div className={styles.dishCard} key={name}><DishPhoto name={name} /><h4>{name}</h4></div>)}</div></section>
          <div className={styles.dialogBottom}><p>Välj antal personer och fyll i dina uppgifter i kassan.</p><Link className={styles.continueButton} href={checkoutHref(active)} onClick={() => setMenuIds(nextMenus(active))}>Till kassan <ArrowRight size={17} aria-hidden="true" /></Link></div>
        </>}
      </dialog>
    </div>
  );
}
