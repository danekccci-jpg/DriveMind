import type { ProfitabilityInput, ProfitabilityOutput, ProfitTier } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Kraków 2026 market constants
// ---------------------------------------------------------------------------

/**
 * PLN/km thresholds for the three driver-facing tiers.
 *
 * Weekday trash bar is lower because demand is lighter — drivers should still
 * take orders at 2.50+ rather than sit idle.
 * Weekend/night trash bar is raised to 4.00 because surge demand means the
 * driver can afford to hold out for premium rates.
 */
const THRESHOLDS = {
  TRASH_WEEKDAY: 2.50,   // < this on a normal weekday → 🔴 TRASH
  TRASH_WEEKEND_NIGHT: 4.00, // < this on weekend/night  → 🔴 TRASH
  OKAY_MAX: 3.50,        // 2.50–3.50 → 🟡 OKAY; > 3.50 → 🟢 PROFIT
} as const;

/**
 * Out-of-city suburb list for Kraków metropolitan area.
 * Orders going here incur empty-return mileage that degrades effective PLN/km.
 */
const OUT_OF_CITY_KEYWORDS = [
  "wieliczka",
  "skawina",
  "niepołomice",
  "niepolomice",
  "krzeszowice",
  "myślenice",
  "myslenice",
  "zabierzów",
  "zabierzow",
  "świątniki",
  "swiatniki",
  "kryspinów",
  "kryspinow",
  "liszki",
  "mogilany",
];

/** Penalty factor applied when the destination is outside the city. */
const ZONE_PENALTY_FACTOR = 0.70; // 30 % less effective PLN/km

// ---------------------------------------------------------------------------
// Zone detection
// ---------------------------------------------------------------------------

function detectOutOfCity(dropoffLabel?: string): boolean {
  if (!dropoffLabel) return false;
  const lower = dropoffLabel.toLowerCase();
  return OUT_OF_CITY_KEYWORDS.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

function classifyTier(effectivePlnPerKm: number, isWeekendOrNight: boolean): ProfitTier {
  const trashThreshold = isWeekendOrNight
    ? THRESHOLDS.TRASH_WEEKEND_NIGHT
    : THRESHOLDS.TRASH_WEEKDAY;

  if (effectivePlnPerKm < trashThreshold) return "TRASH";
  if (effectivePlnPerKm >= THRESHOLDS.OKAY_MAX) return "PROFIT";
  return "OKAY";
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

/**
 * Profitability Engine — Kraków 2026
 *
 * Design goals:
 * - stable, explainable output (no ML)
 * - role-aware weighting (courier favors short/frequent; taxi favors longer rides)
 * - PLN/km gross tiers with weekend/night premium bar
 * - 30 % zone penalty for out-of-city dropoffs (empty return mileage)
 */
export function computeProfitability(input: ProfitabilityInput): ProfitabilityOutput {
  const trafficFactor = input.trafficFactor ?? 1;
  const demandFactor = input.demandFactor ?? 1;
  const isWeekendOrNight = input.isWeekendOrNight ?? false;

  const etaMin = Math.max(1, input.etaMin * trafficFactor);
  const distanceKm = Math.max(0.2, input.distanceKm);
  const pricePLN = Math.max(0, input.pricePLN) * demandFactor;

  // ── Zone penalty ────────────────────────────────────────────────────────
  const isOutOfCity = detectOutOfCity(input.dropoffLabel);
  // The penalty is applied to PLN/km rather than the raw price so that the
  // tier classification reflects the driver's real effective rate after the
  // empty return leg.
  const zonePenaltyApplied = isOutOfCity;
  const effectivePricePLN = isOutOfCity ? pricePLN * ZONE_PENALTY_FACTOR : pricePLN;

  // ── Core metrics ────────────────────────────────────────────────────────
  const grossPlnPerKm = pricePLN / distanceKm;
  const effectivePlnPerKm = effectivePricePLN / distanceKm;
  const plnPerMin = pricePLN / etaMin;
  const estHourlyPLN = plnPerMin * 60;

  // ── Tier classification (Kraków 2026) ───────────────────────────────────
  const profitTier = classifyTier(effectivePlnPerKm, isWeekendOrNight);

  // ── Legacy 0-100 score (preserved for existing UI badge logic) ──────────
  // Role-aware normalization targets (can be tuned per market).
  const targets =
    input.role === "courier"
      ? { hourlyGood: 45, hourlyGreat: 65, kmGood: 3.8, kmGreat: 5.2 }
      : { hourlyGood: 55, hourlyGreat: 80, kmGood: 3.2, kmGreat: 4.4 };

  const hourlyScore = clamp(
    ((estHourlyPLN - targets.hourlyGood) / (targets.hourlyGreat - targets.hourlyGood)) * 60 + 30,
    0,
    100
  );

  const kmScore = clamp(
    ((grossPlnPerKm - targets.kmGood) / (targets.kmGreat - targets.kmGood)) * 50 + 25,
    0,
    100
  );

  const timePenalty =
    input.role === "courier"
      ? clamp((etaMin - 22) * 1.5, 0, 20)
      : clamp((10 - etaMin) * 2.0, 0, 20);

  const baseScore = input.role === "courier"
    ? hourlyScore * 0.7 + kmScore * 0.3
    : hourlyScore * 0.75 + kmScore * 0.25;

  const zonePenaltyScore = zonePenaltyApplied ? 15 : 0;
  const score0to100 = clamp(baseScore - timePenalty - zonePenaltyScore, 0, 100);

  // ── Recommendation ──────────────────────────────────────────────────────
  let recommendation: ProfitabilityOutput["recommendation"] = "WAIT";
  let reason = "Borderline — keep watching for better tasks.";

  if (profitTier === "PROFIT") {
    recommendation = "TAKE";
    reason = isOutOfCity
      ? "Good rate, but destination is outside the city — factor in empty return."
      : "Strong value for time and distance.";
  } else if (profitTier === "TRASH") {
    recommendation = "SKIP";
    reason = isWeekendOrNight
      ? "Weekend/night demand is high — hold out for 4.00+ zł/km."
      : "Low rate — likely hurts hourly earnings.";
  } else {
    // OKAY
    recommendation = score0to100 >= 55 ? "WAIT" : "SKIP";
    reason = isOutOfCity
      ? "Out-of-city penalty drags effective rate into marginal territory."
      : "Acceptable but not optimal.";
  }

  return {
    plnPerKm: round2(grossPlnPerKm),
    plnPerMin: round2(plnPerMin),
    estHourlyPLN: round2(estHourlyPLN),
    score0to100: Math.round(score0to100),
    recommendation,
    reason,
    profitTier,
    isOutOfCity,
    zonePenaltyApplied,
  };
}
