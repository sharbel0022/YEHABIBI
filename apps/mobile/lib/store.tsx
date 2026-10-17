import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import {
  minimumGuestsFor, orderLimits, parseSelectionDraft, reconcileSelection,
  type Catalog, type MenuSelection, type Occasion,
} from '@yehabibi/shared';
import {
  demoCatalog,
  getCatalog,
  readOrderReferences,
  saveOrderReferences,
  readMenuDraft,
  saveMenuDraft,
  type OrderReference,
} from './api';

export type Selection = MenuSelection;
export { quoteSelection as getQuote } from '@yehabibi/shared';
type Store = {
  catalog: Catalog;
  loading: boolean;
  notice: string;
  catalogError: string;
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

export function CateringProvider({ children }: PropsWithChildren) {
  const [catalog, setCatalog] = useState(demoCatalog);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [storageNotice, setStorageNotice] = useState('');
  const [references, setReferences] = useState<OrderReference[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [catalogVerified, setCatalogVerified] = useState(false);
  const catalogRequest = useRef<Promise<void> | null>(null);
  const [selection, setSelection] = useState<Selection>({
    menuId: null,
    quantities: {},
    guests: 10,
    occasion: 'hemma',
  });

  const refresh = useCallback(() => {
    // Uppdateringsgest och återkomst till appen delar samma pågående hämtning.
    if (catalogRequest.current) return catalogRequest.current;
    const pending = (async () => {
      setLoading(true);
      setCatalogError('');
      try {
        const next = await getCatalog();
        setCatalog(next);
        setCatalogVerified(!next.demo);
        setNotice(next.demo
          ? 'Förhandsvisning: köket har ännu inte publicerat verifierade priser och öppnat riktiga beställningar. Inget kan skickas eller betalas här ännu.'
          : '');
      } catch (error) {
        // Behåll utkast och meny vid nätverksfel, men tillåt ingen beställning.
        setCatalog(previous => ({ ...previous, orders_enabled: false }));
        setCatalogVerified(false);
        setNotice('');
        setCatalogError(error instanceof Error ? error.message : 'Menyn kunde inte hämtas. Försök igen.');
      } finally {
        setLoading(false);
        catalogRequest.current = null;
      }
    })();
    catalogRequest.current = pending;
    return pending;
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
    let previous = AppState.currentState;
    const listener = AppState.addEventListener('change', next => {
      if (next === 'active' && previous !== 'active') void refresh();
      previous = next;
    });
    return () => listener.remove();
  }, [refresh]);
  useEffect(() => {
    readOrderReferences()
      .then(setReferences)
      .catch(() => setStorageNotice('Det säkra orderminnet kunde inte öppnas på enheten.'));
  }, []);
  useEffect(() => {
    readMenuDraft().then(value => {
      if (value) setSelection(parseSelectionDraft(value));
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
    catalogError,
    refresh,
    selection,
    references,
    rememberOrder,
    storageNotice,
    chooseCustom: () => setSelection(previous => ({ ...previous, menuId: null })),
    setGuests: (guests) =>
      setSelection((previous) => ({
        ...previous,
        guests: Math.max(orderLimits.minGuests, Math.min(orderLimits.maxGuests, Math.floor(guests) || orderLimits.minGuests)),
      })),
    setOccasion: (occasion) => setSelection((previous) => ({ ...previous, occasion })),
    chooseMenu: (menuId) =>
      setSelection((previous) => ({
        ...previous,
        menuId,
        quantities: {},
        guests: Math.max(previous.guests, minimumGuestsFor(catalog.menus.find(menu => menu.id === menuId), orderLimits.minGuests)),
      })),
    changeDish: (id, difference) =>
      setSelection((previous) => ({
        ...previous,
        menuId: null,
        quantities: {
          ...previous.quantities,
          [id]: Math.max(0, Math.min(orderLimits.maxQuantity, (previous.quantities[id] || 0) + difference)),
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
