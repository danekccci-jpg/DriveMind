import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Line } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { fonts } from '../theme/typography'
import { useColors } from '../theme/theme'

const PICKUP_DOT = '#1A5CFF'
const DROPOFF_DOT = '#EA580C'

type Props = {
  pickupAddress: string
  dropoffAddress: string
  distanceKm: number
  compact?: boolean
  /** Use fixed light-on-white palette (e.g. Zarobki list on a white card while app theme is dark). */
  lightSurface?: boolean
}

export function RouteSummary({ pickupAddress, dropoffAddress, distanceKm, compact, lightSurface }: Props) {
  const { t } = useTranslation()
  const c = useColors()
  const distLabel = `${distanceKm.toFixed(1)} km ${t('ui_total_dist')}`
  const midH = compact ? 32 : 44

  const textColor = lightSurface ? '#111827' : c.text
  const labelColor = lightSurface ? '#6B7280' : c.textMuted
  const badgeBg = lightSurface ? '#F3F4F6' : c.surfaceAlt
  const badgeTextCol = lightSurface ? '#374151' : c.textSecondary
  const lineColor = lightSurface ? '#94A3B8' : c.separator
  const dotBorder = lightSurface ? '#FFFFFF' : c.surface

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.row}>
        <View style={styles.leftRail}>
          <View style={[styles.dot, { backgroundColor: PICKUP_DOT, borderColor: dotBorder }]} />
          <Svg width={2} height={midH}>
            {/* strokeDasharray: supported at runtime; types omit it in some RN-SVG versions */}
            <Line
              x1="1"
              y1="0"
              x2="1"
              y2={midH}
              stroke={lineColor}
              strokeWidth={2}
              {...({ strokeDasharray: '5 5' } as Record<string, string | number>)}
            />
          </Svg>
          <View style={[styles.dot, { backgroundColor: DROPOFF_DOT, borderColor: dotBorder }]} />
        </View>

        <View style={styles.textCol}>
          <View style={[styles.pointBlock, compact && styles.pointBlockCompact]}>
            <Text style={[styles.label, { color: labelColor }]}>{t('ui_pickup_loc')}</Text>
            <Text style={[styles.address, { color: textColor }]} numberOfLines={4}>
              {pickupAddress || '—'}
            </Text>
          </View>

          <View style={[styles.badge, { backgroundColor: badgeBg }, compact && styles.badgeCompact]}>
            <Text style={[styles.badgeText, { color: badgeTextCol }]}>{distLabel}</Text>
          </View>

          <View style={[styles.pointBlock, compact && styles.pointBlockCompact]}>
            <Text style={[styles.label, { color: labelColor }]}>{t('ui_dropoff_loc')}</Text>
            <Text style={[styles.address, { color: textColor }]} numberOfLines={4}>
              {dropoffAddress || '—'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    paddingVertical: 4,
  },
  wrapCompact: {
    paddingVertical: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  leftRail: {
    width: 18,
    alignItems: 'center',
    marginRight: 12,
    paddingTop: 4,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  pointBlock: {
    marginBottom: 2,
  },
  pointBlockCompact: {
    marginBottom: 0,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.medium,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  address: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fonts.medium,
    fontWeight: '500',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginVertical: 10,
  },
  badgeCompact: {
    marginVertical: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: fonts.medium,
  },
})
