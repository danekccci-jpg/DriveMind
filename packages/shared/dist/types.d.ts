export type Role = "courier" | "taxi";
export type Platform = "uber" | "bolt" | "glovo" | "wolt";
export type Recommendation = "TAKE" | "SKIP" | "WAIT";
export type ServiceToggles = Record<Platform, boolean>;
export type OrderKind = "delivery" | "ride";
export type UnifiedOrder = {
    id: string;
    platform: Platform;
    kind: OrderKind;
    createdAt: string;
    pickup: {
        lat: number;
        lng: number;
        label: string;
    };
    dropoff: {
        lat: number;
        lng: number;
        label: string;
    };
    pricePLN: number;
    distanceKm: number;
    etaMin: number;
    notes?: string;
};
export type ProfitabilityInput = {
    role: Role;
    pricePLN: number;
    distanceKm: number;
    etaMin: number;
    trafficFactor?: number;
    demandFactor?: number;
};
export type ProfitabilityOutput = {
    plnPerKm: number;
    plnPerMin: number;
    estHourlyPLN: number;
    score0to100: number;
    recommendation: Recommendation;
    reason: string;
};
