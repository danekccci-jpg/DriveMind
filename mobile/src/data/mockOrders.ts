import { Order } from '../store/ordersStore'

export const MOCK_ORDERS: Order[] = [
  {
    id: 'order-1',
    platform: 'glovo',
    pickupAddress: 'ul. Floriańska 14, Stare Miasto',
    dropoffAddress: 'ul. Dietla 60, Kazimierz',
    earnings: 22.5,
    distanceKm: 2.4,
    durationMin: 12,
    deadrunKm: 0.6,
    pickupLat: 50.0618,
    pickupLng: 19.9394,
    dropoffLat: 50.0512,
    dropoffLng: 19.9438,
    profitScore: 87,
    profitLabel: 'great',
    status: 'pickup',
  },
  {
    id: 'order-2',
    platform: 'wolt',
    pickupAddress: 'ul. Lipowa 6, Kazimierz',
    dropoffAddress: 'ul. Kalwaryjska 24, Podgórze',
    earnings: 18.0,
    distanceKm: 3.1,
    durationMin: 15,
    deadrunKm: 0.9,
    pickupLat: 50.0505,
    pickupLng: 19.9452,
    dropoffLat: 50.0435,
    dropoffLng: 19.9502,
    profitScore: 64,
    profitLabel: 'good',
    status: 'pickup',
  },
  {
    id: 'order-3',
    platform: 'bolt',
    pickupAddress: 'ul. Grodzka 42, Stare Miasto',
    dropoffAddress: 'os. Teatralne 10, Nowa Huta',
    earnings: 38.0,
    distanceKm: 7.8,
    durationMin: 24,
    deadrunKm: 1.8,
    pickupLat: 50.0558,
    pickupLng: 19.9378,
    dropoffLat: 50.0712,
    dropoffLng: 20.0338,
    profitScore: 72,
    profitLabel: 'good',
    status: 'pickup',
  },
  {
    id: 'order-4',
    platform: 'uber',
    pickupAddress: 'ul. Długa 1, Krowodrza',
    dropoffAddress: 'ul. Karmelicka 35, Stare Miasto',
    earnings: 29.5,
    distanceKm: 3.6,
    durationMin: 13,
    deadrunKm: 0.7,
    pickupLat: 50.0702,
    pickupLng: 19.9278,
    dropoffLat: 50.0618,
    dropoffLng: 19.9327,
    profitScore: 91,
    profitLabel: 'great',
    status: 'pickup',
  },
  {
    id: 'order-5',
    platform: 'glovo',
    pickupAddress: 'ul. Starowiślna 12, Grzegórzki',
    dropoffAddress: 'ul. Mogilska 65, Grzegórzki',
    earnings: 21.0,
    distanceKm: 2.9,
    durationMin: 11,
    deadrunKm: 0.5,
    pickupLat: 50.0571,
    pickupLng: 19.9497,
    dropoffLat: 50.0639,
    dropoffLng: 19.9631,
    profitScore: 79,
    profitLabel: 'good',
    status: 'pickup',
  },
  {
    id: 'order-6',
    platform: 'bolt',
    pickupAddress: 'ul. Wielicka 28, Podgórze',
    dropoffAddress: 'Rynek Główny 1, Stare Miasto',
    earnings: 44.0,
    distanceKm: 5.2,
    durationMin: 18,
    deadrunKm: 2.0,
    pickupLat: 50.0402,
    pickupLng: 19.9558,
    dropoffLat: 50.0614,
    dropoffLng: 19.9372,
    profitScore: 95,
    profitLabel: 'great',
    status: 'pickup',
  },
]

/**
 * Returns the highest-scored order for use as the dashboard suggestion.
 * For taxi role, filters to ride-capable platforms (uber, bolt).
 */
export function getDashboardSuggestionOrder(role: 'courier' | 'taxi'): Order {
  const candidates =
    role === 'taxi'
      ? MOCK_ORDERS.filter((o) => o.platform === 'uber' || o.platform === 'bolt')
      : MOCK_ORDERS

  return candidates.reduce((best, o) => (o.profitScore > best.profitScore ? o : best))
}
