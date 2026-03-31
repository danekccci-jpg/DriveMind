import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { ProfitLabel } from '../engine/profitEngine'
import { useColors } from '../theme/theme'

interface Props {
  label: ProfitLabel
  score?: number
  showScore?: boolean
}

export default function ProfitBadge({ label, score, showScore = false }: Props) {
  const c = useColors()
  const colorMap: Record<ProfitLabel, { color: string; bg: string }> = {
    GREAT: { color: c.profitGreat, bg: c.profitGreatBg },
    GOOD: { color: c.profitGood, bg: c.profitGoodBg },
    OK: { color: c.profitOk, bg: c.profitOkBg },
    SKIP: { color: c.profitSkip, bg: c.profitSkipBg },
  }
  const normalized = String(label).toUpperCase() as ProfitLabel
  const tone = colorMap[normalized] ?? colorMap.OK
  const text = showScore && score !== undefined
    ? `${normalized} · ${score.toFixed(2)}`
    : normalized

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: tone.bg,
          borderColor: tone.color,
        },
      ]}
    >
      <Text style={[styles.text, { color: tone.color }]}>{text}</Text>
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
  text: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
})
