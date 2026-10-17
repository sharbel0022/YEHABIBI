/** Samma gränser i validering, prisberäkning, formulär och sparade menyutkast. */
export const orderLimits = {
  minGuests: 1,
  maxGuests: 1000,
  maxDishes: 50,
  maxQuantity: 1000,
  maxOrderTotalOre: 100000000,
} as const;
