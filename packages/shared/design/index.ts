import type { ItemCategory } from '../types/index.ts';

/** Små gemensamma designvärden; webb och native behåller sina egna komponenter. */
export const designColors = {
  green: '#155A43',
  text: '#202B27',
  red: '#B63842',
  line: '#DEE6E1',
  soft: '#F7F5F2',
  muted: '#6B7280',
  mint: '#E8F2ED',
  white: '#FFFFFF',
} as const;

export const categoryLabels: Record<ItemCategory, string> = {
  kalla_meze: 'Kalla meze',
  varma_meze: 'Varma meze',
  grill: 'Grill',
  vegetariskt: 'Vegetariskt',
  brod_saser: 'Bröd & såser',
  dessert: 'Dessert',
};

export const orderSteps = ['Välj mat', 'Datum & plats', 'Kontakt', 'Skicka förfrågan'] as const;
