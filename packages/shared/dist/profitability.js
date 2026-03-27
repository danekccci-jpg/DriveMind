"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeProfitability = computeProfitability;
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
/**
 * Profitability Engine (MVP)
 *
 * Design goals:
 * - stable, explainable output (no ML yet)
 * - role-aware weighting (courier favors short frequent; taxi favors longer rides / demand)
 * - returns both a score and a concrete recommendation
 */
function computeProfitability(input) {
    const trafficFactor = input.trafficFactor ?? 1;
    const demandFactor = input.demandFactor ?? 1;
    const etaMin = Math.max(1, input.etaMin * trafficFactor);
    const distanceKm = Math.max(0.2, input.distanceKm);
    const pricePLN = Math.max(0, input.pricePLN) * demandFactor;
    const plnPerKm = pricePLN / distanceKm;
    const plnPerMin = pricePLN / etaMin;
    const estHourlyPLN = plnPerMin * 60;
    // Role-aware normalization targets (Krakow-ish MVP defaults; can be tuned later).
    const targets = input.role === "courier"
        ? { hourlyGood: 45, hourlyGreat: 65, kmGood: 3.8, kmGreat: 5.2 }
        : { hourlyGood: 55, hourlyGreat: 80, kmGood: 3.2, kmGreat: 4.4 };
    const hourlyScore = clamp(((estHourlyPLN - targets.hourlyGood) / (targets.hourlyGreat - targets.hourlyGood)) * 60 + 30, 0, 100);
    const kmScore = clamp(((plnPerKm - targets.kmGood) / (targets.kmGreat - targets.kmGood)) * 50 + 25, 0, 100);
    // Courier: penalize long ETAs more (missed opportunities).
    // Taxi: penalize very short rides (dead time / pickup overhead).
    const timePenalty = input.role === "courier"
        ? clamp((etaMin - 22) * 1.5, 0, 20)
        : clamp((10 - etaMin) * 2.0, 0, 20);
    // Weighted score: hourly dominates; km is supporting signal.
    const baseScore = input.role === "courier" ? hourlyScore * 0.7 + kmScore * 0.3 : hourlyScore * 0.75 + kmScore * 0.25;
    const score0to100 = clamp(baseScore - timePenalty, 0, 100);
    let recommendation = "WAIT";
    let reason = "Borderline — keep watching for better tasks.";
    if (score0to100 >= 72) {
        recommendation = "TAKE";
        reason = "Strong value for time/distance.";
    }
    else if (score0to100 <= 42) {
        recommendation = "SKIP";
        reason = "Low value — likely hurts hourly earnings.";
    }
    return {
        plnPerKm: round2(plnPerKm),
        plnPerMin: round2(plnPerMin),
        estHourlyPLN: round2(estHourlyPLN),
        score0to100: Math.round(score0to100),
        recommendation,
        reason
    };
}
