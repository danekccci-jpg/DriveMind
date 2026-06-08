import React, { memo } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'

import PlatformIcon from '../../components/PlatformIcon'
import AnimatedButton from '../../components/AnimatedButton'
import { fonts } from '../../theme/typography'
import type { AppColors } from '../../theme/theme'
import type { Order } from '../../store/ordersStore'

type TierInfo = {
  tierColor: string
  tierLabel: string
} | null

type Props = {
  sheetMode: 'order' | 'blocked' | 'searching' | 'off_air'
  suggestion: Order | null
  tierForSuggestion: TierInfo
  c: AppColors
  onDismiss: () => void
  onAccept: () => void
  onOpenPaywall: () => void
  onStartShift: () => void
}

function rideStreetLine(full: string): string {
  const s = full?.trim() || '—'
  const i = s.indexOf(',')
  return i > 0 ? s.slice(0, i).trim() : s
}

function alpha(hex: string, a: number): string {
  const m = hex.trim().replace('#', '')
  const full = m.length === 3 ? `${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}` : m
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)
    ? `rgba(${r},${g},${b},${a})`
    : `rgba(255,255,255,${a})`
}

function DashboardBottomSheetInner({
  sheetMode,
  suggestion,
  tierForSuggestion,
  c,
  onDismiss,
  onAccept,
  onOpenPaywall,
  onStartShift,
}: Props) {
  const { t } = useTranslation()

  if (sheetMode === 'order' && suggestion) {
    return (
      <>
        <View style={sheetStyles.orderRow}>
          <PlatformIcon platform={suggestion.platform as any} size={24} active />
          <View style={sheetStyles.orderMid}>
            <View style={sheetStyles.orderTopLine}>
              {tierForSuggestion ? (
                <View
                  style={[
                    sheetStyles.tierPill,
                    {
                      borderColor: tierForSuggestion.tierColor,
                      backgroundColor: alpha(tierForSuggestion.tierColor, 0.14),
                    },
                  ]}
                >
                  <Text style={[sheetStyles.tierText, { color: tierForSuggestion.tierColor }]}>
                    {tierForSuggestion.tierLabel}
                  </Text>
                </View>
              ) : null}
              <Text style={[sheetStyles.priceText, { color: c.text }]}>
                {`${(suggestion.earnings ?? 0).toFixed(0)} zł`}
              </Text>
            </View>
            <Text style={[sheetStyles.addrLine, { color: c.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
              {`${rideStreetLine(suggestion.pickupAddress)} → ${rideStreetLine(suggestion.dropoffAddress)}`}
            </Text>
          </View>
        </View>

        <View style={sheetStyles.orderActionsRow}>
          <AnimatedButton
            style={[sheetStyles.dismissBtn, { backgroundColor: c.danger }]}
            activeOpacity={0.85}
            onPress={onDismiss}
            accessibilityLabel={t('driver_ingest_dismiss')}
          >
            <Feather name="x" size={20} color={c.textInverse} />
          </AnimatedButton>
          <AnimatedButton
            style={[sheetStyles.acceptBtn, { backgroundColor: c.primary }]}
            activeOpacity={0.85}
            onPress={onAccept}
          >
            <Text style={[sheetStyles.acceptBtnText, { color: c.textInverse }]}>
              {t('open_platform', {
                platform: (suggestion.platform ?? '').toString().slice(0, 1).toUpperCase() +
                  (suggestion.platform ?? '').toString().slice(1),
              })}
            </Text>
          </AnimatedButton>
        </View>
      </>
    )
  }

  if (sheetMode === 'blocked') {
    return (
      <TouchableOpacity
        style={[sheetStyles.searchBar, sheetStyles.searchBarBlocked, { borderColor: c.separator }]}
        activeOpacity={0.85}
        onPress={onOpenPaywall}
      >
        <Feather name="lock" size={16} color={c.danger} />
        <Text style={[sheetStyles.searchText, { color: c.textSecondary }]}>{t('searchStatusBlocked')}</Text>
      </TouchableOpacity>
    )
  }

  if (sheetMode === 'searching') {
    return (
      <View style={[sheetStyles.searchBar, { borderColor: c.separator }]}>
        <ActivityIndicator size="small" color={c.primary} />
        <Text style={[sheetStyles.searchText, { color: c.textSecondary }]}>{t('searchStatusActive')}</Text>
      </View>
    )
  }

  return (
    <View style={sheetStyles.offAirRow}>
      <Text style={[sheetStyles.offAirText, { color: c.textSecondary }]}>{t('off_air')}</Text>
      <AnimatedButton
        style={[sheetStyles.startShiftBtn, { backgroundColor: c.primary }]}
        activeOpacity={0.85}
        onPress={onStartShift}
      >
        <Text style={[sheetStyles.startShiftText, { color: c.textInverse }]}>{t('start_shift')}</Text>
      </AnimatedButton>
    </View>
  )
}

export const DashboardBottomSheet = memo(DashboardBottomSheetInner)

const sheetStyles = StyleSheet.create({
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  orderMid: { flex: 1, minWidth: 0 },
  orderTopLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  tierPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tierText: { fontSize: 11, fontFamily: fonts.semiBold, fontWeight: '600' },
  priceText: { fontSize: 16, fontFamily: fonts.bold, fontWeight: '700', marginLeft: 'auto' },
  addrLine: { fontSize: 13, fontFamily: fonts.regular },
  orderActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dismissBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  searchBarBlocked: { justifyContent: 'flex-start' },
  searchText: { fontSize: 14, fontFamily: fonts.medium },
  offAirRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  offAirText: { fontSize: 14, fontFamily: fonts.regular, flex: 1 },
  startShiftBtn: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startShiftText: { fontSize: 14, fontFamily: fonts.semiBold, fontWeight: '600' },
})
