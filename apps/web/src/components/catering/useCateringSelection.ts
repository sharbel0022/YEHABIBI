"use client";
import { useEffect, useState } from "react";
import type { HospitalityCatalog } from "@yehabibi/shared";
import { CATERING_DRAFT_KEY, inquiryHref, normalizeSelection, type DishQuantities, type CateringSelection } from "./presentation";

type Options = {
  catalog: HospitalityCatalog;
  initialMenuIds?: string[];
  initialDishIds?: string[];
  initialQuantities?: DishQuantities;
  restoreDraft?: boolean;
};

export function useCateringSelection({ catalog, initialMenuIds = [], initialDishIds = [], initialQuantities = {}, restoreDraft = true }: Options) {
  const [selection, setSelection] = useState(() => normalizeSelection(catalog, {
    menuIds: initialMenuIds,
    quantities: Object.fromEntries(initialDishIds.map(id => [id, initialQuantities[id] ?? 1])),
  }));

  function remember(next: CateringSelection) {
    try { localStorage.setItem(CATERING_DRAFT_KEY, JSON.stringify({ menuIds: next.menuIds, quantities: next.quantities })); } catch { /* Choices still work when storage is unavailable. */ }
    const url = new URL(window.location.href);
    url.search = new URL(inquiryHref(next.menuIds, next.dishIds, next.quantities), url.origin).search;
    window.history.replaceState(window.history.state, "", url);
  }

  useEffect(() => {
    if (!restoreDraft) {
      remember(selection);
      return;
    }
    try {
      const stored = localStorage.getItem(CATERING_DRAFT_KEY);
      if (!stored) return;
      const next = normalizeSelection(catalog, JSON.parse(stored));
      setSelection(next);
      remember(next);
    } catch { /* Ignore an unavailable or malformed local draft. */ }
    // The initial public catalog defines this mounted selection, including hidden-item filtering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setMenuIds(ids: string[]) {
    const next = normalizeSelection(catalog, { menuIds: ids, quantities: selection.quantities });
    setSelection(next);
    remember(next);
  }
  function setDishQuantity(id: string, quantity: number) {
    const next = normalizeSelection(catalog, { menuIds: selection.menuIds, quantities: { ...selection.quantities, [id]: quantity } });
    setSelection(next);
    remember(next);
  }
  return { menuIds: selection.menuIds, quantities: selection.quantities, setMenuIds, setDishQuantity };
}
