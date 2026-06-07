import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'

import { fonts } from '../../theme/typography'
import { signOutFirebase } from '../../services/firebaseAuth'
import { useAuthStore } from '../../store/authStore'

const BG = '#F3F4F6'
const CARD = '#FFFFFF'
const TEXT_DARK = '#111827'
const TEXT_MUTED = '#6B7280'
const TEXT_LEGAL = '#9CA3AF'
const BLUE = '#2563EB'
const BLUE_SOFT = '#EFF6FF'
const GREEN = '#10B981'

const FEATURES = [
  { icon: '📈', titleKey: 'feature1Title', subKey: 'feature1Sub' },
  { icon: '👁️', titleKey: 'feature2Title', subKey: 'feature2Sub' },
  { icon: '🤖', titleKey: 'feature3Title', subKey: 'feature3Sub' },
] as const

type PaywallNav = { goBack?: () => void; canGoBack?: () => boolean }

export default function PaywallScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<PaywallNav>()
  const signOut = useAuthStore((s) => s.signOut)
  const isPaywallBlocked = useAuthStore((s) => s.isPaywallBlocked)
  const [subscribing, setSubscribing] = useState(false)

  const onSubscribe = useCallback(() => {
    setSubscribing(true)
    try {
      Alert.alert(t('paywall_subscribe_title'), t('paywall_subscribe_body'))
    } finally {
      setSubscribing(false)
    }
  }, [t])

  const onSignOut = useCallback(async () => {
    await signOutFirebase()
    signOut()
  }, [signOut])

  const onClose = useCallback(() => {
    if (navigation.canGoBack?.()) {
      navigation.goBack?.()
    }
  }, [navigation])

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!isPaywallBlocked ? (
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeLabel}>✕</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.progressCard}>
          <Text style={styles.gratulations}>{t('gratulations')}</Text>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
        </View>

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
          <Text style={styles.pricingValue}>{t('pricingValue')}</Text>
          <Text style={styles.pricingSub}>{t('pricingSub')}</Text>
        </View>

        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={onSubscribe}
          activeOpacity={0.88}
          disabled={subscribing}
        >
          {subscribing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaLabel}>{t('ctaButton')}</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerLegal}>{t('footerLegal')}</Text>

        <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut} activeOpacity={0.7}>
          <Text style={styles.signOutLabel}>{t('sign_out')}</Text>
        </TouchableOpacity>
      </ScrollView>
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
    alignSelf: 'flex-end',
    padding: 8,
    marginBottom: 4,
  },
  closeLabel: {
    fontSize: 20,
    color: TEXT_MUTED,
    fontFamily: fonts.medium,
  },
  progressCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  gratulations: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: TEXT_DARK,
    marginBottom: 12,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressFill: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: GREEN,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: BLUE_SOFT,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 14,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: BLUE,
    letterSpacing: 0.3,
  },
  mainTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: TEXT_DARK,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: TEXT_MUTED,
    marginBottom: 18,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  featureIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F3F4F6',
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
    color: TEXT_DARK,
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
    borderWidth: 2,
    borderColor: BLUE,
    padding: 18,
    marginTop: 8,
    marginBottom: 18,
  },
  pricingTitle: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: BLUE,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  pricingValue: {
    fontSize: 28,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: TEXT_DARK,
    marginBottom: 6,
  },
  pricingSub: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: TEXT_MUTED,
  },
  ctaBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  ctaLabel: {
    fontSize: 17,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  footerLegal: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: fonts.regular,
    color: TEXT_LEGAL,
    marginBottom: 12,
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
})
