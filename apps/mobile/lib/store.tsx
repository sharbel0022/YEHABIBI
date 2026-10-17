import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { calcDishTotal, calcTotal, type Catalog, type Fulfillment, type Occasion } from '@yehabibi/shared';
import {
  demoCatalog,
  getCatalog,
  readOrderReferences,
  saveOrderReferences,
  readMenuDraft,
  saveMenuDraft,
  type OrderReference,
} from './api';

export type Selection = {
  menuId: string | null;
  quantities: Record<string, number>;
  guests: number;
  occasion: Occasion;
};
type Store = {
  catalog: Catalog;
  loading: boolean;
  notice: string;
  refresh: () => Promise<void>;
  selection: Selection;
  setGuests: (value: number) => void;
  setOccasion: (value: Occasion) => void;
  chooseMenu: (id: string) => void;
  chooseCustom: () => void;
  changeDish: (id: string, difference: number) => void;
  references: OrderReference[];
  rememberOrder: (reference: OrderReference) => Promise<void>;
  storageNotice: string;
};
const Context = createContext<Store | null>(null);

// Bara en verifierad katalog får rensa utkastet; demo/offline ska aldrig radera val.
export function reconcileSelection(catalog: Catalog, selection: Selection): Selection {
  if (catalog.demo) return selection;
  const available = new Set(catalog.dishes.filter(dish => dish.active).map(dish => dish.id));
  const quantities = Object.fromEntries(Object.entries(selection.quantities).filter(([id]) => available.has(id)));
  const menuId = catalog.menus.some(menu => menu.active && menu.id === selection.menuId) ? selection.menuId : null;
  return menuId === selection.menuId && Object.keys(quantities).length === Object.keys(selection.quantities).length
    ? selection : { ...selection, menuId, quantities };
}

export function CateringProvider({ children }: PropsWithChildren) {
  const [catalog, setCatalog] = useState(demoCatalog);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [storageNotice, setStorageNotice] = useState('');
  const [references, setReferences] = useState<OrderReference[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [catalogVerified, setCatalogVerified] = useState(false);
  const [selection, setSelection] = useState<Selection>({
    menuId: null,
    quantities: {},
    guests: 10,
    occasion: 'hemma',
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getCatalog();
      setCatalog(next);
      setCatalogVerified(!next.demo);
      setNotice(
        next.demo
          ? 'Demonstration: beställningar är stängda tills ägaren har konfigurerat och verifierat tjänsten.'
          : '',
      );
    } catch (error) {
      // Gammal prislista får aldrig användas för en beställning när API:t är nere.
      setCatalog((previous) => ({ ...previous, orders_enabled: false }));
      setCatalogVerified(false);
      setNotice(error instanceof Error ? error.message : 'Servern är inte tillgänglig.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!draftReady || !catalogVerified) return;
    const current = reconcileSelection(catalog, selection);
    if (current !== selection) {
      setSelection(current);
      setStorageNotice('Tidigare menyval som inte längre är tillgängliga har tagits bort. Kontrollera din meny.');
    }
  }, [catalog, catalogVerified, draftReady, selection]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    readOrderReferences()
      .then(setReferences)
      .catch(() => setStorageNotice('Det säkra orderminnet kunde inte öppnas på enheten.'));
  }, []);
  useEffect(() => {
    readMenuDraft().then(value => {
      if (!value || typeof value !== 'object') return;
      const draft = value as Partial<Selection>;
      const quantities = Object.fromEntries(Object.entries(draft.quantities || {})
        .filter(([id, quantity]) => id.length <= 100 && Number.isInteger(quantity) && quantity > 0 && quantity <= 1000)
        .slice(0, 50));
      setSelection({
        menuId: typeof draft.menuId === 'string' && draft.menuId.length <= 100 ? draft.menuId : null,
        quantities,
        guests: Number.isInteger(draft.guests) && draft.guests! > 0 && draft.guests! <= 1000 ? draft.guests! : 10,
        occasion: ['hemma', 'fest', 'foretag'].includes(draft.occasion || '') ? draft.occasion! : 'hemma',
      });
    }).catch(() => setStorageNotice('Menyutkastet kunde inte öppnas. Välj dina rätter igen.'))
      .finally(() => setDraftReady(true));
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    const timer = setTimeout(() => {
      void saveMenuDraft(selection).catch(() => setStorageNotice('Menyvalen sparas under besöket, men kunde inte sparas till nästa start.'));
    }, 250);
    return () => clearTimeout(timer);
  }, [selection, draftReady]);

  async function rememberOrder(reference: OrderReference) {
    const privateReference = { code: reference.code, token: reference.token };
    const next = [privateReference, ...references.filter((item) => item.code !== reference.code)].slice(0, 20);
    setReferences(next);
    try {
      await saveOrderReferences(next);
    } catch {
      setStorageNotice(
        'Ordern är mottagen, men kunde inte sparas på enheten. Behåll appen öppen och notera ditt ordernummer.',
      );
    }
  }

  const value: Store = {
    catalog,
    loading,
    notice,
    refresh,
    selection,
    references,
    rememberOrder,
    storageNotice,
    chooseCustom: () => setSelection(previous => ({ ...previous, menuId: null })),
    setGuests: (guests) =>
      setSelection((previous) => ({
        ...previous,
        guests: Math.max(1, Math.min(1000, Math.floor(guests) || 1)),
      })),
    setOccasion: (occasion) => setSelection((previous) => ({ ...previous, occasion })),
    chooseMenu: (menuId) =>
      setSelection((previous) => ({
        ...previous,
        menuId,
        quantities: {},
        guests: Math.max(previous.guests, catalog.menus.find((menu) => menu.id === menuId)?.min_people || 1),
      })),
    changeDish: (id, difference) =>
      setSelection((previous) => ({
        ...previous,
        menuId: null,
        quantities: {
          ...previous.quantities,
          [id]: Math.max(0, Math.min(1000, (previous.quantities[id] || 0) + difference)),
        },
      })),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCatering() {
  const store = useContext(Context);
  if (!store) throw new Error('CateringProvider saknas.');
  return store;
}

// Samma heltalsregler som webb och server. En ogiltig eller obekräftad prislista ger ingen offert.
export function getQuote(
  catalog: Catalog,
  selection: Selection,
  fulfillment: Fulfillment = 'pickup',
  fee = 0,
) {
  const menu = catalog.menus.find((item) => item.id === selection.menuId && item.active);
  const items = Object.entries(selection.quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([dish_id, quantity]) => ({ dish_id, quantity }));
  try {
    if (selection.menuId) {
      if (!menu || menu.price_ore <= 0 || selection.guests < menu.min_people) return null;
      return {
        ...calcTotal(menu.price_ore, selection.guests, fulfillment, fee),
        price_per_person_ore: menu.price_ore,
      };
    }
    if (selection.guests < catalog.settings.custom_min_people) return null;
    return calcDishTotal(items, catalog.dishes, selection.guests, fulfillment, fee);
  } catch {
    return null;
  }
}
