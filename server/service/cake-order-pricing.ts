export interface CakePriceRule {
  sizeLabel: string;
  priceOptions: number[];
}

export function getCakePriceRule(guestCount: number): CakePriceRule | null {
  if (guestCount >= 2 && guestCount <= 3) return { sizeLabel: "2–3 người", priceOptions: [100_000] };
  if (guestCount >= 4 && guestCount <= 5) return { sizeLabel: "4–5 người", priceOptions: [180_000] };
  if (guestCount >= 6 && guestCount <= 7) return { sizeLabel: "6–7 người", priceOptions: [270_000] };
  if (guestCount === 8) return { sizeLabel: "8 người", priceOptions: [330_000] };
  if (guestCount >= 9 && guestCount <= 11) return { sizeLabel: "9–11 người", priceOptions: [380_000, 400_000] };
  if (guestCount >= 12 && guestCount <= 15) return { sizeLabel: "12–15 người", priceOptions: [500_000, 600_000] };
  return null;
}

