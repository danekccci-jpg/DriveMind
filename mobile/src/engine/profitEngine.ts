import { Order, ShiftStats } from '../store/ordersStore'
import { computeProfitability } from '@drivemind/shared'

export type Role = 'courier' | 'taxi'
export type ProfitLabel = 'GREAT' | 'GOOD' | 'OK' | 'SKIP'

export interface ProfitScoreResult {
  score: number
  label: ProfitLabel
  color: string
}

const PEAK_HOURS: [number, number][] = [[12, 14], [18, 21]]

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
  _shiftStats: ShiftStats,
  role: Role,
  _fuelConsumption: number,
  _lastPlatformActivity: Record<string, number>,
): ProfitScoreResult {
  const currentHour = new Date().getHours()
  const isPeak = PEAK_HOURS.some(([start, end]) => currentHour >= start && currentHour < end)
  const trafficFactor = isPeak ? 1.15 : 1

  const profitability = computeProfitability({
    role,
    pricePLN: order.earnings,
    distanceKm: order.distanceKm + order.deadrunKm,
    etaMin: Math.max(order.durationMin, 1),
    trafficFactor,
    demandFactor: 1,
  })

  // Keep backward-compatible score range expected by existing badges/thresholds.
  const normalizedScore = profitability.score0to100 / 100
  let label: ProfitLabel = 'OK'
  if (profitability.recommendation === 'SKIP') label = 'SKIP'
  if (profitability.recommendation === 'TAKE') {
    label = profitability.score0to100 >= 80 ? 'GREAT' : 'GOOD'
  }
  if (profitability.recommendation === 'WAIT') label = 'OK'
  return { score: normalizedScore, ...labelFromScore(normalizedScore), label }
}
