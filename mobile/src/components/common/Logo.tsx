import React from 'react'
import Svg, { Path } from 'react-native-svg'

type LogoProps = {
  size?: number
}

/**
 * Geometric Route DM logo.
 * The mark is intentionally drawn as one route-like geometry split into
 * two contiguous segments to create a sharp color break at the D -> M corner.
 */
export default function Logo({ size = 32 }: LogoProps) {
  const strokeWidth = 11

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <Path
        d="M14 104 L14 16 L54 16 L80 40 L80 80 L54 104 L14 104"
        stroke="#FFFFFF"
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      <Path
        d="M54 104 L72 16 L90 80 L108 16"
        stroke="#4A6FA5"
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
    </Svg>
  )
}
