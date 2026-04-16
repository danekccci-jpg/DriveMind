import React from 'react'
import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/theme'
import { fonts } from '../../theme/typography'

export default function DashboardIsolationScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const { colors: c } = useTheme()

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.tabBar,
        paddingTop: insets.top + 24,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: c.text, fontSize: 20, fontFamily: fonts.semiBold, marginBottom: 8 }}>
        Dashboard Isolation Mode
      </Text>
      <Text style={{ color: c.textSecondary, fontSize: 14, textAlign: 'center' }}>
        Map Hidden. No Google/Location native calls in this screen.
      </Text>
      <Text style={{ color: c.textMuted, fontSize: 12, textAlign: 'center', marginTop: 12 }}>
        {t('ride')}
      </Text>
    </View>
  )
}
