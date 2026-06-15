import React from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Circle, Rect, Path } from 'react-native-svg'
import { useColors } from '../theme/theme'

export type Platform = 'glovo' | 'uber' | 'bolt' | 'wolt'

interface Props {
  platform: Platform
  size?: number
  active?: boolean
}

function GlovoSvg({ size, fill }: { size: number; fill: string }) {
  const cx = 12
  const r = 4.2
  const stemTop = cx + r
  const stemBot = 18.2
  const stemW = 1.6
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={cx} cy={8.6} r={r} fill={fill} />
      <Rect x={cx - stemW / 2} y={stemTop} width={stemW} height={stemBot - stemTop} rx={stemW / 2} fill={fill} />
      <Rect x={7.9} y={stemBot} width={8.2} height={1.7} rx={0.85} fill={fill} />
    </Svg>
  )
}

function UberSvg({ size, fill }: { size: number; fill: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M7.5 5.7V13.5C7.5 16.3 9.45 18.1 12 18.1C14.55 18.1 16.5 16.3 16.5 13.5V5.7H14.65V13.3C14.65 15.0 13.6 16.15 12 16.15C10.4 16.15 9.35 15.0 9.35 13.3V5.7H7.5Z"
        fill={fill}
      />
    </Svg>
  )
}

function BoltSvg({ size, fill }: { size: number; fill: string }) {
  const d = 'M 14 2 L 6.7 12.5 L 11.3 12.5 L 9.1 22 L 17.3 11.1 L 12.5 11.1 Z'
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill={fill} />
    </Svg>
  )
}

function WoltSvg({ size, fill }: { size: number; fill: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3.6 7.1C4.35 7.1 4.95 7.65 5.1 8.45L6.25 14.35L8.55 9.75C8.85 9.15 9.55 8.95 10.1 9.25C10.45 9.45 10.65 9.85 10.65 10.25V10.35L10.95 14.35L13.3 9.55C13.6 8.95 14.35 8.75 14.9 9.1C15.45 9.45 15.65 10.15 15.35 10.75L12.55 16.4C12.25 17 11.55 17.25 10.95 16.95C10.65 16.75 10.4 16.45 10.35 16.05L10.05 12.2L8.05 16.15C7.75 16.75 7.05 17 6.45 16.7C6.1 16.5 5.85 16.15 5.75 15.75L3.35 9.2C3.05 8.4 3.35 7.55 3.95 7.2C3.85 7.15 3.75 7.1 3.6 7.1Z"
        fill={fill}
      />
    </Svg>
  )
}

const SVG_MAP: Record<Platform, React.FC<{ size: number; fill: string }>> = {
  glovo: GlovoSvg,
  uber: UberSvg,
  bolt: BoltSvg,
  wolt: WoltSvg,
}

export default function PlatformIcon({ platform, size = 24, active = false }: Props) {
  const c = useColors()
  const Icon = SVG_MAP[platform] ?? UberSvg
  const brand: Record<Platform, string> = { glovo: c.glovo, uber: c.uber, bolt: c.bolt, wolt: c.wolt }
  const fill = active ? (brand[platform] ?? c.uber) : c.secondary

  return (
    <View style={[st.container, { width: size, height: size }]}>
      <Icon size={size} fill={fill} />
    </View>
  )
}

const st = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
})
