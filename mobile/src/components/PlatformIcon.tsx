import React from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Circle, Rect, Path, Text as SvgText } from 'react-native-svg'
import { fonts } from '../theme/typography'
import { useColors } from '../theme/theme'

type Platform = 'glovo' | 'uber' | 'bolt' | 'wolt'

interface Props {
  platform: Platform
  size?: number
  mono?: boolean
}

const BRAND_BG: Record<Platform, string> = {
  glovo: '#FFB800',
  uber: '#000000',
  bolt: '#34D186',
  wolt: '#00BCFF',
}

function GlovoSvg({ size, fill }: { size: number; fill: string }) {
  const cx = size / 2
  const r = size * 0.18
  const stemTop = cx + r
  const stemBot = size * 0.72
  const stemW = size * 0.07
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={cx} cy={cx * 0.72} r={r} fill={fill} />
      <Rect x={cx - stemW / 2} y={stemTop} width={stemW} height={stemBot - stemTop} rx={stemW / 2} fill={fill} />
      <Rect x={cx - size * 0.34 / 2} y={stemBot} width={size * 0.34} height={size * 0.07} rx={size * 0.07 / 2} fill={fill} />
    </Svg>
  )
}

function UberSvg({ size, fill }: { size: number; fill: string }) {
  const barW = size * 0.58
  const barH = size * 0.11
  const x = (size - barW) / 2
  const gap = barH * 1.7
  const midY = size / 2
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect x={x} y={midY - gap / 2 - barH / 2} width={barW} height={barH} rx={barH / 2} fill={fill} />
      <Rect x={x} y={midY + gap / 2 - barH / 2} width={barW} height={barH} rx={barH / 2} fill={fill} />
    </Svg>
  )
}

function BoltSvg({ size, fill }: { size: number; fill: string }) {
  const s = size
  const d = `M ${s * 0.58} ${s * 0.08} L ${s * 0.28} ${s * 0.52} L ${s * 0.47} ${s * 0.52} L ${s * 0.38} ${s * 0.92} L ${s * 0.72} ${s * 0.46} L ${s * 0.52} ${s * 0.46} Z`
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Path d={d} fill={fill} />
    </Svg>
  )
}

function WoltSvg({ size, fill }: { size: number; fill: string }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <SvgText x={size / 2} y={size * 0.69} fontSize={size * 0.52} fontWeight="700" fill={fill} textAnchor="middle" fontFamily={fonts.bold}>
        W
      </SvgText>
    </Svg>
  )
}

const SVG_MAP: Record<Platform, React.FC<{ size: number; fill: string }>> = {
  glovo: GlovoSvg,
  uber: UberSvg,
  bolt: BoltSvg,
  wolt: WoltSvg,
}

export default function PlatformIcon({ platform, size = 40, mono = false }: Props) {
  const c = useColors()
  const Icon = SVG_MAP[platform]

  if (mono) {
    const brand: Record<Platform, string> = { glovo: c.glovo, uber: c.uber, bolt: c.bolt, wolt: c.wolt }
    return (
      <View style={[st.container, { width: size, height: size }]}>
        <Icon size={size} fill={brand[platform]} />
      </View>
    )
  }

  const isUber = platform === 'uber'
  return (
    <View
      style={[
        st.container,
        {
          width: size,
          height: size,
          borderRadius: size * 0.22,
          backgroundColor: BRAND_BG[platform],
          borderWidth: isUber ? 1 : 0,
          borderColor: isUber ? c.border : 'transparent',
        },
      ]}
    >
      <Icon size={size} fill="#fff" />
    </View>
  )
}

const st = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
})
