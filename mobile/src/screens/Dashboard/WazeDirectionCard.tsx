import React, { memo, useEffect, useMemo, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import Svg, { Path, G } from 'react-native-svg'
import { fonts } from '../../theme/typography'
import { useTheme } from '../../theme/theme'

// ── Maneuver classification ──────────────────────────────────────────────────

type ManeuverKind =
  | 'left'
  | 'sharp-left'
  | 'right'
  | 'sharp-right'
  | 'uturn'
  | 'roundabout'
  | 'straight'

function classifyManeuver(m?: string): ManeuverKind {
  const n = (m ?? '').toLowerCase()
  if (n.includes('uturn') || n.includes('u-turn')) return 'uturn'
  if (n.includes('roundabout') || n.includes('rotary')) return 'roundabout'
  if (n.includes('sharp') && n.includes('left')) return 'sharp-left'
  if (n.includes('sharp') && n.includes('right')) return 'sharp-right'
  if (n.includes('left') || n.includes('slight-left') || n.includes('merge-left')) return 'left'
  if (n.includes('right') || n.includes('slight-right') || n.includes('merge-right')) return 'right'
  return 'straight'
}

// ── SVG icon paths (64×64 viewBox) ──────────────────────────────────────────

const ICON_COLOR = '#FFFFFF'
const ICON_SIZE = 52

function ArrowStraight() {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 64 64">
      <G stroke={ICON_COLOR} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M32 54 L32 14" />
        <Path d="M18 28 L32 14 L46 28" />
      </G>
    </Svg>
  )
}

function ArrowLeft() {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 64 64">
      <G stroke={ICON_COLOR} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M38 54 L38 28 Q38 16 26 16 L14 16" />
        <Path d="M26 8 L14 16 L26 24" />
      </G>
    </Svg>
  )
}

function ArrowSharpLeft() {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 64 64">
      <G stroke={ICON_COLOR} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M38 54 L38 38 L14 16" />
        <Path d="M14 30 L14 16 L28 16" />
      </G>
    </Svg>
  )
}

function ArrowRight() {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 64 64">
      <G stroke={ICON_COLOR} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M26 54 L26 28 Q26 16 38 16 L50 16" />
        <Path d="M38 8 L50 16 L38 24" />
      </G>
    </Svg>
  )
}

function ArrowSharpRight() {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 64 64">
      <G stroke={ICON_COLOR} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M26 54 L26 38 L50 16" />
        <Path d="M50 30 L50 16 L36 16" />
      </G>
    </Svg>
  )
}

function ArrowUTurn() {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 64 64">
      <G stroke={ICON_COLOR} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M38 54 L38 28 Q38 10 22 10 Q8 10 8 24 L8 38" />
        <Path d="M28 46 L38 54 L48 46" />
      </G>
    </Svg>
  )
}

function RoundaboutIcon() {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 64 64">
      <G stroke={ICON_COLOR} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M32 14 A18 18 0 1 1 14 32" />
        <Path d="M46 14 L54 8 L54 22" />
        <Path d="M8 32 L14 32" />
      </G>
    </Svg>
  )
}

function ManeuverIcon({ kind }: { kind: ManeuverKind }) {
  switch (kind) {
    case 'left':
      return <ArrowLeft />
    case 'sharp-left':
      return <ArrowSharpLeft />
    case 'right':
      return <ArrowRight />
    case 'sharp-right':
      return <ArrowSharpRight />
    case 'uturn':
      return <ArrowUTurn />
    case 'roundabout':
      return <RoundaboutIcon />
    default:
      return <ArrowStraight />
  }
}

// ── Card component ───────────────────────────────────────────────────────────

type Props = {
  maneuver?: string
  distanceLine: string
  streetName: string
  etaText: string
  topInset: number
}

function WazeDirectionCardInner({ maneuver, distanceLine, streetName, etaText, topInset }: Props) {
  const { colors: c } = useTheme()
  const kind = classifyManeuver(maneuver)
  const slideY = useRef(new Animated.Value(-18)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 90, friction: 14 }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start()
  }, [opacity, slideY])

  const centerLine = useMemo(() => {
    const d = distanceLine?.trim() || '—'
    const s = streetName?.trim() || 'Continue'
    return `${d}  —  ${s}`
  }, [distanceLine, streetName])

  const content = (
    <View style={s.inner}>
      <View style={s.leftIcon}>
        <ManeuverIcon kind={kind} />
      </View>

      <View style={s.center}>
        <Text style={[s.centerText, { color: c.text }]} numberOfLines={1}>
          {centerLine}
        </Text>
      </View>

      <View style={s.right}>
        <Text style={[s.etaLabel, { color: c.textMuted }]}>ETA</Text>
        <Text style={[s.etaValue, { color: c.text }]} numberOfLines={1}>
          {etaText || '—'}
        </Text>
      </View>
    </View>
  )

  const useBlur = Platform.OS !== 'web'

  return (
    <Animated.View
      style={[s.card, { top: topInset, opacity, transform: [{ translateY: slideY }] }]}
      pointerEvents="none"
    >
      {useBlur ? (
        <BlurView intensity={70} tint="dark" style={s.blur}>
          {content}
        </BlurView>
      ) : (
        <View style={s.webBg}>{content}</View>
      )}
    </Animated.View>
  )
}

export const WazeDirectionCard = memo(WazeDirectionCardInner)

const s = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.34,
    shadowRadius: 18,
    elevation: 12,
  },
  blur: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  webBg: {
    backgroundColor: 'rgba(10,14,28,0.88)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  leftIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
  },
  centerText: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  right: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    width: 78,
  },
  etaLabel: {
    fontSize: 10,
    fontFamily: fonts.medium,
    letterSpacing: 0.8,
  },
  etaValue: {
    marginTop: 2,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
})

