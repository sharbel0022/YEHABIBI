'use client';

import { useEffect, useRef, useState } from 'react';
import { orderLimits, parseSelectionDraft, reconcileSelection, type Catalog, type Dish } from '@yehabibi/shared';

type MenuDraft = { mode: 'paket' | 'bygg'; menuId: string; guests: number; quantities: Record<string, number>; appliedInputs: string[] };
type RequestKey = { fingerprint: string; id: string; savedAt: number };
const storageKey = 'yehabibi-menu-v4';
const requestKey = 'yehabibi-request-v4';

/** Bara matval sparas i fliken. Kontaktuppgifter och priser sparas aldrig här. */
export function parseQuantities(value: string | undefined, dishes: Dish[]) {
  const quantities: Record<string, number> = {};
  for (const part of (value || '').split(',').slice(0, orderLimits.maxDishes)) {
    const [id, amount] = part.split(':');
    const quantity = Number(amount);
    if (dishes.some(dish => dish.id === id && dish.active && dish.price_ore > 0) &&
      Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= orderLimits.maxQuantity) quantities[id] = quantity;
  }
  return quantities;
}

export function useMenuDraft(initial: Partial<MenuDraft>, catalog: Catalog) {
  const minimum = catalog.settings.custom_min_people;
  const inputKey = Object.keys(initial).length ? JSON.stringify(initial) : '';
  const defaults = { mode: 'bygg', menuId: '', guests: Math.max(minimum, 6), quantities: {}, appliedInputs: inputKey ? [inputKey] : [], ...initial } as MenuDraft;
  const [draft, setDraft] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const source = useRef({ initial, minimum });
  const request = useRef<RequestKey | null>(null);

  useEffect(() => {
    const { initial: given, minimum: min } = source.current;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (saved?.version === 4 && Date.now() - saved.savedAt < 86400000) {
        const selection = parseSelectionDraft(saved);
        const key = Object.keys(given).length ? JSON.stringify(given) : '';
        const applied = Array.isArray(saved.appliedInputs) ? saved.appliedInputs.filter((value: unknown) => typeof value === 'string').slice(-20) as string[] : [];
        // En länk importeras en gång. Bakåt/framåt får inte skriva över senare ändringar.
        const imported = key && !applied.includes(key) ? given : {};
        setDraft(old => ({ ...old, mode: saved.mode === 'paket' ? 'paket' : 'bygg',
          menuId: typeof saved.menuId === 'string' ? saved.menuId : '',
          guests: Number.isSafeInteger(saved.guests) && saved.guests >= min && saved.guests <= orderLimits.maxGuests ? saved.guests : old.guests,
          quantities: selection.quantities, ...imported,
          appliedInputs: key ? [...new Set([...applied, key])].slice(-20) : applied }));
      }
    } catch { /* Matvalen fungerar även när webbläsaren blockerar lagring. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || catalog.demo) return;
    const selection = { menuId: draft.menuId || null, quantities: draft.quantities, guests: draft.guests, occasion: 'hemma' as const };
    const current = reconcileSelection(catalog, selection);
    if (current !== selection && Object.keys(current.quantities).length !== Object.keys(draft.quantities).length) {
      setDraft(previous => ({ ...previous, quantities: current.quantities }));
      setNotice('Rätter som inte längre är tillgängliga har tagits bort. Kontrollera dina val.');
    }
  }, [catalog, draft, ready]);

  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ ...draft, version: 4, savedAt: Date.now() })); }
    catch { /* Matvalen finns fortfarande i sidans tillstånd. */ }
  }, [draft, ready]);

  /** Samma innehåll återanvänder nyckeln vid återförsök; ändrade uppgifter får en ny. */
  async function requestIdFor(payload: object) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    try {
      const saved = JSON.parse(sessionStorage.getItem(requestKey) || 'null');
      if (saved && typeof saved.fingerprint === 'string' && /^[a-f0-9-]{36}$/i.test(saved.id) && Number.isFinite(saved.savedAt)) request.current = saved;
    } catch { /* Behåll minneskopian när lagring är blockerad. */ }
    if (request.current?.fingerprint !== fingerprint) {
      request.current = { fingerprint, id: crypto.randomUUID(), savedAt: Date.now() };
    }
    try { sessionStorage.setItem(requestKey, JSON.stringify(request.current)); } catch { /* Återförsök i samma vy fungerar ändå. */ }
    return request.current.id;
  }
  function clearDraft() {
    request.current = null;
    try { sessionStorage.removeItem(storageKey); sessionStorage.removeItem(requestKey); } catch { /* Lagring kan vara avstängd. */ }
  }
  return { draft, setDraft, clearDraft, requestIdFor, notice };
}
