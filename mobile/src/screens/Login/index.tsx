import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

import { useTheme } from '../../theme/theme'
import { fonts } from '../../theme/typography'
import i18n from '../../i18n'
import { useAuthStore, GUEST_EMAIL } from '../../store/authStore'
import { isFirebaseConfigured } from '../../config/firebase'
import { signInWithGoogleAndEnsureUser } from '../../services/firebaseAuth'
import { sendEmailLink } from '../../services/emailLinkAuth'
import { syncOrderParsingGate } from '../../services/subscriptionGate'
import { useLanguageStore } from '../../store/languageStore'
import { useRoleStore } from '../../store/roleStore'
import { formatAuthErrorMessage, logAuthFailure } from '../../services/authErrorMessages'
import Logo from '../../components/common/Logo'
import GoogleGIcon from '../../components/common/GoogleGIcon'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../../constants/legalUrls'

const LOGO_H_MARGIN = 15

export default function LoginScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { colors: c, isDark } = useTheme()
  const setUser = useAuthStore((s) => s.setUser)
  const setSubscription = useAuthStore((s) => s.setSubscription)

  const [loading, setLoading] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [emailLinkSent, setEmailLinkSent] = useState(false)

  const onEmailLinkPress = useCallback(async () => {
    const trimmed = emailInput.trim()
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert(t('login_error_title'), t('login_enter_valid_email'))
      return
    }
    if (!isFirebaseConfigured()) {
      Alert.alert(t('login_error_title'), t('login_firebase_not_configured'))
      return
    }
    setLoading(true)
    try {
      const result = await sendEmailLink(trimmed)
      if (result.kind === 'link_sent') {
        setEmailLinkSent(true)
      } else {
        logAuthFailure('email link send', result.error)
        Alert.alert(t('login_error_title'), formatAuthErrorMessage(result.error, t))
      }
    } finally {
      setLoading(false)
    }
  }, [emailInput, t])

  const openTerms = useCallback(() => {
    void Linking.openURL(TERMS_OF_SERVICE_URL)
  }, [])

  const openPrivacyPolicy = useCallback(() => {
    void Linking.openURL(PRIVACY_POLICY_URL)
  }, [])

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
          subscriptionEndsAt: result.userRecord.subscriptionEndsAt,
          publicId: result.userRecord.publicId,
          paywallMode: result.paywallMode,
          isPaywallBlocked: result.paywallRequired,
          isSearchBlocked: result.searchBlocked ?? false,
          remainingTrips: result.remainingTrips,
        })
        syncOrderParsingGate()
      } else if (result.kind === 'cancelled') {
        // User closed the picker — no message.
      } else {
        logAuthFailure('Google sign-in', result.error)
        Alert.alert(t('login_error_title'), formatAuthErrorMessage(result.error, t))
      }
    } catch (e) {
      logAuthFailure('Google sign-in', e)
      Alert.alert(t('login_error_title'), formatAuthErrorMessage(e, t))
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

      <KeyboardAvoidingView
        style={styles.bottomBlock}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.text }]}>{t('login_title')}</Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>{t('login_subtitle')}</Text>
        </View>

        {emailLinkSent ? (
          <View style={styles.emailSentBox}>
            <Text style={[styles.emailSentTitle, { color: c.text }]}>{t('login_email_sent_title')}</Text>
            <Text style={[styles.emailSentDesc, { color: c.textSecondary }]}>
              {t('login_email_sent_desc', { email: emailInput.trim() })}
            </Text>
          </View>
        ) : (
          <>
            <TextInput
              style={[styles.emailInput, { backgroundColor: c.surface, borderColor: isDark ? c.border : '#E5E7EB', color: c.text }]}
              placeholder={t('login_email_placeholder')}
              placeholderTextColor={c.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={emailInput}
              onChangeText={setEmailInput}
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.emailLinkBtn, { backgroundColor: c.primary }]}
              onPress={onEmailLinkPress}
              activeOpacity={0.85}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={c.textInverse} />
              ) : (
                <Text style={[styles.emailLinkLabel, { color: c.textInverse }]}>{t('login_send_link')}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: isDark ? c.border : '#E5E7EB' }]} />
              <Text style={[styles.dividerText, { color: c.textMuted }]}>{t('login_or')}</Text>
              <View style={[styles.dividerLine, { backgroundColor: isDark ? c.border : '#E5E7EB' }]} />
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
          </>
        )}

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

        <View style={styles.legalFooter}>
          <TouchableOpacity activeOpacity={0.7} onPress={openTerms} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Text style={[styles.legalLink, { color: c.textMuted }]}>{t('profile_legal_terms')}</Text>
          </TouchableOpacity>
          <Text style={[styles.legalDot, { color: c.textMuted }]}>•</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={openPrivacyPolicy} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Text style={[styles.legalLink, { color: c.textMuted }]}>{t('profile_legal_privacy')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  emailInput: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: fonts.regular,
    marginBottom: 12,
  },
  emailLinkBtn: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailLinkLabel: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: fonts.regular,
  },
  emailSentBox: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emailSentTitle: {
    fontSize: 18,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    marginBottom: 8,
  },
  emailSentDesc: {
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: 'center',
    lineHeight: 20,
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
  legalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingBottom: 4,
  },
  legalLink: {
    fontSize: 12,
    fontFamily: fonts.regular,
    textDecorationLine: 'underline',
  },
  legalDot: {
    fontSize: 12,
    fontFamily: fonts.regular,
  },
})
