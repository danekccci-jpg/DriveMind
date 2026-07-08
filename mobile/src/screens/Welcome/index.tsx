import React from 'react'
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import Reanimated, { FadeInDown } from 'react-native-reanimated'

import { useColors } from '../../theme/theme'
import { fonts } from '../../theme/typography'
import { useWelcomeStore } from '../../store/welcomeStore'
import AnimatedButton from '../../components/AnimatedButton'
import Logo from '../../components/common/Logo'

type FeatureItem = {
  key: string
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  title: string
  description: string
}

export default function WelcomeScreen() {
  const { t } = useTranslation()
  const c = useColors()
  const insets = useSafeAreaInsets()
  const setHasSeenWelcome = useWelcomeStore((s) => s.setHasSeenWelcome)

  const features: FeatureItem[] = [
    {
      key: 'widget',
      icon: 'widgets-outline',
      title: t('welcome_feature_widget_title'),
      description: t('welcome_feature_widget_desc'),
    },
    {
      key: 'calendar',
      icon: 'calendar-month-outline',
      title: t('welcome_feature_calendar_title'),
      description: t('welcome_feature_calendar_desc'),
    },
  ]

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: c.bg }]}>
      <ScrollView
        style={st.scroll}
        contentContainerStyle={[st.scrollContent, { paddingBottom: Math.max(insets.bottom, 8) }]}
        showsVerticalScrollIndicator={false}
      >
        <Reanimated.View entering={FadeInDown.delay(0).springify()} style={st.heroWrap}>
          <Logo theme="auto" variant="full" size={120} maxWidth={200} />
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={[st.title, { color: c.text }]}>{t('welcome_title')}</Text>
        </Reanimated.View>

        <View style={st.featureList}>
          {features.map((feature, index) => (
            <Reanimated.View
              key={feature.key}
              entering={FadeInDown.delay(200 + 120 * index).springify()}
              style={[st.featureCard, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <View style={[st.featureIconWrap, { backgroundColor: c.primaryDim }]}>
                <MaterialCommunityIcons name={feature.icon} size={26} color={c.primary} />
              </View>
              <View style={st.featureTextWrap}>
                <Text style={[st.featureTitle, { color: c.text }]}>{feature.title}</Text>
                <Text style={[st.featureDesc, { color: c.textSecondary }]}>{feature.description}</Text>
              </View>
            </Reanimated.View>
          ))}
        </View>
      </ScrollView>

      <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <AnimatedButton
          activeOpacity={0.8}
          style={[st.ctaBtn, { backgroundColor: c.primary }]}
          onPress={() => setHasSeenWelcome(true)}
          hapticImpact="impactMedium"
        >
          <Text style={[st.ctaBtnText, { color: c.textInverse }]}>{t('get_started')}</Text>
        </AnimatedButton>
      </View>
    </SafeAreaView>
  )
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
  heroWrap: {
    marginTop: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 34,
  },
  featureList: {
    gap: 14,
  },
  featureCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    alignItems: 'flex-start',
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextWrap: {
    flex: 1,
    gap: 4,
  },
  featureTitle: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
  },
  featureDesc: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.regular,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  ctaBtn: {
    height: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
  },
})
