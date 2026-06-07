import type { ImageSourcePropType } from 'react-native'

/** Premium launch / splash background (always dark). */
export const SPLASH_NAVY = '#08101C'

export type LogoThemeKey = 'light' | 'dark'
export type LogoVariantKey = 'full' | 'symbol'

/**
 * DriveMind brand raster assets (PNG).
 * A = full light · B = full dark · C = symbol light · D = symbol dark
 */
export const LOGO_ASSETS: Record<LogoThemeKey, Record<LogoVariantKey, ImageSourcePropType>> = {
  light: {
    full: require('../../assets/logo/logo-full-light.png'),
    symbol: require('../../assets/logo/logo-symbol-light.png'),
  },
  dark: {
    full: require('../../assets/logo/logo-full-dark.png'),
    symbol: require('../../assets/logo/logo-symbol-dark.png'),
  },
}

/** Floating overlay / accessibility widget — symbol dark only. */
export const OVERLAY_LOGO_SOURCE = LOGO_ASSETS.dark.symbol

/** App launcher icon source (Asset A — full light). */
export const APP_ICON_SOURCE = LOGO_ASSETS.light.full

/** Width ÷ height for layout (contain, no stretch). */
export const LOGO_ASPECT_RATIO: Record<LogoVariantKey, number> = {
  full: 1,
  symbol: 2.15,
}

export function resolveLogoSource(
  theme: LogoThemeKey,
  variant: LogoVariantKey,
): ImageSourcePropType {
  return LOGO_ASSETS[theme][variant]
}
