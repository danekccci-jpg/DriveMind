import { useColorScheme } from 'react-native'
import { useThemeStore } from '../store/themeStore'

interface ColorPalette {
  bg: string
  surface: string
  surfaceAlt: string
  primary: string
  primaryDim: string
  secondary: string
  border: string
  borderLight: string
  text: string
  textSecondary: string
  textMuted: string
  textInverse: string
  success: string
  successDim: string
  warning: string
  warningDim: string
  danger: string
  dangerDim: string
  card: string
  separator: string
  tabBar: string
  tabBarBorder: string
  overlay: string
  shimmer: string
  glovo: string
  uber: string
  bolt: string
  wolt: string
}

export const darkColors: ColorPalette = {
  bg: '#050505',
  surface: '#121212',
  surfaceAlt: '#1A1A1A',
  primary: '#1A5CFF',
  primaryDim: 'rgba(26,92,255,0.10)',
  secondary: '#8E8E93',
  border: '#2A2A2A',
  borderLight: '#333333',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  textMuted: '#555555',
  textInverse: '#000000',
  success: '#22C55E',
  successDim: 'rgba(34,197,94,0.12)',
  warning: '#F59E0B',
  warningDim: 'rgba(245,158,11,0.12)',
  danger: '#EF4444',
  dangerDim: 'rgba(239,68,68,0.12)',
  card: '#111111',
  separator: '#1A1A1A',
  tabBar: '#000000',
  tabBarBorder: '#1A1A1A',
  overlay: 'rgba(0,0,0,0.75)',
  shimmer: '#222222',
  glovo: '#FFB800',
  uber: '#FFFFFF',
  bolt: '#34D186',
  wolt: '#00BCFF',
}

export const lightColors: ColorPalette = {
  bg: '#F5F5F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F0F2',
  primary: '#1A5CFF',
  primaryDim: 'rgba(26,92,255,0.08)',
  secondary: '#8E8E93',
  border: '#E5E5E7',
  borderLight: '#D1D1D6',
  text: '#1C1C1E',
  textSecondary: '#8E8E93',
  textMuted: '#C7C7CC',
  textInverse: '#FFFFFF',
  success: '#22C55E',
  successDim: 'rgba(34,197,94,0.08)',
  warning: '#F59E0B',
  warningDim: 'rgba(245,158,11,0.08)',
  danger: '#EF4444',
  dangerDim: 'rgba(239,68,68,0.08)',
  card: '#FFFFFF',
  separator: '#E5E5E7',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E5E5E7',
  overlay: 'rgba(0,0,0,0.4)',
  shimmer: '#E5E5E7',
  glovo: '#FFB800',
  uber: '#1C1C1E',
  bolt: '#34D186',
  wolt: '#00BCFF',
}

export type AppColors = ColorPalette

export function useTheme(): { colors: AppColors; isDark: boolean } {
  const systemScheme = useColorScheme()
  const mode = useThemeStore((s) => s.theme)
  const isDark =
    mode === 'system' ? (systemScheme ?? 'dark') === 'dark' : mode === 'dark'
  return { colors: isDark ? darkColors : lightColors, isDark }
}

export function useColors(): AppColors {
  return useTheme().colors
}

export const palette = darkColors

export const typo = {
  header: { fontSize: 24, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  caption: { fontSize: 12, color: darkColors.textSecondary },
} as const
