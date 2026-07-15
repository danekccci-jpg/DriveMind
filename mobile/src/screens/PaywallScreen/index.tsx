import React, { useCallback } from 'react'
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

import { fonts } from '../../theme/typography'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import { navigationRef } from '../../navigation/navigationRef'
import { signOutFirebase } from '../../services/firebaseAuth'
import { useAuthStore, isGuestEmail } from '../../store/authStore'
import { useSubscription } from '../../context/SubscriptionContext'
import { SUBSCRIPTION_PRICE_LABEL } from '../../constants/subscription'
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

// ── Light theme palette ─────────────────────────────────────────────────────
const BG = '#FFFFFF'
const CARD = '#F9FAFB'
const BORDER = '#E5E7EB'
const TEXT_PRIMARY = '#0B0B0B'
const TEXT_MUTED = '#6B7280'
const TEXT_SOFT = '#9CA3AF'
const ACCENT = '#22C55E'
const ACCENT_DIM = 'rgba(34, 197, 94, 0.10)'

const FEATURES = [
  { icon: '📈', titleKey: 'feature1Title', subKey: 'feature1Sub' },
  { icon: '👁️', titleKey: 'feature2Title', subKey: 'feature2Sub' },
  { icon: '🤖', titleKey: 'feature3Title', subKey: 'feature3Sub' },
] as const

export default function PaywallScreen({ navigation }: PaywallScreenProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const signOut = useAuthStore((s) => s.signOut)
  const isPaywallBlocked = useAuthStore((s) => s.isPaywallBlocked)
  const userEmail = useAuthStore((s) => s.userEmail)
  const isGuest = isGuestEmail(userEmail)

  const { buySubscription, isPurchasing, lastError, clearError, subscriptionStatus } =
    useSubscription()

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

  const showClose = !isPaywallBlocked && !isGuest

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 50, paddingBottom: insets.bottom + 12 }]}
        showsVerticalScrollIndicator={false}
      >
        {isGuest ? (
          <View style={styles.guestCard}>
            <Text style={styles.guestEmoji}>🏁</Text>
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

        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t('premiumBadge')}</Text>
        </View>

        <Text style={styles.mainTitle}>{t('mainTitle')}</Text>
        <Text style={styles.subtitle}>{t('subtitle')}</Text>

        {FEATURES.map((f) => (
          <View key={f.titleKey} style={styles.featureCard}>
            <View style={styles.featureIconWrap}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
            </View>
            <View style={styles.featureCopy}>
              <Text style={styles.featureTitle}>{t(f.titleKey)}</Text>
              <Text style={styles.featureSub}>{t(f.subKey)}</Text>
            </View>
          </View>
        ))}

        <View style={styles.pricingCard}>
          <Text style={styles.pricingTitle}>{t('pricingTitle')}</Text>
          <Text style={styles.pricingValue}>{SUBSCRIPTION_PRICE_LABEL}</Text>
          <Text style={styles.pricingSub}>{t('pricingSub')}</Text>
        </View>

        {subscriptionStatus === 'pending' ? (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingText}>{t('paywall_pending_payment')}</Text>
          </View>
        ) : null}

        {lastError ? (
          <View style={styles.errorBanner}>
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
            <Text style={styles.ctaLabel}>{t('paywall_checkout_cta')}</Text>
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

      {showClose ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable
            style={[styles.closeBtn, { top: insets.top + 4, right: 12 }]}
            onPressIn={onClose}
            hitSlop={{ top: 50, bottom: 50, left: 50, right: 50 }}
            accessibilityRole="button"
            accessibilityLabel={t('paywall_close')}
          >
            <Text style={styles.closeLabel}>✕</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  closeBtn: {
    position: 'absolute',
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  closeLabel: {
    fontSize: 22,
    lineHeight: 24,
    color: TEXT_MUTED,
    fontFamily: fonts.medium,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: ACCENT_DIM,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
  },
  badgeText: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: ACCENT,
    letterSpacing: 0.3,
  },
  mainTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: TEXT_MUTED,
    marginBottom: 20,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 10,
  },
  featureIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8E8EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIcon: {
    fontSize: 20,
  },
  featureCopy: {
    flex: 1,
    minWidth: 0,
  },
  featureTitle: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  featureSub: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: TEXT_MUTED,
  },
  pricingCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ACCENT,
    padding: 20,
    marginTop: 8,
    marginBottom: 18,
  },
  pricingTitle: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: ACCENT,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  pricingValue: {
    fontSize: 32,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 6,
  },
  pricingSub: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: TEXT_MUTED,
  },
  pendingBanner: {
    backgroundColor: '#FEFCE8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    marginBottom: 12,
  },
  pendingText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.medium,
    color: '#92400E',
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.medium,
    color: '#B91C1C',
    textAlign: 'center',
  },
  ctaBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: ACCENT,
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
    color: TEXT_SOFT,
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
    color: ACCENT,
    textDecorationLine: 'underline',
  },
  legalDot: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_SOFT,
  },
  signOutBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  signOutLabel: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: TEXT_MUTED,
  },
  guestCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
    marginBottom: 18,
    alignItems: 'center',
  },
  guestEmoji: {
    fontSize: 36,
    marginBottom: 10,
  },
  guestTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    textAlign: 'center',
    marginBottom: 8,
  },
  guestBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: TEXT_MUTED,
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
    backgroundColor: ACCENT,
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
    color: TEXT_SOFT,
    textAlign: 'center',
  },
})
