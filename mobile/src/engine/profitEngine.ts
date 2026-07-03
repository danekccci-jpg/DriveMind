import { Order, ShiftStats } from '../store/ordersStore'
import { computeProfitability } from '@drivemind/shared'
import type { ProfitTier } from '@drivemind/shared'

export type Role = 'courier' | 'taxi'

export type { ProfitTier }

export interface ProfitScoreResult {
  score: number
  color: string
  profitTier: ProfitTier
  /** Emoji shorthand matching the tier for quick display. */
  tierEmoji: '🟢' | '🟡' | '⚪' | '🔴'
  /** True when a 30 % out-of-city penalty was applied. */
  isOutOfCity: boolean
  /** Shared tier label (emoji + name), e.g. \"🟢 Excellent\". */
  tierLabel: string
  /** Shared tier color hex. */
  tierColor: string
  /** Gross zł/km (Brutto). */
  złPerKm: number
}

const PEAK_HOURS: [number, number][] = [[12, 14], [18, 21]]
const NIGHT_START = 22
const NIGHT_END = 6

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

/** Returns true on Sat/Sun or between 22:00–06:00 (night hours). */
function isWeekendOrNight(): boolean {
  const now = new Date()
  const day = now.getDay() // 0 = Sun, 6 = Sat
  const hour = now.getHours()
  const isWeekend = day === 0 || day === 6
  const isNight = hour >= NIGHT_START || hour < NIGHT_END
  return isWeekend || isNight
}

function tierEmoji(tier: ProfitTier): '🟢' | '🟡' | '⚪' | '🔴' {
  if (tier === 'EXCELLENT') return '🟢'
  if (tier === 'GOOD_DEAL') return '🟡'
  if (tier === 'STANDARD') return '⚪'
  return '🔴'
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
    dropoffLabel: order.dropoffAddress,
    isWeekendOrNight: isWeekendOrNight(),
    trafficFactor,
    demandFactor: 1,
  })

  const normalizedScore = profitability.score0to100 / 100

  return {
    score: normalizedScore,
    color: profitability.tierColor,
    profitTier: profitability.profitTier,
    tierEmoji: tierEmoji(profitability.profitTier),
    isOutOfCity: profitability.isOutOfCity,
    tierLabel: profitability.tierLabel,
    tierColor: profitability.tierColor,
    złPerKm: profitability.złPerKm,
  }
}
