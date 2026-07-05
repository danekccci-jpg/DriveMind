import React, { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  Linking,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons'
import Reanimated, {
  FadeInDown,
  SlideInRight,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated'
import { useRoleStore } from '../../store/roleStore'
import PlatformIcon from '../../components/PlatformIcon'
import { fonts } from '../../theme/typography'
import { useColors } from '../../theme/theme'
import { checkPermissionsStatus } from '../../services/permissionManager'
import AnimatedButton from '../../components/AnimatedButton'
import Logo from '../../components/common/Logo'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../../constants/legalUrls'

const { width: SCREEN_W } = Dimensions.get('window')

const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 }

type PlatformId = 'glovo' | 'uber' | 'bolt' | 'wolt'
type Role = 'courier' | 'taxi'

const COURIER_PLATFORMS: PlatformId[] = ['glovo', 'uber', 'bolt', 'wolt']
const TAXI_PLATFORMS: PlatformId[] = ['uber', 'bolt']

function ProgressDots({
  total,
  current,
  activeColor,
  mutedColor,
}: {
  total: number
  current: number
  activeColor: string
  mutedColor: string
}) {
  return (
    <View style={st.dotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[st.dot, { backgroundColor: i === current ? activeColor : mutedColor }]} />
      ))}
    </View>
  )
}

export default function OnboardingScreen() {
  const { t } = useTranslation()
  const c = useColors()
  const insets = useSafeAreaInsets()
  const roleFromStore = useRoleStore((s) => s.role)
  const { setRole, setVehicleType, setSelectedServices, setOnboardingComplete } = useRoleStore()

  const [step, setStep] = useState(0)
  const [selectedRole, setSelectedRole] = useState<Role>(roleFromStore ?? 'courier')
  const progress = useSharedValue(0)

  const totalSteps = 4
  const isTaxi = selectedRole === 'taxi'
  const platforms = isTaxi ? TAXI_PLATFORMS : COURIER_PLATFORMS

  const animateTo = useCallback(
    (next: number, dir: 1 | -1) => {
      progress.value = dir
      setStep(next)
      progress.value = withSpring(0, SPRING_CONFIG)
    },
    [progress],
  )

  const foregroundStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [-1, 0, 1], [-SCREEN_W * 0.2, 0, SCREEN_W * 0.2]) }],
    opacity: interpolate(progress.value, [-1, -0.5, 0, 0.5, 1], [0.5, 0.8, 1, 0.8, 0.5]),
  }))

  const backgroundStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [-1, 0, 1], [SCREEN_W * 0.3, 0, -SCREEN_W * 0.3]) }],
    opacity: interpolate(progress.value, [-1, -0.3, 0, 0.3, 1], [0.6, 0.9, 1, 0.9, 0.6]),
  }))

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [-1, 0, 1], [-SCREEN_W, 0, SCREEN_W]) }],
  }))

  const handleFinish = useCallback(() => {
    setRole(selectedRole)
    setVehicleType(selectedRole === 'taxi' ? 'car' : 'bike')
    setSelectedServices(platforms)
    void checkPermissionsStatus()
    setOnboardingComplete(true)
  }, [
    selectedRole,
    platforms,
    setRole,
    setVehicleType,
    setSelectedServices,
    setOnboardingComplete,
  ])

  const goNext = useCallback(() => {
    if (step === totalSteps - 1) {
      handleFinish()
      return
    }
    animateTo(step + 1, 1)
  }, [step, animateTo, handleFinish, totalSteps])

  const goBack = useCallback(() => {
    animateTo(step - 1, -1)
  }, [step, animateTo])

  const openTerms = useCallback(() => {
    void Linking.openURL(TERMS_OF_SERVICE_URL)
  }, [])

  const openPrivacyPolicy = useCallback(() => {
    void Linking.openURL(PRIVACY_POLICY_URL)
  }, [])

  const roleSpecificValue = useMemo(
    () =>
      isTaxi
        ? [t('onboarding_taxi_value_1'), t('onboarding_taxi_value_2')]
        : [t('onboarding_delivery_value_1'), t('onboarding_delivery_value_2')],
    [isTaxi, t],
  )

  const renderStepRole = () => (
    <View style={[st.step, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 8) }]}>
      <ScrollView
        style={st.stepScroll}
        contentContainerStyle={st.stepScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ProgressDots total={totalSteps} current={0} activeColor={c.primary} mutedColor={c.border} />
        <Reanimated.View style={[st.heroWrap, backgroundStyle]}>
          <Logo theme="auto" variant="full" size={140} maxWidth={220} />
        </Reanimated.View>
        <Reanimated.View style={backgroundStyle}>
          <Text style={[st.title, { color: c.text }]}>{t('onboarding_role_title')}</Text>
          <Text style={[st.sub, { color: c.textSecondary }]}>{t('onboarding_role_subtitle')}</Text>
        </Reanimated.View>
        <Reanimated.View style={foregroundStyle}>
        <View style={st.roleCardsRow}>
          <AnimatedButton
            activeOpacity={0.8}
            onPress={() => setSelectedRole('taxi')}
            style={[
              st.roleCard,
              {
                backgroundColor: selectedRole === 'taxi' ? c.primaryDim : c.surface,
                borderColor: selectedRole === 'taxi' ? c.primary : c.border,
              },
            ]}
          >
            <MaterialCommunityIcons name="car-outline" size={28} color={selectedRole === 'taxi' ? c.primary : c.secondary} />
            <Text style={[st.roleCardText, { color: c.text }]}>{t('taxi')}</Text>
          </AnimatedButton>
          <AnimatedButton
            activeOpacity={0.8}
            onPress={() => setSelectedRole('courier')}
            style={[
              st.roleCard,
              {
                backgroundColor: selectedRole === 'courier' ? c.primaryDim : c.surface,
                borderColor: selectedRole === 'courier' ? c.primary : c.border,
              },
            ]}
          >
            <MaterialCommunityIcons name="bike" size={28} color={selectedRole === 'courier' ? c.primary : c.secondary} />
            <Text style={[st.roleCardText, { color: c.text }]}>{t('courier')}</Text>
          </AnimatedButton>
        </View>
        </Reanimated.View>
      </ScrollView>
      <PrimaryBtn label={t('next')} onPress={goNext} bg={c.primary} textColor={c.textInverse} />
    </View>
  )

  const renderStepWidget = () => (
    <View style={[st.step, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 8) }]}>
      <ScrollView
        style={st.stepScroll}
        contentContainerStyle={st.stepScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ProgressDots total={totalSteps} current={1} activeColor={c.primary} mutedColor={c.border} />
        <AnimatedButton style={st.backBtn} onPress={goBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={c.text} />
        </AnimatedButton>
        <Reanimated.View style={backgroundStyle}>
          <Text style={[st.title, { color: c.text }]}>{t('onboarding_widget_title')}</Text>
          <Text style={[st.sub, { color: c.textSecondary }]}>{t('onboarding_widget_desc')}</Text>
        </Reanimated.View>
        <Reanimated.View style={[st.infoCard, { backgroundColor: c.surface, borderColor: c.border }, foregroundStyle]}>
          <MaterialCommunityIcons name="widgets-outline" size={34} color={c.primary} />
          <Text style={[st.infoCardBody, { color: c.textSecondary }]}>{t('onboarding_widget_body')}</Text>
        </Reanimated.View>
      </ScrollView>
      <PrimaryBtn label={t('next')} onPress={goNext} bg={c.primary} textColor={c.textInverse} />
    </View>
  )

  const renderStepRoleValue = () => (
    <View style={[st.step, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 8) }]}>
      <ScrollView
        style={st.stepScroll}
        contentContainerStyle={st.stepScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ProgressDots total={totalSteps} current={2} activeColor={c.primary} mutedColor={c.border} />
        <AnimatedButton style={st.backBtn} onPress={goBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={c.text} />
        </AnimatedButton>
        <Reanimated.View style={backgroundStyle}>
          <Text style={[st.title, { color: c.text }]}>{t('onboarding_value_title')}</Text>
          <Text style={[st.sub, { color: c.textSecondary }]}>{t('onboarding_value_subtitle')}</Text>
        </Reanimated.View>
        <Reanimated.View style={[st.valueList, foregroundStyle]}>
          {roleSpecificValue.map((line) => (
            <View key={line} style={[st.valueItem, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Feather name="check-circle" size={18} color={c.primary} />
              <Text style={[st.valueText, { color: c.text }]}>{line}</Text>
            </View>
          ))}
        </Reanimated.View>
      </ScrollView>
      <PrimaryBtn label={t('next')} onPress={goNext} bg={c.primary} textColor={c.textInverse} />
    </View>
  )

  const renderStepDisclosure = () => (
    <View style={[st.step, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 8) }]}>
      <ScrollView
        style={st.stepScroll}
        contentContainerStyle={st.stepScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ProgressDots total={totalSteps} current={3} activeColor={c.primary} mutedColor={c.border} />
        <AnimatedButton style={st.backBtn} onPress={goBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={c.text} />
        </AnimatedButton>

        <Reanimated.View entering={FadeInDown.delay(100)} style={st.disclosureHeader}>
          <Logo theme="auto" variant="full" size={80} maxWidth={120} />
        </Reanimated.View>

        <Text style={[st.title, st.disclosureTitle, { color: c.text }]}>{t('onboarding_disclosure_title')}</Text>
        <Text style={[st.disclosureIntro, { color: c.textSecondary }]}>{t('onboarding_disclosure_privacy_intro')}</Text>

        <View style={st.permissionCards}>
          <Reanimated.View
            entering={SlideInRight.delay(300).springify()}
            style={[st.permissionCard, st.disclosureCard, { backgroundColor: c.surface, borderColor: c.border }]}
          >
            <View style={st.disclosureCardTitleRow}>
              <Feather name="lock" size={19} color={c.primary} />
              <Text style={[st.permissionTitle, { color: c.text }]}>{t('onboarding_disclosure_a11y_title')}</Text>
            </View>
            <Text style={[st.permissionDesc, { color: c.textSecondary }]}>{t('onboarding_disclosure_a11y_desc')}</Text>
          </Reanimated.View>

          <Reanimated.View
            entering={SlideInRight.delay(500).springify()}
            style={[st.permissionCard, st.disclosureCard, { backgroundColor: c.surface, borderColor: c.border }]}
          >
            <View style={st.disclosureCardTitleRow}>
              <Feather name="layers" size={19} color={c.primary} />
              <Text style={[st.permissionTitle, { color: c.text }]}>{t('onboarding_disclosure_overlay_title')}</Text>
            </View>
            <Text style={[st.permissionDesc, { color: c.textSecondary }]}>{t('onboarding_disclosure_overlay_desc')}</Text>
          </Reanimated.View>
        </View>
      </ScrollView>

      <View style={st.disclosureFooter}>
        <PrimaryBtn
          label={t('onboarding_disclosure_cta')}
          onPress={handleFinish}
          bg={c.primary}
          textColor={c.textInverse}
          hapticImpact="impactMedium"
        />
        <Text style={[st.legalConsentText, { color: c.textSecondary }]}>
          {t('onboarding_disclosure_legal_prefix')}
          <Text style={[st.legalConsentLink, { color: c.textSecondary }]} onPress={openTerms}>
            {t('profile_legal_terms')}
          </Text>
          {t('onboarding_disclosure_legal_and')}
          <Text style={[st.legalConsentLink, { color: c.textSecondary }]} onPress={openPrivacyPolicy}>
            {t('profile_legal_privacy')}
          </Text>
          .
        </Text>
      </View>
    </View>
  )

  const steps = [renderStepRole, renderStepWidget, renderStepRoleValue, renderStepDisclosure]

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: c.bg }]}>
      <Reanimated.View style={[st.animated, containerStyle]}>
        {steps[step]?.()}
      </Reanimated.View>
    </SafeAreaView>
  )
}

function PrimaryBtn({
  label,
  onPress,
  disabled = false,
  bg,
  textColor,
  hapticImpact,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  bg: string
  textColor: string
  hapticImpact?: 'impactLight' | 'impactMedium'
}) {
  return (
    <AnimatedButton
      activeOpacity={0.8}
      style={[st.primaryBtn, { backgroundColor: bg, opacity: disabled ? 0.3 : 1 }]}
      onPress={onPress}
      disabled={disabled}
      hapticImpact={hapticImpact}
    >
      <Text style={[st.primaryBtnText, { color: textColor }]}>{label}</Text>
    </AnimatedButton>
  )
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  animated: { flex: 1 },
  step: {
    flex: 1,
    paddingHorizontal: 24,
  },
  stepScroll: {
    flex: 1,
  },
  stepScrollContent: {
    flexGrow: 1,
  },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 16, marginBottom: 8, alignSelf: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  backBtn: { marginTop: 4, marginBottom: 8, alignSelf: 'flex-start', padding: 4 },
  heroWrap: {
    marginTop: 18,
    marginBottom: 10,
    alignItems: 'center',
  },
  title: { fontSize: 24, fontWeight: '600', fontFamily: fonts.semiBold, marginBottom: 6, marginTop: 16 },
  sub: { fontSize: 14, fontFamily: fonts.regular, marginBottom: 28 },
  primaryBtn: {
    height: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.semiBold },
  roleCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  roleCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  roleCardText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginTop: 8,
    gap: 10,
  },
  infoCardBody: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fonts.regular,
  },
  permissionCards: {
    gap: 12,
    marginTop: 6,
  },
  permissionCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 7,
  },
  permissionTitle: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
  },
  permissionDesc: {
    fontSize: 13,
    fontFamily: fonts.regular,
    lineHeight: 19,
  },
  valueList: {
    gap: 12,
    marginTop: 8,
  },
  valueItem: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  valueText: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.medium,
  },
  disclosureHeader: {
    alignItems: 'center',
    marginTop: 6,
  },
  disclosureTitle: {
    textAlign: 'center',
    marginTop: 14,
  },
  disclosureIntro: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontFamily: fonts.regular,
    marginBottom: 14,
  },
  disclosureCard: {
    padding: 16,
  },
  disclosureCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  disclosureFooter: {
    marginTop: 'auto',
    gap: 12,
  },
  legalConsentText: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    fontFamily: fonts.regular,
    paddingHorizontal: 8,
  },
  legalConsentLink: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.medium,
    textDecorationLine: 'underline',
  },
})
