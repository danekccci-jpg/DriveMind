export type Role = "courier" | "taxi";

export type Platform = "uber" | "bolt" | "glovo" | "wolt";

export type Recommendation = "TAKE" | "SKIP" | "WAIT";

export type ServiceToggles = Record<Platform, boolean>;

export type OrderKind = "delivery" | "ride";

export type UnifiedOrder = {
  id: string;
  platform: Platform;
  kind: OrderKind;
  createdAt: string; // ISO
  pickup: { lat: number; lng: number; label: string };
  dropoff: { lat: number; lng: number; label: string };
  pricePLN: number;
  distanceKm: number;
  etaMin: number;
  notes?: string;
};

/** Tier label displayed to the driver (Kraków 2026 market criteria). */
export type ProfitTier = "LEGENDARY" | "VERY_GOOD" | "WORTH_IT" | "RISKY" | "TRASH";

export type ProfitabilityInput = {
  role: Role;
  pricePLN: number;
  distanceKm: number;
  etaMin: number;
  /** Human-readable dropoff address — used for out-of-city zone detection. */
  dropoffLabel?: string;
  /** True when the order arrives on a weekend day or during night hours (22:00–06:00). */
  isWeekendOrNight?: boolean;
  // optional "context" levers for future tuning
  trafficFactor?: number; // 1 = normal, >1 slower traffic
  demandFactor?: number; // 1 = normal, >1 higher demand/surge
};

export type ProfitabilityOutput = {
  /**
   * Gross zł/km (Brutto) — the primary metric shown to the driver.
   * `plnPerKm` is kept as an alias for backward compatibility.
   */
  złPerKm: number;
  /** Alias of `złPerKm` (legacy field name). */
  plnPerKm: number;
  plnPerMin: number;
  estHourlyPLN: number;
  score0to100: number;
  recommendation: Recommendation;
  reason: string;
  /** 5-tier classification based on zł/km thresholds. */
  profitTier: ProfitTier;
  /** Human label for the tier (includes emoji), e.g. \"💎 LEGENDARY\". */
  tierLabel: string;
  /** UI color hex for the tier (e.g. #A855F7). */
  tierColor: string;
  /** True when the dropoff is detected as an out-of-city destination (e.g. Wieliczka, Skawina). */
  isOutOfCity: boolean;
  /** True when the 30 % empty-return penalty was applied to the effective PLN/km. */
  zonePenaltyApplied: boolean;
};
