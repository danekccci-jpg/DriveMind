import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { fonts } from '../../theme/typography'
import type { AppColors } from '../../theme/theme'
import { ROUTE_STROKE_MAIN } from './NavigationMapLayers'

type Props = {
  maneuver?: string
  distanceLine: string
  streetName: string
  topInset: number
  c: AppColors
}

function maneuverIcon(m?: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const normalized = (m ?? '').toLowerCase()
  if (normalized.includes('left')) return 'arrow-left-bold'
  if (normalized.includes('right')) return 'arrow-right-bold'
  return 'arrow-up-bold'
}

export function DirectionCard({ maneuver, distanceLine, streetName, topInset, c }: Props) {
  return (
    <View style={[s.card, { top: topInset, backgroundColor: c.surface, borderColor: c.separator }]}>
      <View style={[s.iconWrap, { backgroundColor: c.surfaceAlt }]}>
        <MaterialCommunityIcons name={maneuverIcon(maneuver)} size={42} color={ROUTE_STROKE_MAIN} />
      </View>
      <View style={s.copy}>
        <Text style={[s.distance, { color: c.text }]}>{distanceLine}</Text>
        <Text style={[s.street, { color: c.textSecondary }]} numberOfLines={1}>
          {streetName || 'Continue straight'}
        </Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  distance: { fontSize: 27, fontFamily: fonts.bold, fontWeight: '700', letterSpacing: -0.4 },
  street: { marginTop: 2, fontSize: 14, fontFamily: fonts.medium },
})
