import React, { useMemo } from 'react'
import {
  Image,
  type ImageProps,
  type ImageStyle,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'

import { useTheme } from '../../theme/theme'
import {
  LOGO_ASPECT_RATIO,
  resolveLogoSource,
  type LogoThemeKey,
  type LogoVariantKey,
} from '../../theme/logoAssets'

export type LogoThemeProp = 'light' | 'dark' | 'auto'
export type LogoVariantProp = 'full' | 'symbol'
export type LogoSizeProp = number | 'small' | 'large'

const SIZE_PRESETS: Record<'small' | 'large', { full: number; symbol: number }> = {
  small: { full: 36, symbol: 28 },
  large: { full: 200, symbol: 72 },
}

export interface LogoProps {
  theme?: LogoThemeProp
  variant?: LogoVariantProp
  size?: LogoSizeProp
  /** Max width when variant is `full` (e.g. narrow header). */
  maxWidth?: number
  /** Stretch to 100% of parent width; height follows aspect ratio. */
  fillWidth?: boolean
  /** On very narrow screens, prefer symbol when `full` is requested. */
  compactFallback?: boolean
  style?: StyleProp<ImageStyle>
  accessibilityLabel?: string
}

function resolveThemeKey(theme: LogoThemeProp, isDark: boolean): LogoThemeKey {
  if (theme === 'auto') return isDark ? 'dark' : 'light'
  return theme
}

function resolveHeight(size: LogoSizeProp | undefined, variant: LogoVariantKey): number {
  if (size === 'small') return SIZE_PRESETS.small[variant]
  if (size === 'large') return SIZE_PRESETS.large[variant]
  if (typeof size === 'number' && Number.isFinite(size)) return size
  return SIZE_PRESETS.small[variant]
}

export default function Logo({
  theme = 'auto',
  variant = 'full',
  size,
  maxWidth,
  fillWidth = false,
  compactFallback = false,
  style,
  accessibilityLabel = 'DriveMind',
  ...imageProps
}: LogoProps & Omit<ImageProps, 'source' | 'style' | 'accessibilityLabel'>) {
  const { isDark } = useTheme()
  const { width: windowWidth } = useWindowDimensions()

  const effectiveVariant: LogoVariantKey = useMemo(() => {
    if (variant === 'symbol') return 'symbol'
    if (compactFallback && windowWidth < 360) return 'symbol'
    return 'full'
  }, [variant, compactFallback, windowWidth])

  const themeKey = resolveThemeKey(theme, isDark)
  const source = resolveLogoSource(themeKey, effectiveVariant)
  const aspect = LOGO_ASPECT_RATIO[effectiveVariant]

  if (fillWidth) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        style={[{ width: '100%', aspectRatio: aspect }, style]}
      >
        <Image
          {...imageProps}
          source={source}
          resizeMode="contain"
          resizeMethod="resize"
          style={styles.fillWidthImage}
        />
      </View>
    )
  }

  const height = resolveHeight(size, effectiveVariant)
  let width = height * aspect
  if (typeof maxWidth === 'number' && width > maxWidth) {
    width = maxWidth
  }

  const flatStyle = StyleSheet.flatten(style) as ImageStyle | undefined
  const fixedHeight = typeof flatStyle?.height === 'number' ? flatStyle.height : height
  const imageWidth =
    flatStyle?.width === undefined && typeof flatStyle?.height === 'number'
      ? fixedHeight * aspect
      : width

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          height: fixedHeight,
          width: flatStyle?.width === undefined ? imageWidth : width,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <Image
        {...imageProps}
        source={source}
        resizeMode="contain"
        resizeMethod="resize"
        style={[{ height: fixedHeight, width: imageWidth }, style]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fillWidthImage: {
    width: '100%',
    height: '100%',
  },
})
