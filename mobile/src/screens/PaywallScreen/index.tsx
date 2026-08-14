import React, { useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Linking,
  DeviceEventEmitter,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'

import { fonts } from '../../theme/typography'
import { useColors, type AppColors } from '../../theme/theme'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import { navigationRef } from '../../navigation/navigationRef'
import { signOutFirebase } from '../../services/firebaseAuth'
import { useAuthStore, isGuestEmail } from '../../store/authStore'
import { useSubscription } from '../../context/SubscriptionContext'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../../constants/legalUrls'
import GoogleGIcon from '../../components/common/GoogleGIcon'

export const EVENT_CLOSE_PAYWALL = 'DriveMindClosePaywall'

type PaywallNavigation = {
  canGoBack: () => boolean
  goBack: () => void
  navigate: (screen: 'Tabs') => void
}

type PaywallScreenProps = {
  navigation?: PaywallNavigation
}

const FEATURES = [
  { icon: 'trending-up', titleKey: 'feature1Title', subKey: 'feature1Sub' },
  { icon: 'eye-off', titleKey: 'feature2Title', subKey: 'feature2Sub' },
  { icon: 'flash', titleKey: 'feature3Title', subKey: 'feature3Sub' },
] as const

export default function PaywallScreen({ navigation }: PaywallScreenProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const c = useColors()
  const styles = useMemo(() => createStyles(c), [c])
  const signOut = useAuthStore((s) => s.signOut)
  const userEmail = useAuthStore((s) => s.userEmail)
  const isGuest = isGuestEmail(userEmail)

  const {
    buySubscription,
    isPurchasing,
    lastError,
    clearError,
    freeTrialAvailable,
    subscriptionStatus,
  } = useSubscription()

  const onSubscribe = useCallback(() => {
    clearError()
    void buySubscription()
  }, [buySubscription, clearError])

  const onSignOut = useCallback(async () => {
    await signOutFirebase()
    signOut()
  }, [signOut])

  const onGuestRegister = useCallback(() => {
    signOut()
  }, [signOut])

  const onClose = useCallback(() => {
    try {
      // React Navigation injects this live navigation object when Paywall is
      // opened as a Stack modal. Do not route modal dismissal through a global ref.
      if (navigation) {
        if (navigation.canGoBack()) navigation.goBack()
        else navigation.navigate('Tabs')
        return
      }

      // Fallback for direct rendering outside NavigationContainer.
      DeviceEventEmitter.emit(EVENT_CLOSE_PAYWALL)
      if (navigationRef.isReady() && navigationRef.canGoBack()) {
        navigationRef.goBack()
      }
    } catch (e) {
      if (__DEV__) console.warn('[DriveMind] Paywall onClose navigation failed', e)
    }
  }, [navigation])

  const openTerms = useCallback(() => {
    void Linking.openURL(TERMS_OF_SERVICE_URL)
  }, [])

  const openPrivacyPolicy = useCallback(() => {
    void Linking.openURL(PRIVACY_POLICY_URL)
  }, [])

  // The paywall is always presented as a dismissible modal over the app
  // shell (restricted free mode) — the close button is therefore always
  // available and dismissal routes back to the main tabs.
  const ctaLabel = t(freeTrialAvailable ? 'paywall_checkout_cta_trial' : 'paywall_checkout_cta')

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 12 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={styles.eyebrow}>{t('premiumBadge')}</Text>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('paywall_close')}
          >
            <Ionicons name="close" size={22} color={c.textSecondary} />
          </Pressable>
        </View>

        {isGuest ? (
          <View style={styles.guestCard}>
            <View style={styles.guestIconWrap}>
              <Ionicons name="flag" size={24} color={c.success} />
            </View>
            <Text style={styles.guestTitle}>{t('guest_trial_exhausted_title')}</Text>
            <Text style={styles.guestBody}>{t('guest_trial_exhausted_body')}</Text>
            <TouchableOpacity
              style={styles.googleBtn}
              onPress={onGuestRegister}
              activeOpacity={0.86}
            >
              <GoogleGIcon size={20} />
              <Text style={styles.googleBtnLabel}>{t('guest_trial_register_cta')}</Text>
            </TouchableOpacity>
            <Text style={styles.guestHint}>{t('guest_trial_register_hint')}</Text>
          </View>
        ) : null}

        <Text style={styles.mainTitle}>{t('mainTitle')}</Text>
        <Text style={styles.subtitle}>{t('subtitle')}</Text>

        {freeTrialAvailable ? (
          <View style={styles.trialCard}>
            <View style={styles.trialIconWrap}>
              <Ionicons name="gift" size={22} color={c.success} />
            </View>
            <View style={styles.trialCopy}>
              <Text style={styles.trialBadge}>{t('paywall_trial_badge')}</Text>
              <Text style={styles.trialAfter}>{t('paywall_trial_after')}</Text>
            </View>
          </View>
        ) : null}

        {FEATURES.map((f) => (
          <View key={f.titleKey} style={styles.featureCard}>
            <View style={styles.featureIconWrap}>
              <Ionicons name={f.icon} size={20} color={c.primary} />
            </View>
            <View style={styles.featureCopy}>
              <Text style={styles.featureTitle}>{t(f.titleKey)}</Text>
              <Text style={styles.featureSub}>{t(f.subKey)}</Text>
            </View>
          </View>
        ))}

        <View style={styles.pricingCard}>
          <Text style={styles.pricingTitle}>{t('pricingTitle')}</Text>
          <Text style={styles.pricingValue}>{t('pricingValue')}</Text>
          <Text style={styles.pricingSub}>{t('pricingSub')}</Text>
        </View>

        {subscriptionStatus === 'pending' ? (
          <View style={styles.pendingBanner}>
            <Ionicons name="time" size={16} color={c.warning} />
            <Text style={styles.pendingText}>{t('paywall_pending_payment')}</Text>
          </View>
        ) : null}

        {lastError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={c.danger} />
            <Text style={styles.errorText}>{lastError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.ctaBtn, isPurchasing && styles.ctaBtnDisabled]}
          onPress={onSubscribe}
          activeOpacity={0.88}
          disabled={isPurchasing}
        >
          {isPurchasing ? (
            <LoadingSpinner color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaLabel}>{ctaLabel}</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerLegal}>{t('footerLegal')}</Text>

        <View style={styles.legalLinksRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={openTerms}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={styles.legalLink}>{t('profile_legal_terms')}</Text>
          </TouchableOpacity>
          <Text style={styles.legalDot}>•</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={openPrivacyPolicy}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={styles.legalLink}>{t('profile_legal_privacy')}</Text>
          </TouchableOpacity>
        </View>

        {!isGuest ? (
          <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut} activeOpacity={0.7}>
            <Text style={styles.signOutLabel}>{t('sign_out')}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  )
}

// Colors are resolved at render time via useColors() so the paywall follows
// the app theme (dark by default). The sheet is memoized per color set.
function createStyles(c: AppColors) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: c.bg,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: c.primary,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  mainTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: c.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: c.textSecondary,
    marginBottom: 20,
  },
  trialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: c.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.success,
    padding: 16,
    marginBottom: 16,
  },
  trialIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.successDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trialCopy: {
    flex: 1,
    minWidth: 0,
  },
  trialBadge: {
    fontSize: 18,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: c.success,
    marginBottom: 2,
  },
  trialAfter: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: c.textSecondary,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    marginBottom: 10,
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: c.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCopy: {
    flex: 1,
    minWidth: 0,
  },
  featureTitle: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: c.text,
    marginBottom: 4,
  },
  featureSub: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: c.textSecondary,
  },
  pricingCard: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 20,
    marginTop: 8,
    marginBottom: 18,
  },
  pricingTitle: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: c.primary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  pricingValue: {
    fontSize: 32,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: c.text,
    marginBottom: 6,
  },
  pricingSub: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.regular,
    color: c.textSecondary,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: c.warningDim,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.warning,
    padding: 12,
    marginBottom: 12,
  },
  pendingText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.medium,
    color: c.warning,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: c.dangerDim,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.danger,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.medium,
    color: c.danger,
  },
  ctaBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: c.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  ctaBtnDisabled: {
    opacity: 0.7,
  },
  ctaLabel: {
    fontSize: 17,
    fontFamily: fonts.semiBold,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  footerLegal: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: fonts.regular,
    color: c.textSecondary,
    marginBottom: 10,
  },
  legalLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  legalLink: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: c.primary,
    textDecorationLine: 'underline',
  },
  legalDot: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: c.textSecondary,
  },
  signOutBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  signOutLabel: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: c.textSecondary,
  },
  guestCard: {
    backgroundColor: c.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    padding: 22,
    marginBottom: 18,
    alignItems: 'center',
  },
  guestIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.successDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  guestTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: c.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  guestBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: c.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    width: '100%',
    borderRadius: 14,
    backgroundColor: c.success,
    marginBottom: 10,
  },
  googleBtnLabel: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  guestHint: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.regular,
    color: c.textSecondary,
    textAlign: 'center',
  },
  })
}
