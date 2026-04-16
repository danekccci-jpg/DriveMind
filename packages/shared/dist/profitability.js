"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeProfitability = computeProfitability;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
// ---------------------------------------------------------------------------
// Kraków 2026 market constants
// ---------------------------------------------------------------------------
/**
 * 5-tier zł/km thresholds (gross, Brutto) for Kraków 2026.
 *
 * These values are intended to match the driver-facing economics in 2026 and
 * align with what is typically shown on Uber/Bolt offer screens (gross zł).
 */
const THRESHOLDS = {
    LEGENDARY_MIN: 5.50, // > 5.50 zł/km
    VERY_GOOD_MIN: 3.50, // 3.50–5.50 zł/km
    WORTH_IT_MIN: 2.50, // 2.50–3.50 zł/km
    RISKY_MIN: 2.00, // 2.00–2.50 zł/km
};
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
function detectOutOfCity(dropoffLabel) {
    if (!dropoffLabel)
        return false;
    const lower = dropoffLabel.toLowerCase();
    return OUT_OF_CITY_KEYWORDS.some((kw) => lower.includes(kw));
}
// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------
function classifyTier(effectiveZlPerKm) {
    if (effectiveZlPerKm > THRESHOLDS.LEGENDARY_MIN)
        return "LEGENDARY";
    if (effectiveZlPerKm >= THRESHOLDS.VERY_GOOD_MIN)
        return "VERY_GOOD";
    if (effectiveZlPerKm >= THRESHOLDS.WORTH_IT_MIN)
        return "WORTH_IT";
    if (effectiveZlPerKm >= THRESHOLDS.RISKY_MIN)
        return "RISKY";
    return "TRASH";
}
function tierMeta(tier) {
    switch (tier) {
        case "LEGENDARY":
            return { tierLabel: "💎 LEGENDARY", tierColor: "#A855F7" };
        case "VERY_GOOD":
            return { tierLabel: "✅ VERY GOOD", tierColor: "#22C55E" };
        case "WORTH_IT":
            return { tierLabel: "👌 WORTH IT", tierColor: "#EAB308" };
        case "RISKY":
            return { tierLabel: "🤔 RISKY", tierColor: "#F97316" };
        case "TRASH":
            return { tierLabel: "🗑️ TRASH", tierColor: "#EF4444" };
    }
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
function computeProfitability(input) {
    const trafficFactor = input.trafficFactor ?? 1;
    const demandFactor = input.demandFactor ?? 1;
    const isWeekendOrNight = input.isWeekendOrNight ?? false;
    const etaMin = Math.max(1, input.etaMin * trafficFactor);
    const distanceKm = Math.max(0.2, input.distanceKm);
    // Gross price (Brutto) as presented on driver offer screens.
    const pricePLN = Math.max(0, input.pricePLN) * demandFactor;
    // ── Zone penalty ────────────────────────────────────────────────────────
    const isOutOfCity = detectOutOfCity(input.dropoffLabel);
    // The penalty is applied to PLN/km rather than the raw price so that the
    // tier classification reflects the driver's real effective rate after the
    // empty return leg.
    const zonePenaltyApplied = isOutOfCity;
    const effectivePricePLN = isOutOfCity ? pricePLN * ZONE_PENALTY_FACTOR : pricePLN;
    // ── Core metrics ────────────────────────────────────────────────────────
    const grossZlPerKm = pricePLN / distanceKm;
    const effectiveZlPerKm = effectivePricePLN / distanceKm;
    const plnPerMin = pricePLN / etaMin;
    const estHourlyPLN = plnPerMin * 60;
    // ── Tier classification (Kraków 2026) ───────────────────────────────────
    const profitTier = classifyTier(effectiveZlPerKm);
    const { tierLabel, tierColor } = tierMeta(profitTier);
    // ── Legacy 0-100 score (preserved for existing UI badge logic) ──────────
    // Role-aware normalization targets (can be tuned per market).
    const targets = input.role === "courier"
        ? { hourlyGood: 45, hourlyGreat: 65, kmGood: 3.8, kmGreat: 5.2 }
        : { hourlyGood: 55, hourlyGreat: 80, kmGood: 3.2, kmGreat: 4.4 };
    const hourlyScore = clamp(((estHourlyPLN - targets.hourlyGood) / (targets.hourlyGreat - targets.hourlyGood)) * 60 + 30, 0, 100);
    const kmScore = clamp(((grossZlPerKm - targets.kmGood) / (targets.kmGreat - targets.kmGood)) * 50 + 25, 0, 100);
    const timePenalty = input.role === "courier"
        ? clamp((etaMin - 22) * 1.5, 0, 20)
        : clamp((10 - etaMin) * 2.0, 0, 20);
    const baseScore = input.role === "courier"
        ? hourlyScore * 0.7 + kmScore * 0.3
        : hourlyScore * 0.75 + kmScore * 0.25;
    const zonePenaltyScore = zonePenaltyApplied ? 15 : 0;
    const score0to100 = clamp(baseScore - timePenalty - zonePenaltyScore, 0, 100);
    // ── Recommendation ──────────────────────────────────────────────────────
    let recommendation = "WAIT";
    let reason = "Borderline — keep watching for better tasks.";
    if (profitTier === "LEGENDARY" || profitTier === "VERY_GOOD") {
        recommendation = "TAKE";
        reason = isOutOfCity
            ? "Excellent gross rate, but destination is outside the city — factor in empty return."
            : "Excellent value for time and distance.";
    }
    else if (profitTier === "WORTH_IT") {
        recommendation = "TAKE";
        reason = isOutOfCity
            ? "Worth it, but out-of-city dropoff may reduce real returns."
            : "Solid offer — generally worth taking.";
    }
    else if (profitTier === "RISKY") {
        recommendation = "WAIT";
        reason = isWeekendOrNight
            ? "Risky — weekend/night often pays better; consider waiting."
            : "Risky — consider waiting for a better rate.";
    }
    else if (profitTier === "TRASH") {
        recommendation = "SKIP";
        reason = isOutOfCity
            ? "Trash rate and destination is outside the city — likely not worth it."
            : "Trash rate — likely hurts hourly earnings.";
    }
    return {
        złPerKm: round2(grossZlPerKm),
        plnPerKm: round2(grossZlPerKm),
        plnPerMin: round2(plnPerMin),
        estHourlyPLN: round2(estHourlyPLN),
        score0to100: Math.round(score0to100),
        recommendation,
        reason,
        profitTier,
        tierLabel,
        tierColor,
        isOutOfCity,
        zonePenaltyApplied,
    };
}
