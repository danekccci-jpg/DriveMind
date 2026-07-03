/**
 * Admin-only test data seeder.
 * Seeds realistic Kraków orders into the local Zustand store so the history
 * and calendar views are populated for QA without touching any remote DB.
 *
 * Guard: EXPO_PUBLIC_ADMIN_EMAILS / EXPO_PUBLIC_ADMIN_PUBLIC_IDS in local `.env` only.
 */
import { Timestamp } from 'firebase/firestore'
import { doc, setDoc } from 'firebase/firestore'
import { getFirestoreDb } from '../config/firebase'
import { useAuthStore } from '../store/authStore'
import type { CompletedOrder } from '../store/ordersStore'
import type { ProfitTier } from '@drivemind/shared'
import { generateUUIDv4 } from '../utils/secureRandom'

const ORDERS_COLLECTION = 'seeded_orders'

function parseCsvEnv(key: string): string[] {
  return (process.env[key] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const ADMIN_EMAILS = new Set(
  parseCsvEnv('EXPO_PUBLIC_ADMIN_EMAILS').map((e) => e.toLowerCase()),
)
const ADMIN_PUBLIC_IDS = new Set(parseCsvEnv('EXPO_PUBLIC_ADMIN_PUBLIC_IDS'))

// ── Guard ─────────────────────────────────────────────────────────────────────

export function isAdminUser(): boolean {
  if (ADMIN_EMAILS.size === 0 && ADMIN_PUBLIC_IDS.size === 0) return false
  const { userEmail, publicId } = useAuthStore.getState()
  const email = userEmail?.toLowerCase().trim() ?? ''
  return (
    (email.length > 0 && ADMIN_EMAILS.has(email)) ||
    (publicId != null && ADMIN_PUBLIC_IDS.has(publicId))
  )
}

// ── Kraków seed data ─────────────────────────────────────────────────────────

interface SeedRoute {
  platform: string
  pickupAddress: string
  dropoffAddress: string
  pickupLat: number
  pickupLng: number
  dropoffLat: number
  dropoffLng: number
  earnings: number
  distanceKm: number
  durationMin: number
  profitTier: ProfitTier
}

const KRAKOW_ROUTES: SeedRoute[] = [
  {
    platform: 'uber',
    pickupAddress: 'Galeria Krakowska, ul. Pawia 5',
    dropoffAddress: 'Wawel Royal Castle, Wawel 5',
    pickupLat: 50.0677,
    pickupLng: 19.9454,
    dropoffLat: 50.0540,
    dropoffLng: 19.9352,
    earnings: 18.50,
    distanceKm: 2.8,
    durationMin: 9,
    profitTier: 'EXCELLENT',
  },
  {
    platform: 'bolt',
    pickupAddress: 'Kazimierz, ul. Szeroka 28',
    dropoffAddress: 'Rynek Główny 1',
    pickupLat: 50.0496,
    pickupLng: 19.9472,
    dropoffLat: 50.0617,
    dropoffLng: 19.9373,
    earnings: 14.20,
    distanceKm: 1.9,
    durationMin: 7,
    profitTier: 'EXCELLENT',
  },
  {
    platform: 'glovo',
    pickupAddress: 'KFC Nowa Huta, al. Jana Pawła II 188',
    dropoffAddress: 'os. Złotego Wieku 12, Nowa Huta',
    pickupLat: 50.0688,
    pickupLng: 20.0523,
    dropoffLat: 50.0720,
    dropoffLng: 20.0391,
    earnings: 11.80,
    distanceKm: 1.6,
    durationMin: 12,
    profitTier: 'GOOD_DEAL',
  },
  {
    platform: 'wolt',
    pickupAddress: 'ul. Floriańska 15, Stare Miasto',
    dropoffAddress: 'Bronowice Małe, ul. Opolska 14',
    pickupLat: 50.0628,
    pickupLng: 19.9394,
    dropoffLat: 50.0752,
    dropoffLng: 19.8987,
    earnings: 22.40,
    distanceKm: 4.1,
    durationMin: 16,
    profitTier: 'EXCELLENT',
  },
  {
    platform: 'uber',
    pickupAddress: 'Dworzec Główny PKP, ul. Pawia 5',
    dropoffAddress: 'ICE Kraków, ul. Konopnickiej 17',
    pickupLat: 50.0670,
    pickupLng: 19.9450,
    dropoffLat: 50.0513,
    dropoffLng: 19.9218,
    earnings: 19.90,
    distanceKm: 3.3,
    durationMin: 11,
    profitTier: 'GOOD_DEAL',
  },
  {
    platform: 'bolt',
    pickupAddress: 'Bonarka City Center, ul. Kamieńskiego',
    dropoffAddress: 'AGH, al. Mickiewicza 30',
    pickupLat: 50.0282,
    pickupLng: 19.9546,
    dropoffLat: 50.0660,
    dropoffLng: 19.9128,
    earnings: 24.60,
    distanceKm: 5.2,
    durationMin: 18,
    profitTier: 'STANDARD',
  },
  {
    platform: 'glovo',
    pickupAddress: 'McDonald\'s Podgórze, ul. Limanowskiego 16',
    dropoffAddress: 'ul. Dietla 40',
    pickupLat: 50.0441,
    pickupLng: 19.9497,
    dropoffLat: 50.0560,
    dropoffLng: 19.9428,
    earnings: 9.50,
    distanceKm: 1.8,
    durationMin: 10,
    profitTier: 'GOOD_DEAL',
  },
  {
    platform: 'wolt',
    pickupAddress: 'Galeria Kazimierz, ul. Podgórska 34',
    dropoffAddress: 'Zabłocie, ul. Romanowicza 4',
    pickupLat: 50.0468,
    pickupLng: 19.9533,
    dropoffLat: 50.0485,
    dropoffLng: 19.9610,
    earnings: 7.80,
    distanceKm: 1.1,
    durationMin: 6,
    profitTier: 'GOOD_DEAL',
  },
  {
    platform: 'uber',
    pickupAddress: 'Kraków Airport, ul. Medweckiego 1',
    dropoffAddress: 'Hotel Grand, ul. Sławkowska 5/7',
    pickupLat: 50.0779,
    pickupLng: 19.7842,
    dropoffLat: 50.0637,
    dropoffLng: 19.9370,
    earnings: 52.00,
    distanceKm: 14.0,
    durationMin: 28,
    profitTier: 'STANDARD',
  },
  {
    platform: 'bolt',
    pickupAddress: 'Wieliczka, ul. Daniłowicza 10',
    dropoffAddress: 'Rondo Mogilskie, Kraków',
    pickupLat: 49.9850,
    pickupLng: 20.0638,
    dropoffLat: 50.0630,
    dropoffLng: 19.9560,
    earnings: 38.00,
    distanceKm: 12.5,
    durationMin: 25,
    profitTier: 'LOW_YIELD',
  },
]

interface DayCluster {
  daysAgo: number
  routes: SeedRoute[]
}

function buildDayClusters(): DayCluster[] {
  return [
    { daysAgo: 1, routes: KRAKOW_ROUTES.slice(0, 4) },
    { daysAgo: 5, routes: KRAKOW_ROUTES.slice(4, 7) },
    { daysAgo: 12, routes: KRAKOW_ROUTES.slice(7, 10) },
  ]
}

export function buildSeedOrders(): CompletedOrder[] {
  const now = Date.now()
  const MS_PER_DAY = 86_400_000

  const clusters = buildDayClusters()
  const allOrders: CompletedOrder[] = []

  for (const cluster of clusters) {
    const dayStart = now - cluster.daysAgo * MS_PER_DAY
    cluster.routes.forEach((route, i) => {
      const completedAt = dayStart + (9 + i) * 3_600_000 + i * 15 * 60_000

      allOrders.push({
        id: generateUUIDv4(),
        platform: route.platform,
        pickupAddress: route.pickupAddress,
        dropoffAddress: route.dropoffAddress,
        earnings: route.earnings,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        deadrunKm: 0,
        pickupLat: route.pickupLat,
        pickupLng: route.pickupLng,
        dropoffLat: route.dropoffLat,
        dropoffLng: route.dropoffLng,
        profitScore: Math.round((route.earnings / route.distanceKm) * 10),
        profitTier: route.profitTier,
        status: 'completed' as const,
        completedAt,
      })
    })
  }

  return allOrders
}

export function buildDayRoutePolyline(
  orders: CompletedOrder[],
): Array<{ latitude: number; longitude: number }> {
  if (orders.length === 0) return []
  const sorted = [...orders].sort((a, b) => a.completedAt - b.completedAt)
  const points: Array<{ latitude: number; longitude: number }> = []

  for (let i = 0; i < sorted.length; i++) {
    const o = sorted[i]
    points.push({ latitude: o.pickupLat, longitude: o.pickupLng })
    points.push({ latitude: o.dropoffLat, longitude: o.dropoffLng })
  }

  return points
}

export async function writeSeedOrdersToFirestore(orders: CompletedOrder[]): Promise<void> {
  const uid = useAuthStore.getState().firebaseUid
  if (!uid) return
  try {
    const db = getFirestoreDb()
    await Promise.all(
      orders.map((o) =>
        setDoc(doc(db, ORDERS_COLLECTION, uid, 'orders', o.id), {
          ...o,
          userId: uid,
          grossPrice: o.earnings,
          distance: o.distanceKm,
          createdAt: Timestamp.fromMillis(o.completedAt),
        }),
      ),
    )
  } catch {
    // Never block the UX on Firestore writes
  }
}
