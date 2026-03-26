import { Order, ShiftStats } from '../store/ordersStore'

export type Role = 'courier' | 'taxi'
export type ProfitLabel = 'GREAT' | 'GOOD' | 'OK' | 'SKIP'

export interface ProfitScoreResult {
  score: number
  label: ProfitLabel
  color: string
}

const MAX_ACCEPTABLE_DETOUR = 3.0
const FUEL_PRICE_PER_LITER = 6.5
const PEAK_HOURS: [number, number][] = [[12, 14], [18, 21]]
const PLATFORM_INACTIVITY_THRESHOLD = 30
const SHORT_ORDER_THRESHOLD = 1.0

const DEG_TO_RAD = Math.PI / 180
const EARTH_RADIUS_KM = 6371

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD
  const dLng = (lng2 - lng1) * DEG_TO_RAD
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

function labelFromScore(score: number): { label: ProfitLabel; color: string } {
  if (score >= 1.2) return { label: 'GREAT', color: '#22C55E' }
  if (score >= 0.9) return { label: 'GOOD', color: '#F59E0B' }
  if (score >= 0.7) return { label: 'OK', color: '#888888' }
  return { label: 'SKIP', color: '#EF4444' }
}

export function calculateProfitScore(
  order: Order,
  shiftStats: ShiftStats,
  role: Role,
  fuelConsumption: number,
  lastPlatformActivity: Record<string, number>,
): ProfitScoreResult {
  const { earnings, distanceKm, deadrunKm, durationMin, platform,
          pickupLat, pickupLng } = order

  // 1. Pay efficiency (40%)
  const payRate = earnings / (distanceKm + deadrunKm)
  const shiftAvgRate =
    shiftStats.totalKm > 0
      ? shiftStats.totalEarnings / shiftStats.totalKm
      : payRate
  const payScore = payRate / shiftAvgRate

  // 2. Route alignment (25%)
  let detourScore = 1.0
  if (
    shiftStats.lastOrderDropoffLat !== null &&
    shiftStats.lastOrderDropoffLng !== null
  ) {
    const detourKm = haversineDistance(
      shiftStats.lastOrderDropoffLat,
      shiftStats.lastOrderDropoffLng,
      pickupLat,
      pickupLng,
    )
    detourScore = Math.max(0, 1 - detourKm / MAX_ACCEPTABLE_DETOUR)
  }

  // 3. Traffic efficiency (20%)
  const trafficScore = Math.min(1.0, distanceKm / durationMin / 0.5)

  // 4. Fuel cost (15%) — taxi only
  let fuelScore = 1.0
  if (role === 'taxi') {
    const fuelCost = (distanceKm * fuelConsumption) / 100 * FUEL_PRICE_PER_LITER
    fuelScore = Math.max(0, (earnings - fuelCost) / earnings)
  }

  // Base weighted score
  const base =
    payScore * 0.40 +
    detourScore * 0.25 +
    trafficScore * 0.20 +
    fuelScore * 0.15

  // 5. Peak hours bonus
  const currentHour = new Date().getHours()
  const isPeak = PEAK_HOURS.some(([start, end]) => currentHour >= start && currentHour < end)
  const timeBonus = isPeak ? 1.15 : 1.0

  // 6. Platform inactivity bonus
  const lastActivity = lastPlatformActivity[platform]
  const minutesSince =
    lastActivity !== undefined ? (Date.now() - lastActivity) / 60_000 : Infinity
  const platformBonus = minutesSince > PLATFORM_INACTIVITY_THRESHOLD ? 1.1 : 1.0

  // 7. Short-order penalty (courier only)
  const shortPenalty =
    role === 'courier' && distanceKm < SHORT_ORDER_THRESHOLD ? 0.8 : 1.0

  const finalScore = base * timeBonus * platformBonus * shortPenalty

  return { score: finalScore, ...labelFromScore(finalScore) }
}
