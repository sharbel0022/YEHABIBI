"use client";
import type { HospitalityCatalog } from "@yehabibi/shared";
import { PlockMenuBuilder } from "./PlockMenuBuilder";
import { useCateringSelection } from "./useCateringSelection";
import type { DishQuantities } from "./presentation";

export function PlockMenuExperience(props: { catalog: HospitalityCatalog; initialMenuIds?: string[]; initialDishIds?: string[]; initialQuantities?: DishQuantities; restoreDraft?: boolean }) {
  const { menuIds, quantities, setMenuIds, setDishQuantity } = useCateringSelection(props);
  return <PlockMenuBuilder catalog={props.catalog} menuIds={menuIds} quantities={quantities} onQuantityChange={setDishQuantity} onRemoveMenu={id => setMenuIds(menuIds.filter(item => item !== id))} />;
}
