import type { Order } from '../store/ordersStore'

function asNum(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : fallback
}

/** Maps backend / socket payloads (camelCase or snake_case) into our Order shape. */
export function mapRemoteOrderToOrder(raw: unknown): Order | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const id = String(r.id ?? r.order_id ?? r.orderId ?? '').trim()
  if (!id) return null

  const profitLabelRaw = String(r.profit_label ?? r.profitLabel ?? 'good').toLowerCase()
  const profitLabel: Order['profitLabel'] =
    profitLabelRaw === 'great' || profitLabelRaw === 'good' || profitLabelRaw === 'low'
      ? profitLabelRaw
      : 'good'

  return {
    id,
    platform: String(r.platform ?? 'glovo').toLowerCase(),
    pickupAddress: String(r.pickup_address ?? r.pickupAddress ?? ''),
    dropoffAddress: String(r.dropoff_address ?? r.dropoffAddress ?? ''),
    earnings: asNum(r.earnings ?? r.price ?? r.payout, 0),
    distanceKm: asNum(r.distance_km ?? r.distanceKm, 0),
    durationMin: Math.round(asNum(r.duration_min ?? r.durationMin, 0)),
    deadrunKm: asNum(r.deadrun_km ?? r.deadrunKm, 0),
    pickupLat: asNum(r.pickup_lat ?? r.pickupLat, 0),
    pickupLng: asNum(r.pickup_lng ?? r.pickupLng, 0),
    dropoffLat: asNum(r.dropoff_lat ?? r.dropoffLat, 0),
    dropoffLng: asNum(r.dropoff_lng ?? r.dropoffLng, 0),
    profitScore: Math.round(asNum(r.profit_score ?? r.profitScore, 0)),
    profitLabel,
    status: 'pickup',
  }
}
