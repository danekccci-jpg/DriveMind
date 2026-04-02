import type { Order } from '../store/ordersStore'
import { reverseGeocode } from '../services/directionsService'

function hasMeaningfulAddress(s: string | undefined): boolean {
  return typeof s === 'string' && s.trim().length > 0
}

function hasValidCoords(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
}

/**
 * Ensures pickup/dropoff strings for UI; reverse-geocodes when only coordinates are present.
 */
export async function ensureOrderTripLabels(order: Order): Promise<Order> {
  let pickupAddress = order.pickupAddress?.trim() ?? ''
  let dropoffAddress = order.dropoffAddress?.trim() ?? ''

  if (!hasMeaningfulAddress(pickupAddress) && hasValidCoords(order.pickupLat, order.pickupLng)) {
    pickupAddress = (await reverseGeocode(order.pickupLat, order.pickupLng)).trim()
  }
  if (!hasMeaningfulAddress(dropoffAddress) && hasValidCoords(order.dropoffLat, order.dropoffLng)) {
    dropoffAddress = (await reverseGeocode(order.dropoffLat, order.dropoffLng)).trim()
  }

  return {
    ...order,
    pickupAddress,
    dropoffAddress,
  }
}
