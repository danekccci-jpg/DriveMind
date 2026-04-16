import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  NativeModules,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useColors, type AppColors } from '../../theme/theme'
import { fonts } from '../../theme/typography'

// ── Native module types ───────────────────────────────────────────────────────

type ServiceStatuses = {
  notificationListenerEnabled: boolean
  accessibilityServiceEnabled: boolean
  ignoringBatteryOptimizations: boolean
}

type DriveMindNativeType = {
  isOverlayPermissionGranted: () => Promise<boolean>
  requestOverlayPermission: () => void
  isUsageAccessGranted: () => Promise<boolean>
  requestUsageAccess: () => void
  getServiceStatuses: () => Promise<ServiceStatuses>
  openAccessibilitySettings: () => void
}

function getNative(): DriveMindNativeType | null {
  if (Platform.OS !== 'android') return null
  return (NativeModules.DriveMindNative as DriveMindNativeType | undefined) ?? null
}

// ── Permission state ──────────────────────────────────────────────────────────

type PermState = {
  overlay: boolean | null         // SYSTEM_ALERT_WINDOW
  accessibility: boolean | null   // AccessibilityService (scraper)
  usageStats: boolean | null      // PACKAGE_USAGE_STATS
}

const PERM_INITIAL: PermState = { overlay: null, accessibility: null, usageStats: null }

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PermissionsScreen() {
  const { t } = useTranslation()
  const c = useColors()
  const insets = useSafeAreaInsets()
  const native = getNative()
  const [perms, setPerms] = useState<PermState>(PERM_INITIAL)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refresh = useCallback(async () => {
    if (!native) {
      setLoading(false)
      return
    }
    try {
      const [overlay, usageStats, statuses] = await Promise.all([
        native.isOverlayPermissionGranted(),
        native.isUsageAccessGranted(),
        native.getServiceStatuses(),
      ])
      if (!mountedRef.current) return
      setPerms({ overlay, accessibility: statuses.accessibilityServiceEnabled, usageStats })
    } catch (e) {
      console.warn('[DriveMind] PermissionsScreen.refresh', e)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [native])

  // Re-check every time the screen comes into focus (returning from Android Settings).
  useFocusEffect(
    useCallback(() => { void refresh() }, [refresh]),
  )

  // Also re-check when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh()
    })
    return () => sub.remove()
  }, [refresh])

  const allGranted =
    perms.overlay === true &&
    perms.accessibility === true &&
    perms.usageStats === true

  return (
    <ScrollView
      style={[s.root, { backgroundColor: c.bg }]}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 16, paddingBottom: 48 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <Text style={[s.title, { color: c.text }]}>{t('perm_screen_title')}</Text>
      <Text style={[s.subtitle, { color: c.textSecondary }]}>{t('perm_screen_subtitle')}</Text>

      {/* ── All-granted banner ── */}
      {!loading && allGranted && (
        <View style={[s.banner, { backgroundColor: c.successDim, borderColor: c.success }]}>
          <Feather name="check-circle" size={18} color={c.success} />
          <Text style={[s.bannerText, { color: c.success }]}>{t('perm_all_granted')}</Text>
        </View>
      )}

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : (
        <>
          <SectionLabel label={t('perm_section_required')} c={c} />

          {/* Card 1 — Floating Window */}
          <PermCard
            c={c}
            icon="layers"
            title={t('perm_overlay_title')}
            subtitle={t('perm_overlay_desc')}
            granted={perms.overlay}
            checkingLabel={t('perm_checking')}
            grantedLabel={t('perm_overlay_granted')}
            deniedLabel={t('perm_overlay_denied')}
            actionLabel={perms.overlay ? t('perm_overlay_action_manage') : t('perm_overlay_action_grant')}
            onAction={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              native?.requestOverlayPermission()
            }}
          />

          {/* Card 2 — Order Reader (Accessibility Service) */}
          <PermCard
            c={c}
            icon="eye"
            title={t('perm_a11y_title')}
            subtitle={t('perm_a11y_desc')}
            granted={perms.accessibility}
            checkingLabel={t('perm_checking')}
            grantedLabel={t('perm_a11y_granted')}
            deniedLabel={t('perm_a11y_denied')}
            actionLabel={perms.accessibility ? t('perm_a11y_action_manage') : t('perm_a11y_action_grant')}
            onAction={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              native?.openAccessibilitySettings()
            }}
            danger={!perms.accessibility}
          />

          {/* Card 3 — App Usage Stats */}
          <PermCard
            c={c}
            icon="bar-chart-2"
            title={t('perm_usage_title')}
            subtitle={t('perm_usage_desc')}
            granted={perms.usageStats}
            checkingLabel={t('perm_checking')}
            grantedLabel={t('perm_usage_granted')}
            deniedLabel={t('perm_usage_denied')}
            actionLabel={perms.usageStats ? t('perm_usage_action_manage') : t('perm_usage_action_grant')}
            onAction={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              native?.requestUsageAccess()
            }}
          />

          <SectionLabel label={t('perm_section_how')} c={c} />
          <View style={[s.infoCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <InfoRow c={c} icon="shield"       text={t('perm_info_privacy')} />
            <InfoRow c={c} icon="zap"          text={t('perm_info_pill')} />
            <InfoRow c={c} icon="refresh-cw"   text={t('perm_info_refresh')} last />
          </View>

          <TouchableOpacity
            style={[s.refreshBtn, { borderColor: c.border }]}
            activeOpacity={0.7}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              setLoading(true)
              void refresh()
            }}
          >
            <Feather name="refresh-cw" size={15} color={c.textSecondary} />
            <Text style={[s.refreshBtnText, { color: c.textSecondary }]}>{t('perm_recheck')}</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Non-Android notice */}
      {Platform.OS !== 'android' && (
        <View style={[s.banner, { backgroundColor: c.warningDim, borderColor: c.warning }]}>
          <Feather name="info" size={16} color={c.warning} />
          <Text style={[s.bannerText, { color: c.warning }]}>{t('perm_android_only')}</Text>
        </View>
      )}
    </ScrollView>
  )
}

// ── Permission Card ───────────────────────────────────────────────────────────

function PermCard({
  c,
  icon,
  title,
  subtitle,
  granted,
  checkingLabel,
  grantedLabel,
  deniedLabel,
  actionLabel,
  onAction,
  danger = false,
}: {
  c: AppColors
  icon: React.ComponentProps<typeof Feather>['name']
  title: string
  subtitle: string
  granted: boolean | null
  checkingLabel: string
  grantedLabel: string
  deniedLabel: string
  actionLabel: string
  onAction: () => void
  danger?: boolean
}) {
  const isGranted = granted === true
  const isPending = granted === null

  const statusColor = isPending ? c.textMuted : isGranted ? c.success : c.danger
  const statusBg    = isPending ? 'transparent' : isGranted ? c.successDim : c.dangerDim
  const statusBorder = isPending ? c.border : isGranted ? c.success : c.danger
  const statusLabel = isPending ? checkingLabel : isGranted ? grantedLabel : deniedLabel
  const statusIcon: React.ComponentProps<typeof Feather>['name'] = isPending
    ? 'loader'
    : isGranted
    ? 'check-circle'
    : 'alert-circle'

  const cardBorderColor = !isPending && !isGranted && danger ? c.danger : c.border
  const cardBg = !isPending && !isGranted && danger ? c.dangerDim : c.surface

  return (
    <View style={[s.permCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
      {/* Top row: icon + title + status badge */}
      <View style={s.permCardHeader}>
        <View style={[s.permIconWrap, { backgroundColor: c.surfaceAlt }]}>
          <Feather name={icon} size={20} color={isGranted ? c.success : c.textSecondary} />
        </View>
        <Text style={[s.permTitle, { color: c.text }]}>{title}</Text>
        <View style={[s.statusBadge, { backgroundColor: statusBg, borderColor: statusBorder }]}>
          <Feather name={statusIcon} size={12} color={statusColor} />
          <Text style={[s.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      <Text style={[s.permDesc, { color: c.textSecondary }]}>{subtitle}</Text>

      <TouchableOpacity
        style={[
          s.actionBtn,
          {
            backgroundColor: isGranted ? c.surfaceAlt : c.primary,
            borderColor: isGranted ? c.border : c.primary,
          },
        ]}
        activeOpacity={0.75}
        onPress={onAction}
      >
        <Text style={[s.actionBtnText, { color: isGranted ? c.textSecondary : '#FFFFFF' }]}>
          {actionLabel}
        </Text>
        <Feather name="arrow-right" size={14} color={isGranted ? c.textMuted : '#FFFFFF'} />
      </TouchableOpacity>
    </View>
  )
}

// ── Info Row ──────────────────────────────────────────────────────────────────

function InfoRow({
  c,
  icon,
  text,
  last = false,
}: {
  c: AppColors
  icon: React.ComponentProps<typeof Feather>['name']
  text: string
  last?: boolean
}) {
  return (
    <View
      style={[
        s.infoRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator },
      ]}
    >
      <View style={[s.infoIconWrap, { backgroundColor: c.primaryDim }]}>
        <Feather name={icon} size={14} color={c.primary} />
      </View>
      <Text style={[s.infoText, { color: c.textSecondary }]}>{text}</Text>
    </View>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label, c }: { label: string; c: AppColors }) {
  return <Text style={[s.sectionLabel, { color: c.textMuted }]}>{label}</Text>
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20 },

  title: { fontSize: 22, fontFamily: fonts.bold, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, fontFamily: fonts.regular, lineHeight: 21, marginBottom: 20 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  bannerText: { flex: 1, fontSize: 13, fontFamily: fonts.medium, lineHeight: 18 },

  loadingWrap: { paddingVertical: 60, alignItems: 'center' },

  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.medium,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 4,
  },

  // ── Permission card ─────────────────────────────────────────────────────────
  permCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14, gap: 12 },
  permCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  permIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  permTitle: { flex: 1, fontSize: 16, fontFamily: fonts.semiBold },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, flexShrink: 0,
  },
  statusLabel: { fontSize: 11, fontFamily: fonts.medium },
  permDesc: { fontSize: 13, fontFamily: fonts.regular, lineHeight: 19 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, borderRadius: 10, borderWidth: 1, paddingVertical: 11, paddingHorizontal: 16,
  },
  actionBtnText: { fontSize: 14, fontFamily: fonts.semiBold },

  // ── Info card ───────────────────────────────────────────────────────────────
  infoCard: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginBottom: 20 },
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  infoIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: fonts.regular, lineHeight: 19 },

  // ── Refresh button ──────────────────────────────────────────────────────────
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1, borderRadius: 10, paddingVertical: 12,
  },
  refreshBtnText: { fontSize: 13, fontFamily: fonts.medium },
})
