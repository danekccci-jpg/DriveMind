import type { CompletedOrder } from '../store/ordersStore'

export interface DateRangeStats {
  totalEarnings: number
  totalDistanceKm: number
  orderCount: number
  plnPerKm: number
  plnPerHour: number
}

export function computeDateRangeStats(
  orders: CompletedOrder[],
  startMs: number,
  endMs: number,
): DateRangeStats {
  const filtered = orders.filter((order) => {
    const completedAt = typeof order.completedAt === 'number' ? order.completedAt : 0
    return completedAt >= startMs && completedAt <= endMs
  })

  const orderCount = filtered.length
  const totalEarnings = filtered.reduce((sum, order) => sum + (Number(order.earnings) || 0), 0)
  const totalDistanceKm = filtered.reduce((sum, order) => sum + (Number(order.distanceKm) || 0), 0)
  const totalMinutes = filtered.reduce((sum, order) => sum + (Number(order.durationMin) || 0), 0)

  return {
    totalEarnings,
    totalDistanceKm,
    orderCount,
    plnPerKm: totalDistanceKm > 0 ? totalEarnings / totalDistanceKm : 0,
    plnPerHour: totalMinutes > 0 ? (totalEarnings / totalMinutes) * 60 : 0,
  }
}
