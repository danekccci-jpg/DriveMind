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
import i18n from '../../i18n'
import { useAuthStore, GUEST_EMAIL } from '../../store/authStore'
import { isFirebaseConfigured } from '../../config/firebase'
import { signInWithGoogleAndEnsureUser } from '../../services/firebaseAuth'
import { syncOrderParsingGate } from '../../services/subscriptionGate'
import { useLanguageStore } from '../../store/languageStore'
import { useRoleStore } from '../../store/roleStore'
import { isGoogleSignInDeveloperError, formatGoogleSignInErrorDebug } from '../../services/googleAuth'
import Logo from '../../components/common/Logo'
import GoogleGIcon from '../../components/common/GoogleGIcon'

const LOGO_H_MARGIN = 15

export default function LoginScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { colors: c, isDark } = useTheme()
  const setUser = useAuthStore((s) => s.setUser)
  const setSubscription = useAuthStore((s) => s.setSubscription)

  const [loading, setLoading] = useState(false)

  const onGooglePress = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('', t('login_native_only'))
      return
    }
    setLoading(true)
    try {
      if (!isFirebaseConfigured()) {
        Alert.alert(t('login_error_title'), t('login_firebase_not_configured'))
        return
      }
      const result = await signInWithGoogleAndEnsureUser()
      if (result.kind === 'success') {
        setUser(result.name || result.email.split('@')[0], result.email)
        setSubscription({
          firebaseUid: result.uid,
          completedOrdersCount: result.userRecord.completedOrdersCount,
          isSubscribed: result.userRecord.isSubscribed,
          trialEndsAt: result.userRecord.trialEndsAt,
          paywallMode: result.paywallMode,
          isPaywallBlocked: result.paywallRequired,
          isSearchBlocked: result.searchBlocked ?? false,
        })
        syncOrderParsingGate()
      } else if (result.kind === 'cancelled') {
        // User closed the picker — no message.
      } else {
        const devErr = isGoogleSignInDeveloperError(result.error)
        const body =
          (devErr ? t('login_developer_error') : t('login_failed')) +
          formatGoogleSignInErrorDebug(result.error)
        Alert.alert(t('login_error_title'), body)
        console.warn('[DriveMind] Google sign-in failed', result.error)
      }
    } catch (e) {
      Alert.alert(t('login_error_title'), t('login_failed'))
      console.warn('[DriveMind] Google sign-in failed', e)
    } finally {
      setLoading(false)
    }
  }, [setUser, setSubscription, t])

  const pageBg = isDark ? c.bg : '#FFFFFF'
  const googleBorder = isDark ? c.border : '#E5E7EB'
  const laterBg = isDark ? c.surfaceAlt : '#F9FAFB'
  const laterBorder = isDark ? c.border : '#E5E7EB'

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: pageBg,
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 28,
        },
      ]}
    >
      <View style={styles.logoArea}>
        <View style={styles.logoWrap}>
          <Logo theme="auto" variant="full" fillWidth />
        </View>
      </View>

      <View style={styles.bottomBlock}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.text }]}>{t('login_title')}</Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>{t('login_subtitle')}</Text>
        </View>

        <TouchableOpacity
          style={[styles.googleBtn, { backgroundColor: c.surface, borderColor: googleBorder }]}
          onPress={onGooglePress}
          activeOpacity={0.85}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={c.primary} />
          ) : (
            <>
              <GoogleGIcon size={22} />
              <Text style={[styles.googleLabel, { color: c.text }]}>{t('sign_in_with_google')}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.laterBtn, { backgroundColor: laterBg, borderColor: laterBorder }]}
          onPress={() => {
            const lang = useLanguageStore.getState()
            if (!lang.hasChosenLanguage) lang.confirmLanguageChoice(lang.language)
            const rs = useRoleStore.getState()
            if (!rs.role) rs.setRole('courier')
            if (!rs.onboardingComplete) rs.setOnboardingComplete(true)
            setUser(i18n.t('guest_user'), GUEST_EMAIL)
          }}
          activeOpacity={0.85}
          disabled={loading}
        >
          <Text style={[styles.laterLabel, { color: c.textSecondary }]}>{t('login_later')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  logoArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: LOGO_H_MARGIN,
    paddingTop: 12,
    paddingBottom: 16,
  },
  logoWrap: {
    width: '100%',
    marginBottom: 8,
  },
  bottomBlock: {
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: fonts.bold,
    fontWeight: '700',
    marginBottom: 10,
  },
  sub: {
    fontSize: 15,
    fontFamily: fonts.regular,
    lineHeight: 22,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
  },
  googleLabel: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
  },
  laterBtn: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
  },
  laterLabel: {
    fontSize: 15,
    fontFamily: fonts.regular,
  },
})
