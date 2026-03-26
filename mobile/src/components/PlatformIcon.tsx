import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, Line, Rect, Path, Text as SvgText } from 'react-native-svg'
import { fonts } from '../theme/typography'

type Platform = 'glovo' | 'uber' | 'bolt' | 'wolt'

interface Props {
  platform: Platform
  size?: number
}

// ── Glovo: amber bg + white courier pin (circle + vertical stem + base bar) ──
function GlovoIcon({ size }: { size: number }) {
  const cx = size / 2
  const r = size * 0.18
  const stemTop = cx + r
  const stemBot = size * 0.72
  const stemW = size * 0.07
  const barY = stemBot
  const barW = size * 0.34
  const barH = size * 0.07
  const barR = barH / 2

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={cx} cy={cx * 0.72} r={r} fill="#fff" />
      <Rect
        x={cx - stemW / 2}
        y={stemTop}
        width={stemW}
        height={stemBot - stemTop}
        rx={stemW / 2}
        fill="#fff"
      />
      <Rect
        x={cx - barW / 2}
        y={barY}
        width={barW}
        height={barH}
        rx={barR}
        fill="#fff"
      />
    </Svg>
  )
}

// ── Uber: black bg + two white horizontal rounded stripes ──
function UberIcon({ size }: { size: number }) {
  const barW = size * 0.58
  const barH = size * 0.11
  const barR = barH / 2
  const x = (size - barW) / 2
  const gap = barH * 1.7
  const midY = size / 2
  const y1 = midY - gap / 2 - barH / 2
  const y2 = midY + gap / 2 - barH / 2

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect x={x} y={y1} width={barW} height={barH} rx={barR} fill="#fff" />
      <Rect x={x} y={y2} width={barW} height={barH} rx={barR} fill="#fff" />
    </Svg>
  )
}

// ── Bolt: green bg + white lightning bolt ──
function BoltIcon({ size }: { size: number }) {
  const s = size
  // Lightning bolt: top-right → middle-center → top-right-inner → bottom-left
  const path = `
    M ${s * 0.58} ${s * 0.08}
    L ${s * 0.28} ${s * 0.52}
    L ${s * 0.47} ${s * 0.52}
    L ${s * 0.38} ${s * 0.92}
    L ${s * 0.72} ${s * 0.46}
    L ${s * 0.52} ${s * 0.46}
    Z
  `
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Path d={path} fill="#fff" />
    </Svg>
  )
}

// ── Wolt: cyan bg + bold white "W" ──
function WoltIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <SvgText
        x={size / 2}
        y={size * 0.69}
        fontSize={size * 0.52}
        fontWeight="700"
        fill="#fff"
        textAnchor="middle"
        fontFamily={fonts.bold}
      >
        W
      </SvgText>
    </Svg>
  )
}

const BG: Record<Platform, string> = {
  glovo: '#FFB800',
  uber: '#000000',
  bolt: '#34D186',
  wolt: '#00BCFF',
}

export default function PlatformIcon({ platform, size = 40 }: Props) {
  const radius = size * 0.22
  const isUber = platform === 'uber'

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: BG[platform],
          borderWidth: isUber ? 1 : 0,
          borderColor: isUber ? '#2A2A2A' : 'transparent',
        },
      ]}
    >
      {platform === 'glovo' && <GlovoIcon size={size} />}
      {platform === 'uber' && <UberIcon size={size} />}
      {platform === 'bolt' && <BoltIcon size={size} />}
      {platform === 'wolt' && <WoltIcon size={size} />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
