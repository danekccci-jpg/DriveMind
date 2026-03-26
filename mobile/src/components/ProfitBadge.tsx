import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { ProfitLabel } from '../engine/profitEngine'

const LABEL_COLOR: Record<ProfitLabel, string> = {
  GREAT: '#22C55E',
  GOOD: '#F59E0B',
  OK: '#888888',
  SKIP: '#EF4444',
}

interface Props {
  label: ProfitLabel
  score?: number
  showScore?: boolean
}

export default function ProfitBadge({ label, score, showScore = false }: Props) {
  const color = LABEL_COLOR[label]
  const text = showScore && score !== undefined
    ? `${label} · ${score.toFixed(2)}`
    : label

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: color + '20',
          borderColor: color + '40',
        },
      ]}
    >
      <Text style={[styles.text, { color }]}>{text}</Text>
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
