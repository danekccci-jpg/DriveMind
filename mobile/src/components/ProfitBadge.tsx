import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { ProfitTier } from '@drivemind/shared'
import { useColors } from '../theme/theme'
import { localizedProfitTierTitle } from '../utils/overlayI18n'
import { normalizeProfitTier } from '../utils/profitTier'

interface Props {
  tier: ProfitTier | string
  score?: number
  showScore?: boolean
  /** Smaller padding/font for dense rows (e.g. OrderCard). */
  compact?: boolean
}

export default function ProfitBadge({ tier, score, showScore = false, compact = false }: Props) {
  const c = useColors()
  const normalized = normalizeProfitTier(tier)
  const colorMap: Record<ProfitTier, { color: string; bg: string }> = {
    EXCELLENT: { color: c.profitExcellent, bg: c.profitExcellentBg },
    GOOD_DEAL: { color: c.profitGoodDeal, bg: c.profitGoodDealBg },
    STANDARD: { color: c.profitStandard, bg: c.profitStandardBg },
    LOW_YIELD: { color: c.profitLowYield, bg: c.profitLowYieldBg },
  }
  const tone = colorMap[normalized]
  const title = localizedProfitTierTitle(normalized)
  const text = showScore && score !== undefined
    ? `${title} · ${score.toFixed(2)}`
    : title

  return (
    <View
      style={[
        styles.badge,
        compact && styles.badgeCompact,
        {
          backgroundColor: tone.bg,
          borderColor: tone.color,
        },
      ]}
    >
      <Text style={[styles.text, compact && styles.textCompact, { color: tone.color }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeCompact: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
  textCompact: {
    fontSize: 9,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
})
