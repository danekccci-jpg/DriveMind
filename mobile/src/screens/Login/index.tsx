import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

import { useTheme } from '../../theme/theme'
import { fonts } from '../../theme/typography'
import { useAuthStore } from '../../store/authStore'
import { signInWithGoogle } from '../../services/googleAuth'

export default function LoginScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const setUser = useAuthStore((s) => s.setUser)

  const [loading, setLoading] = useState(false)

  const onGooglePress = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('', t('login_native_only'))
      return
    }
    setLoading(true)
    try {
      const result = await signInWithGoogle()
      if (result?.email) {
        setUser(result.name || result.email.split('@')[0], result.email)
      } else {
        Alert.alert('', t('login_failed'))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[DriveMind] Google sign-in', e)
      Alert.alert(t('login_error_title'), msg)
    } finally {
      setLoading(false)
    }
  }, [setUser, t])

  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>{t('login_title')}</Text>
        <Text style={[styles.sub, { color: c.textSecondary }]}>{t('login_subtitle')}</Text>
      </View>

      <TouchableOpacity
        style={[styles.googleBtn, { backgroundColor: c.surface, borderColor: c.border }]}
        onPress={onGooglePress}
        activeOpacity={0.85}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={c.primary} />
        ) : (
          <>
            <Text style={styles.googleG}>G</Text>
            <Text style={[styles.googleLabel, { color: c.text }]}>{t('sign_in_with_google')}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  header: { marginBottom: 32 },
  title: { fontSize: 26, fontFamily: fonts.bold, fontWeight: '700', marginBottom: 8 },
  sub: { fontSize: 15, fontFamily: fonts.regular, lineHeight: 22 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
  },
  googleG: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#4285F4',
  },
  googleLabel: { fontSize: 16, fontFamily: fonts.semiBold, fontWeight: '600' },
})
