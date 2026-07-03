import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus, DeviceEventEmitter, NativeModules, Platform } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useDriverIngestStore, selectAvailableIngestOffers, type IngestedOffer } from '../store/driverIngestStore'
import { useAuthStore } from '../store/authStore'
import { useOrdersStore } from '../store/ordersStore'
import { useRoleStore } from '../store/roleStore'
import { ingestOfferToOrder, passiveAcceptToOrder } from '../utils/ingestToOrder'
import { computeProfitability } from '@drivemind/shared'
import i18n from '../i18n'
import type { Language } from '../store/languageStore'
import {
  isAllowedScrapePackage,
  resolveNotificationPackage,
} from '../constants/allowedIngestPackages'
import {
  parsePlnAmountFromText,
  parseDistanceKmFromText,
  parseEtaMinutesForPackage,
  isValidOrderBlob,
  isPlausibleRideFare,
} from './orderScrapeNormalize'
import { deriveSearchBlockedFromStore, syncOrderParsingGate } from './subscriptionGate'
import {
  syncNativeOverlayRadarLabel,
  syncNativeOverlayButtonLabels,
  localizedProfitTierTitle,
  formatOverlayPrice,
  formatOverlayMetrics,
  formatOverlayPrimaryRate,
} from '../utils/overlayI18n'
import { buildIngestOrderHash } from '../utils/orderIngestHash'
import { refreshOverlayFromIngestQueue } from './overlayFromIngest'
import { useLanguageStore } from '../store/languageStore'
import { EVENT_NOTIFICATION } from './notificationListener'

export { EVENT_NOTIFICATION }
export const EVENT_SCRAPE = 'DriveMindScrape'
export const EVENT_ORDER_SCRAPED = 'onOrderScraped'
export const EVENT_ORDER_ACCEPTED = 'onOrderAccepted'
export const EVENT_ORDER_COMPLETED = 'onOrderCompleted'

type DriveMindNativeType = {
  getBufferedNotificationsJson: () => Promise<string>
  clearNotificationBuffer: () => void
  getSoundEnabled: () => Promise<boolean>
  setSoundEnabled: (enabled: boolean) => void
  isOverlayPermissionGranted: () => Promise<boolean>
  requestOverlayPermission: () => void
  isUsageAccessGranted: () => Promise<boolean>
  requestUsageAccess: () => void
  setOverlayShiftActive: (active: boolean) => void
  /** Mirrors RN AppState (`active` | `background`) for native overlay lifecycle. */
  notifyAppLifecycleState: (state: string) => void
  updateOverlayProfitability: (
    tierTitle: string,
    primaryRateLine: string,
    formattedPrice: string,
    formattedMetrics: string,
    tierColorHex: string,
    packageName: string,
    contentHash: string,
  ) => void
  setOverlayRadarLabel: (label: string) => void
  setOverlayButtonLabels?: (acceptLabel: string, dismissLabel: string) => void
  setOrderParsingEnabled: (enabled: boolean) => void
  /** Show (or update) the floating tier pill with an explicit label + hex colour. */
  showOverlay: (text: string, color: string) => void
  /** Remove the floating tier pill from the screen. */
  hideOverlay: () => void
  triggerScraperWindow: () => void
  /** Re-read foreground whitelist driver app (shift active). */
  rescanForegroundDriverApp?: () => void
  /** Cache/show IDLE radar pill (used when shift starts with an empty queue). */
  showOverlayIdle?: () => void
  /** Optional: forward to `Log.d("DM_DEBUG", …)` from Kotlin for logcat parity. */
  logDmDebug?: (phase: string, detail: string, jsonPayload: string) => void
}

function getNative(): DriveMindNativeType | null {
  if (Platform.OS !== 'android') return null
  const m = NativeModules.DriveMindNative as DriveMindNativeType | undefined
  return m ?? null
}

/** Call after Accept in DriveMind or when opening provider app — extends burst scrape window. */
export function triggerScraperWindow(): void {
  try {
    getNative()?.triggerScraperWindow()
  } catch {
    /* noop */
  }
}

/** Force native accessibility to re-read the current whitelist driver screen. */
export function rescanForegroundDriverApp(): void {
  try {
    getNative()?.rescanForegroundDriverApp?.()
  } catch {
    /* noop */
  }
}

/** Immediately arm native overlay for an active shift (no async permission gate). */
export function armOverlayForActiveShift(): void {
  if (Platform.OS !== 'android') return
  const native = getNative()
  if (!native) return
  if (deriveSearchBlockedFromStore()) return
  if (useOrdersStore.getState().shiftStats.startTime === null) return
  try {
    native.setOverlayShiftActive(true)
    triggerScraperWindow()
    rescanForegroundDriverApp()
  } catch {
    /* noop */
  }
}

/** Sync offline notification buffer when network returns (entries < 1h). */
export async function syncBufferedNotificationsIfNeeded(): Promise<void> {
  const native = getNative()
  if (!native) return
  try {
    const raw = await native.getBufferedNotificationsJson()
    const arr = JSON.parse(raw) as {
      title: string
      text: string
      timestamp: number
      packageName: string
      sourcePackage?: string
    }[]
    if (!Array.isArray(arr) || arr.length === 0) return
    const hourAgo = Date.now() - 60 * 60 * 1000
    const ingest = useDriverIngestStore.getState().ingestFromNotification
    for (const row of arr) {
      const sourcePkg = row.sourcePackage ?? row.packageName
      const routedPackage = resolveNotificationPackage(
        row.packageName,
        row.title,
        row.text,
        sourcePkg,
      )
      if (!routedPackage) continue
      if (typeof row.timestamp === 'number' && row.timestamp >= hourAgo) {
        ingest({
          title: row.title ?? '',
          text: row.text ?? '',
          timestamp: row.timestamp,
          packageName: routedPackage,
          sourcePackage: sourcePkg,
        })
      }
    }
    native.clearNotificationBuffer()
  } catch (e) {
    console.warn('[DriveMind] syncBufferedNotificationsIfNeeded', e)
  }
}

function driveMindUiLanguage(): Language {
  const raw = (i18n.language || 'en').split('-')[0]
  if (raw === 'pl' || raw === 'uk' || raw === 'ru') return raw
  return 'en'
}

function rejectInvalidOrder(native: DriveMindNativeType | null, reason: string): void {
  warnIngestParse(reason)
  try {
    native?.hideOverlay()
  } catch {
    /* noop */
  }
}

function dmDebug(phase: string, detail: string, extra?: Record<string, unknown>) {
  if (!__DEV__) return
  const tail = extra && Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ''
  console.log(`DM_DEBUG ${phase}: ${detail}${tail}`)
  try {
    getNative()?.logDmDebug?.(phase, detail, JSON.stringify(extra ?? {}))
  } catch {
    /* noop */
  }
}

function warnIngestParse(message: string): void {
  if (__DEV__) console.warn(`[DriveMind] ${message}`)
}

function isWeekendOrNightNow(): boolean {
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()
  return day === 0 || day === 6 || hour >= 22 || hour < 6
}

/** Map a delivery-app package name to a human-readable platform label. */
function packageToPlatformName(pkg: string): string {
  if (pkg.includes('ubercab') || pkg.includes('uber')) return 'Uber'
  if (pkg.includes('bolt')) return 'Bolt'
  if (pkg.includes('glovo')) return 'Glovo'
  if (pkg.includes('wolt')) return 'Wolt'
  return 'App'
}

function packageToPlatformKey(pkg: string): string {
  if (pkg.includes('ubercab') || pkg.includes('uber')) return 'uber'
  if (pkg.includes('bolt') || pkg.includes('mtakso')) return 'bolt'
  if (pkg.includes('glovo')) return 'glovo'
  if (pkg.includes('wolt')) return 'wolt'
  return 'unknown'
}

/**
 * Subscribes to native notification + scrape events, TTL sweep, NetInfo sync.
 * Mount once under App.
 */
export function useDriverIngestBridge(enabled = true): void {
  const ingestNotification = useDriverIngestStore((s) => s.ingestFromNotification)
  const ingestScrape = useDriverIngestStore((s) => s.ingestFromScrape)
  const removeExpired = useDriverIngestStore((s) => s.removeExpiredFromQueue)
  const showToast = useDriverIngestStore((s) => s.showToast)
  const soundEnabled = useDriverIngestStore((s) => s.soundEnabled)
  const setSoundEnabled = useDriverIngestStore((s) => s.setSoundEnabled)
  const language = useLanguageStore((s) => s.language)

  const handlersRef = useRef({ ingestNotification, ingestScrape, removeExpired, showToast })
  const orderDedupeRef = useRef({ sig: '', at: 0 })
  /** Tracks recently-seen content hashes to prevent re-ingesting the same order across TTL expiry cycles. */
  const seenHashesRef = useRef<Map<string, number>>(new Map())
  // Tracks last value sent to setOverlayShiftActive so we avoid redundant native calls
  // that would trigger unnecessary Android window redraws and flicker.
  const lastOverlayActiveRef = useRef<boolean | null>(null)
  handlersRef.current = { ingestNotification, ingestScrape, removeExpired, showToast }

  useEffect(() => {
    if (!enabled || Platform.OS !== 'android') return
    syncNativeOverlayRadarLabel()
    syncNativeOverlayButtonLabels()
    syncOrderParsingGate()
  }, [language, enabled])

  // ── Event subscriptions + TTL sweep + NetInfo sync ──────────────────────────
  useEffect(() => {
    if (!enabled) return
    if (Platform.OS !== 'android') return

    const native = getNative()
    if (!native) {
      if (__DEV__) console.warn('[DriveMind] DriveMindNative module not found — bridge inactive')
      return
    }

    syncNativeOverlayRadarLabel()
    syncNativeOverlayButtonLabels()

    void native.getSoundEnabled().then((v) => {
      if (typeof v === 'boolean') setSoundEnabled(v)
    }).catch(() => { /* noop */ })

    void NetInfo.fetch().then(() => {
      void syncBufferedNotificationsIfNeeded()
    })

    // Replay notifications that arrived while RN bridge was inactive (background / cold start).
    const flushBuffer = () => { void syncBufferedNotificationsIfNeeded() }
    flushBuffer()
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') flushBuffer()
    })

    // ── 1. Notification listener (Uber + Bolt pushes) ────────────────────────
    const sub1 = DeviceEventEmitter.addListener(
      EVENT_NOTIFICATION,
      (payload: {
        title: string
        text: string
        timestamp: number
        packageName: string
        sourcePackage?: string
        brand?: string
        appName?: string
        price?: string
        distanceKm?: string
        etaMin?: string
        pickup?: string
        dropoff?: string
        currency?: string
      }) => {
        // Kotlin always emits strings (never null); normalize for RN bridge edge cases.
        const title = payload.title ?? ''
        const text = payload.text ?? ''
        const priceStr = payload.price ?? '0'
        const distanceStr = payload.distanceKm ?? '0'
        const etaStr = payload.etaMin ?? '0'
        const timestamp = typeof payload.timestamp === 'number' ? payload.timestamp : Date.now()
        const packageName = payload.packageName ?? ''

        const routedPackage = resolveNotificationPackage(
          packageName,
          title,
          text,
          payload.sourcePackage,
        )
        if (!routedPackage) {
          dmDebug('ORDER_DROPPED', 'notification — no brand match', {
            pkg: payload.packageName,
            sourcePackage: payload.sourcePackage,
          })
          return
        }
        const nativeNow = getNative()
        const blob = [priceStr, title, text].join('\n')
        const layoutValid = isValidOrderBlob(blob)
        dmDebug('ORDER_DETECTED', 'notification payload', {
          pkg: routedPackage,
          sourcePackage: payload.sourcePackage ?? packageName,
          brand: payload.brand,
          price: priceStr,
          layoutValid,
          title: title.slice(0, 80),
        })
        // Always list in OrderHub — subscription gate only blocks overlay / scrape.
        handlersRef.current.ingestNotification({
          title,
          text,
          timestamp,
          packageName: routedPackage,
          sourcePackage: payload.sourcePackage,
          price: priceStr !== '0' ? priceStr : undefined,
          distanceKm: distanceStr !== '0' ? distanceStr : undefined,
          etaMin: etaStr !== '0' ? etaStr : undefined,
          pickup: payload.pickup,
          dropoff: payload.dropoff,
        })

        if (deriveSearchBlockedFromStore()) return

        if (!layoutValid) {
          warnIngestParse('notification layout weak — listed in OrderHub, overlay skipped')
          return
        }

        // Auto-start shift on first valid intercepted order so the driver
        // doesn't have to manually toggle the shift before receiving offers.
        if (useOrdersStore.getState().shiftStats.startTime === null) {
          useOrdersStore.getState().startShiftManually()
        }

        armOverlayForActiveShift()

        if (!nativeNow) return
        const role = useRoleStore.getState().role ?? 'courier'
        dmDebug('PARSING_START', 'notification → profitability', { role })
        try {
          const price =
            parsePlnAmountFromText(blob) ||
            parsePlnAmountFromText(priceStr) ||
            Number.parseFloat(priceStr) ||
            0
          const parsedDistance = parseDistanceKmFromText(text) ?? parseDistanceKmFromText(distanceStr)
          const distanceKm =
            parsedDistance != null && parsedDistance > 0
              ? parsedDistance
              : (Number.parseFloat(distanceStr) > 0 ? Number.parseFloat(distanceStr) : null)
          const parsedEta =
            parseEtaMinutesForPackage(text, routedPackage) ??
            parseEtaMinutesForPackage(etaStr, routedPackage)
          const etaMin =
            parsedEta != null && parsedEta > 0
              ? parsedEta
              : (Number.parseInt(etaStr, 10) > 0 ? Number.parseInt(etaStr, 10) : null)
          if (price <= 0 || distanceKm == null || etaMin == null) {
            warnIngestParse('notification parse incomplete — skip profitability overlay')
            return
          }
          const result = computeProfitability({
            role,
            pricePLN: price,
            distanceKm,
            etaMin,
            dropoffLabel: text,
            isWeekendOrNight: isWeekendOrNightNow(),
          })
          dmDebug('PARSING_SUCCESS', 'notification parsed', {
            price,
            distanceKm,
            etaMin,
            tier: result.profitTier,
          })
          const tierTitle = localizedProfitTierTitle(result.profitTier)
          const ingestPrice = priceStr !== '0' ? priceStr : undefined
          const overlayHash = buildIngestOrderHash({
            platform: packageToPlatformKey(routedPackage),
            price: ingestPrice ?? '',
            text: [title, text, ingestPrice].filter(Boolean).join(' '),
          })
          try {
            nativeNow.updateOverlayProfitability(
              tierTitle,
              formatOverlayPrimaryRate(result.złPerKm ?? price / Math.max(0.2, distanceKm)),
              formatOverlayPrice(price),
              formatOverlayMetrics(distanceKm, etaMin),
              result.tierColor,
              routedPackage,
              overlayHash,
            )
            dmDebug('WIDGET_TRIGGERED', 'updateOverlayProfitability', {
              tier: result.profitTier,
              price,
              distanceKm,
              etaMin,
            })
          } catch (e) {
            dmDebug('PARSING_ERROR', 'overlay update failed', { reason: String(e) })
          }
        } catch (e) {
          dmDebug('PARSING_ERROR', 'notification parse failed', { reason: String(e) })
        }
      },
    )

    // ── 2. onOrderScraped — single source of truth for scrape ingest ─────────
    //
    // This is the primary path for all 4 platforms (Uber, Bolt, Glovo, Wolt).
    // Flow: scraper extracts order data → computeProfitability → showOverlay pill.
    const sub3 = DeviceEventEmitter.addListener(
      EVENT_ORDER_SCRAPED,
      (payload: {
        price: string
        distanceKm: string
        etaMin: string
        pickup: string
        dropoff: string
        surge: string
        packageName: string
      }) => {
        if (deriveSearchBlockedFromStore()) return
        if (!isAllowedScrapePackage(payload.packageName)) {
          dmDebug('ORDER_DROPPED', 'scrape — package not whitelisted', { pkg: payload.packageName })
          return
        }
        const platform = packageToPlatformKey(payload.packageName ?? '')
        const contentHash = buildIngestOrderHash({
          platform,
          price: payload.price ?? '',
          pickup: payload.pickup,
          destination: payload.dropoff,
          text: [payload.price, payload.pickup, payload.dropoff, payload.surge].filter(Boolean).join(' · '),
        })
        const now = Date.now()
        const dedupe = orderDedupeRef.current
        if (contentHash === dedupe.sig && now - dedupe.at < 180_000) {
          dmDebug('ORDER_DEDUPED', 'duplicate scrape ignored (short-term)', { dtMs: now - dedupe.at })
          return
        }
        const seenHashes = seenHashesRef.current
        const lastSeenAt = seenHashes.get(contentHash)
        if (lastSeenAt && now - lastSeenAt < 600_000) {
          dmDebug('ORDER_DEDUPED', 'duplicate scrape ignored (long-term seen cache)', { dtMs: now - lastSeenAt })
          dedupe.sig = contentHash
          dedupe.at = now
          return
        }
        dedupe.sig = contentHash
        dedupe.at = now
        seenHashes.set(contentHash, now)
        for (const [h, t] of seenHashes) {
          if (now - t > 600_000) seenHashes.delete(h)
        }

        const scrapeBlob = [
          payload.price,
          payload.distanceKm,
          payload.etaMin,
          payload.pickup,
          payload.dropoff,
        ]
          .filter(Boolean)
          .join('\n')
        const nativeNow = getNative()
        if (!isValidOrderBlob(scrapeBlob)) {
          rejectInvalidOrder(nativeNow, 'scrape failed order layout validator')
          return
        }

        dmDebug('ORDER_DETECTED', 'onOrderScraped', {
          pkg: payload.packageName,
          price: payload.price,
          distanceKm: payload.distanceKm,
          etaMin: payload.etaMin,
          pickup: payload.pickup?.slice(0, 40),
          dropoff: payload.dropoff?.slice(0, 40),
        })

        try {
          dmDebug('PARSING_START', 'ingest + compute', {})

          handlersRef.current.ingestScrape({
            price: payload.price,
            pickup: payload.pickup,
            destination: payload.dropoff,
            surge: payload.surge,
            packageName: payload.packageName,
            distanceKm: payload.distanceKm,
            etaMin: payload.etaMin,
          })

          if (!nativeNow) {
            dmDebug('PARSING_ERROR', 'native module missing', {})
            return
          }

          const price = parsePlnAmountFromText(
            [payload.price, payload.distanceKm, payload.dropoff, payload.etaMin, payload.pickup].filter(Boolean).join(' '),
          )
          const distKm =
            parseDistanceKmFromText(payload.distanceKm ?? '') ??
            parseDistanceKmFromText(payload.dropoff ?? '')
          const etaBlob = [payload.etaMin, payload.pickup, payload.dropoff].filter(Boolean).join(' ')
          const eta =
            parseEtaMinutesForPackage(etaBlob, payload.packageName) ??
            parseEtaMinutesForPackage(payload.dropoff ?? '', payload.packageName)
          if (price <= 0 || distKm == null || eta == null) {
            warnIngestParse('scrape parse incomplete — skip profitability overlay')
            return
          }
          const scrapeBlobFull = [payload.price, payload.distanceKm, payload.etaMin, payload.pickup, payload.dropoff]
            .filter(Boolean)
            .join('\n')
          if (!isPlausibleRideFare(price, scrapeBlobFull, distKm)) {
            warnIngestParse('scrape fare failed plausibility check — skip overlay/toast')
            return
          }

          if (useOrdersStore.getState().shiftStats.startTime === null) {
            useOrdersStore.getState().startShiftManually()
          }
          armOverlayForActiveShift()

          const role = useRoleStore.getState().role ?? 'courier'

          const result = computeProfitability({
            role,
            pricePLN: price,
            distanceKm: Math.max(0.2, distKm),
            etaMin: Math.max(1, eta),
            dropoffLabel: payload.dropoff,
            isWeekendOrNight: isWeekendOrNightNow(),
          })

          dmDebug('PARSING_SUCCESS', 'computeProfitability', {
            tier: result.profitTier,
            label: result.tierLabel,
            złPerKm: result.złPerKm?.toFixed(2),
            score: result.score0to100,
            price,
            distKm,
            eta,
          })

          const tierTitle = localizedProfitTierTitle(result.profitTier)
          const safeDist = Math.max(0.2, distKm)
          const safeEta = Math.max(1, eta)
          try {
            nativeNow.updateOverlayProfitability(
              tierTitle,
              formatOverlayPrimaryRate(result.złPerKm ?? price / safeDist),
              formatOverlayPrice(price),
              formatOverlayMetrics(safeDist, safeEta),
              result.tierColor,
              payload.packageName ?? '',
              contentHash,
            )
            dmDebug('WIDGET_TRIGGERED', 'updateOverlayProfitability', {
              tier: result.profitTier,
              price,
              distKm: safeDist,
              eta: safeEta,
            })
          } catch (e) {
            dmDebug('PARSING_ERROR', 'overlay update failed', { reason: String(e) })
          }

          if (AppState.currentState !== 'active') {
            const platName = packageToPlatformName(payload.packageName ?? '')
            const toastAmt = driveMindUiLanguage() === 'pl' && price > 0
              ? price.toFixed(2).replace('.', ',')
              : price > 0
                ? price.toFixed(2)
                : '--'
            handlersRef.current.showToast(
              `${localizedProfitTierTitle(result.profitTier)}  ${platName} · ${i18n.t('widget_price_pln', { amount: toastAmt })}`,
            )
          }
        } catch (e) {
          dmDebug('PARSING_ERROR', 'onOrderScraped pipeline failed', { reason: String(e) })
        }
      },
    )

    // ── 3. onOrderAccepted — passive accept attribution ──────────────────────
    //
    // Native scraper detects the offer-screen → active-trip-screen transition
    // (no clicks, READ-ONLY). We match against the live ingest queue by
    // content hash, then commit the trip to history + stats + wallet.
    const sub4 = DeviceEventEmitter.addListener(
      EVENT_ORDER_ACCEPTED,
      (payload: {
        price?: string
        distanceKm?: string
        etaMin?: string
        pickup?: string
        dropoff?: string
        surge?: string
        packageName?: string
        contentHash?: string
        acceptedAt?: number
      }) => {
        try {
          if (!isAllowedScrapePackage(payload.packageName ?? '')) {
            dmDebug('ORDER_ACCEPTED_DROPPED', 'package not whitelisted', {
              pkg: payload.packageName,
            })
            return
          }

          const platform = packageToPlatformKey(payload.packageName ?? '')
          const price = parsePlnAmountFromText(
            [payload.price, payload.distanceKm, payload.etaMin, payload.dropoff, payload.pickup]
              .filter(Boolean)
              .join(' '),
          )
          const distKm =
            parseDistanceKmFromText(payload.distanceKm ?? '') ??
            parseDistanceKmFromText(payload.dropoff ?? '')
          const etaMin =
            parseEtaMinutesForPackage(payload.etaMin ?? '', payload.packageName ?? '') ??
            parseEtaMinutesForPackage(payload.dropoff ?? '', payload.packageName ?? '')

          // Match incoming Accept against the live ingest queue. The scrape
          // ingest used the same `buildIngestOrderHash` shape, so recomputing
          // here gives us a one-to-one correspondence when the offer is still
          // alive in the queue.
          const expectedHash = buildIngestOrderHash({
            platform,
            price: payload.price ?? '',
            pickup: payload.pickup,
            destination: payload.dropoff,
            text: [payload.price, payload.pickup, payload.dropoff, payload.surge]
              .filter(Boolean)
              .join(' · '),
          })

          const offers = selectAvailableIngestOffers(useDriverIngestStore.getState())
          const matched: IngestedOffer | undefined =
            offers.find((o) => o.contentHash === expectedHash) ??
            (payload.contentHash
              ? offers.find((o) => o.contentHash === payload.contentHash)
              : undefined) ??
            offers.find(
              (o) =>
                o.platform === platform &&
                Math.abs(parseFloat((o.price ?? '0').replace(',', '.')) - (price || 0)) < 0.51,
            )

          const stableTripId = matched?.id ?? `accepted-${expectedHash}`

          const order = matched
            ? { ...ingestOfferToOrder(matched), id: stableTripId }
            : passiveAcceptToOrder({
                pricePLN: price || 0,
                distanceKm: distKm ?? 0,
                durationMin: etaMin ?? 0,
                platform,
                pickup: payload.pickup ?? '',
                dropoff: payload.dropoff ?? '',
                packageName: payload.packageName ?? '',
                id: stableTripId,
                contentHash: expectedHash,
              })

          // Override earnings/distance/duration with the latest native values
          // (they may be more accurate than the captured ingest snapshot).
          const finalOrder = {
            ...order,
            earnings: price > 0 ? price : order.earnings,
            distanceKm: distKm && distKm > 0 ? distKm : order.distanceKm,
            durationMin: etaMin && etaMin > 0 ? etaMin : order.durationMin,
          }

          dmDebug('ORDER_ACCEPTED', 'recording passive accept', {
            id: finalOrder.id,
            platform,
            price: finalOrder.earnings,
            distanceKm: finalOrder.distanceKm,
            durationMin: finalOrder.durationMin,
            matched: !!matched,
          })

          useOrdersStore.getState().recordActiveTrip(finalOrder)

          if (matched) {
            useDriverIngestStore.getState().removeOffer(matched.id)
          }
        } catch (e) {
          dmDebug('ORDER_ACCEPTED_ERROR', 'pipeline failed', { reason: String(e) })
        }
      },
    )

    // ── 3b. onOrderCompleted — passive Done detection (trip → completed) ───
    const sub4b = DeviceEventEmitter.addListener(
      EVENT_ORDER_COMPLETED,
      (payload: {
        price?: string
        distanceKm?: string
        etaMin?: string
        pickup?: string
        dropoff?: string
        packageName?: string
        contentHash?: string
        completedAt?: number
      }) => {
        try {
          if (!isAllowedScrapePackage(payload.packageName ?? '')) return

          const platform = packageToPlatformKey(payload.packageName ?? '')
          const expectedHash = buildIngestOrderHash({
            platform,
            price: payload.price ?? '',
            pickup: payload.pickup,
            destination: payload.dropoff,
            text: [payload.price, payload.pickup, payload.dropoff].filter(Boolean).join(' · '),
          })

          const { activeOrders } = useOrdersStore.getState()
          const matched =
            activeOrders.find((o) => o.id === `accepted-${expectedHash}`) ??
            (payload.contentHash
              ? activeOrders.find((o) => o.id.includes(payload.contentHash!))
              : undefined) ??
            activeOrders.find((o) => o.platform === platform)

          if (!matched) {
            dmDebug('ORDER_COMPLETED_DROPPED', 'no active trip to complete', {
              platform,
              contentHash: payload.contentHash,
            })
            return
          }

          dmDebug('ORDER_COMPLETED', 'completing passive trip', {
            id: matched.id,
            platform,
          })
          useOrdersStore.getState().completeOrder(matched.id)
        } catch (e) {
          dmDebug('ORDER_COMPLETED_ERROR', 'pipeline failed', { reason: String(e) })
        }
      },
    )

    // ── 4. Overlay button events ─────────────────────────────────────────────
    //
    // Native overlay buttons emit these events when the driver taps them on
    // the floating widget. We use them to keep JS state (driverIngestStore,
    // scraper window) consistent with the user's intent.

    // Accept: native already deep-launches the driver app + extends the scan
    // window. JS just needs to clear the matched offer from the live queue so
    // it doesn't keep showing in the OrderHub "Live offers" list.
    const sub5 = DeviceEventEmitter.addListener(
      'DriveMindOverlayAccept',
      (payload: { packageName?: string; contentHash?: string }) => {
        try {
          const hash = payload.contentHash ?? ''
          if (!hash) return
          const offers = selectAvailableIngestOffers(useDriverIngestStore.getState())
          const matched = offers.find((o) => o.contentHash === hash)
          if (matched) {
            useDriverIngestStore.getState().removeOffer(matched.id)
          }
          // Belt-and-suspenders: also extend the scan window from JS in case
          // the native side was throttled.
          triggerScraperWindow()
          dmDebug('OVERLAY_ACCEPT', 'native overlay accept handled', {
            packageName: payload.packageName,
            matched: !!matched,
          })
        } catch (e) {
          dmDebug('OVERLAY_ACCEPT_ERROR', 'failed', { reason: String(e) })
        }
      },
    )

    // Dismiss: remove the offer from the live queue. The overlay has already
    // collapsed itself back to the IDLE pill on the native side.
    const sub6 = DeviceEventEmitter.addListener(
      'DriveMindOverlayDismiss',
      (payload: { contentHash?: string; packageName?: string }) => {
        try {
          const hash = payload.contentHash ?? ''
          if (!hash) return
          const offers = selectAvailableIngestOffers(useDriverIngestStore.getState())
          const matched = offers.find((o) => o.contentHash === hash)
          if (matched) {
            useDriverIngestStore.getState().removeOffer(matched.id)
          }
          dmDebug('OVERLAY_DISMISS', 'native overlay dismiss handled', {
            matched: !!matched,
          })
        } catch (e) {
          dmDebug('OVERLAY_DISMISS_ERROR', 'failed', { reason: String(e) })
        }
      },
    )

    const ttl = setInterval(() => {
      handlersRef.current.removeExpired()
    }, 10_000)

    const unsubNet = NetInfo.addEventListener(() => {
      void syncBufferedNotificationsIfNeeded()
    })

    return () => {
      sub1.remove()
      sub3.remove()
      sub4.remove()
      sub4b.remove()
      sub5.remove()
      sub6.remove()
      clearInterval(ttl)
      unsubNet()
      appSub.remove()
    }
  }, [setSoundEnabled, enabled])

  // ── Overlay shift-state + AppState lifecycle (single effect — order matters) ─
  useEffect(() => {
    if (!enabled) return
    if (Platform.OS !== 'android') return
    const native = getNative()
    if (!native) return

    const pushNativeLifecycle = (appState: AppStateStatus) => {
      if (!native.notifyAppLifecycleState) return
      if (appState === 'active') {
        try {
          native.notifyAppLifecycleState('active')
        } catch {
          /* noop */
        }
      } else if (appState === 'background') {
        try {
          native.notifyAppLifecycleState('background')
        } catch {
          /* noop */
        }
      }
    }

    const applyOverlayShift = (nextActive: boolean) => {
      if (lastOverlayActiveRef.current === nextActive) return
      lastOverlayActiveRef.current = nextActive
      try {
        native.setOverlayShiftActive(nextActive)
      } catch {
        /* noop */
      }
    }

    const syncOverlay = (
      state: ReturnType<typeof useOrdersStore.getState>,
      options?: { armDriverOverlay?: boolean },
    ) => {
      const isShiftOn = state.shiftStats.startTime !== null
      if (deriveSearchBlockedFromStore()) {
        applyOverlayShift(false)
        return
      }
      const nextActive = isShiftOn
      applyOverlayShift(nextActive)
      if (!nextActive || options?.armDriverOverlay === false) return
      if (AppState.currentState === 'active') return

      triggerScraperWindow()
      rescanForegroundDriverApp()
      void syncBufferedNotificationsIfNeeded()
        .catch(() => { /* noop */ })
        .finally(() => {
          void refreshOverlayFromIngestQueue()
        })
    }

    pushNativeLifecycle(AppState.currentState)
    syncOverlay(useOrdersStore.getState(), {
      armDriverOverlay: AppState.currentState !== 'active',
    })

    const unsub = useOrdersStore.subscribe((state, prev) => {
      if (state.shiftStats.startTime !== prev.shiftStats.startTime) {
        syncOverlay(state, { armDriverOverlay: AppState.currentState !== 'active' })
      }
    })

    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        pushNativeLifecycle('active')
        syncOverlay(useOrdersStore.getState(), { armDriverOverlay: false })
      } else if (next === 'background') {
        pushNativeLifecycle('background')
        if (useOrdersStore.getState().shiftStats.startTime !== null) {
          rescanForegroundDriverApp()
        }
      }
    })

    void native.isOverlayPermissionGranted().then((granted) => {
      if (!granted && useOrdersStore.getState().shiftStats.startTime !== null && __DEV__) {
        console.warn('[DriveMind] overlay permission missing — accessibility overlay fallback')
      }
    }).catch(() => { /* noop */ })

    return () => {
      unsub()
      appSub.remove()
      try {
        if (lastOverlayActiveRef.current !== false) {
          lastOverlayActiveRef.current = false
          native.setOverlayShiftActive(false)
        }
      } catch {
        /* noop */
      }
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const unsubAuth = useAuthStore.subscribe((state, prev) => {
      if (
        state.isSearchBlocked !== prev.isSearchBlocked ||
        state.isSubscribed !== prev.isSubscribed ||
        state.completedOrdersCount !== prev.completedOrdersCount
      ) {
        syncOrderParsingGate()
      }
    })
    syncOrderParsingGate()
    return () => {
      unsubAuth()
    }
  }, [enabled])

  // ── Sound sync ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    if (Platform.OS !== 'android') return
    const n = getNative()
    if (!n) return
    try {
      n.setSoundEnabled(soundEnabled)
    } catch {
      /* noop */
    }
  }, [soundEnabled, enabled])

}
