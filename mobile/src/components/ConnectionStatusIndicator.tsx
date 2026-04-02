import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useSocketConnectionStore } from '../store/socketConnectionStore'
import { fonts } from '../theme/typography'
import type { AppColors } from '../theme/theme'

const DOT = { w: 8, h: 8, r: 4 }

type Props = {
  c: AppColors
  /** Short label e.g. "Live" / "Off" */
  label?: string
  compact?: boolean
}

export function ConnectionStatusIndicator({ c, label, compact }: Props) {
  const status = useSocketConnectionStore((s) => s.status)
  const live = status === 'connected'
  const pending = status === 'connecting' || status === 'reconnecting'

  return (
    <View style={styles.row} accessibilityLabel={label}>
      <View
        style={[
          styles.dot,
          {
            backgroundColor: pending ? '#F59E0B' : live ? '#22C55E' : '#EF4444',
            opacity: pending ? 0.95 : 1,
          },
        ]}
      />
      {!compact && !!label && (
        <Text style={[styles.lbl, { color: c.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: DOT.w, height: DOT.h, borderRadius: DOT.r },
  lbl: { fontSize: 11, fontFamily: fonts.medium, maxWidth: 120 },
})
