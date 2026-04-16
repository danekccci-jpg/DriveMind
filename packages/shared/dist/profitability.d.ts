import type { ProfitabilityInput, ProfitabilityOutput } from "./types";
/**
 * Profitability Engine — Kraków 2026
 *
 * Design goals:
 * - stable, explainable output (no ML)
 * - role-aware weighting (courier favors short/frequent; taxi favors longer rides)
 * - PLN/km gross tiers with weekend/night premium bar
 * - 30 % zone penalty for out-of-city dropoffs (empty return mileage)
 */
export declare function computeProfitability(input: ProfitabilityInput): ProfitabilityOutput;
