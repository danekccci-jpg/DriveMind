import type { ProfitabilityInput, ProfitabilityOutput } from "./types";
/**
 * Profitability Engine (MVP)
 *
 * Design goals:
 * - stable, explainable output (no ML yet)
 * - role-aware weighting (courier favors short frequent; taxi favors longer rides / demand)
 * - returns both a score and a concrete recommendation
 */
export declare function computeProfitability(input: ProfitabilityInput): ProfitabilityOutput;
