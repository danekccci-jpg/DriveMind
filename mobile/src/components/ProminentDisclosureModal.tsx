import React, { useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons'

import AnimatedButton from './AnimatedButton'
import { fonts } from '../theme/typography'
import { useTheme, type AppColors } from '../theme/theme'

interface Props {
  visible: boolean
  onAccept: () => void
  onCancel: () => void
}

interface BulletProps {
  icon: string
  iconFamily: 'MaterialCommunityIcons' | 'Feather'
  title: string
  body: string
  iconColor: string
  bgColor: string
  c: AppColors
}

function DisclosureBullet({ icon, iconFamily, title, body, iconColor, bgColor, c }: BulletProps) {
  const Icon = iconFamily === 'Feather' ? Feather : MaterialCommunityIcons
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletIconWrap, { backgroundColor: bgColor }]}>
        <Icon name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={styles.bulletTextWrap}>
        <Text style={[styles.bulletTitle, { color: c.text }]}>{title}</Text>
        <Text style={[styles.bulletBody, { color: c.textSecondary }]}>{body}</Text>
      </View>
    </View>
  )
}

export function ProminentDisclosureModal({ visible, onAccept, onCancel }: Props) {
  const insets = useSafeAreaInsets()
  const { colors: c, isDark } = useTheme()

  const handleAccept = useCallback(() => { onAccept() }, [onAccept])
  const handleCancel = useCallback(() => { onCancel() }, [onCancel])

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Header bar */}
        <View style={[styles.headerBar, { borderBottomColor: c.separator }]}>
          <View style={[styles.shieldBadge, { backgroundColor: c.primaryDim }]}>
            <MaterialCommunityIcons name="shield-check" size={22} color={c.primary} />
          </View>
          <Text style={[styles.headerLabel, { color: c.textMuted }]}>
            WYMAGANIE GOOGLE PLAY
          </Text>
        </View>

        {/* Scrollable content */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Text style={[styles.headline, { color: c.text }]}>Usługa{'\n'}Dostępności</Text>
          <Text style={[styles.subheadline, { color: c.textSecondary }]}>
            Accessibility Service Disclosure
          </Text>

          <View style={[styles.divider, { backgroundColor: c.separator }]} />

          <Text style={[styles.intro, { color: c.textSecondary }]}>
            Przed aktywacją zmiany DriveMind wymaga włączenia{' '}
            <Text style={{ color: c.text, fontFamily: fonts.semiBold }}>
              Usługi Dostępności systemu Android.
            </Text>
            {' '}Poniżej znajdziesz pełne wyjaśnienie, do czego służy ta funkcja.
          </Text>

          {/* Disclosure bullets */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <DisclosureBullet
              c={c}
              icon="magnify-scan"
              iconFamily="MaterialCommunityIcons"
              title="Co odczytuje aplikacja?"
              body="DriveMind odczytuje dane aktywnego zlecenia bezpośrednio z ekranu aplikacji kurierskich (Bolt Driver, Uber Driver, Glovo, Wolt) wyświetlanych na pierwszym planie — cenę, adres odbioru i adres dostawy."
              iconColor={c.primary}
              bgColor={c.primaryDim}
            />
            <View style={[styles.cardSep, { backgroundColor: c.separator }]} />
            <DisclosureBullet
              c={c}
              icon="chart-line"
              iconFamily="MaterialCommunityIcons"
              title="Dlaczego te dane są potrzebne?"
              body="Odczytane dane są natychmiast używane wyłącznie do obliczenia opłacalności trasy i wyświetlenia pływającej nakładki z wynikiem — abyś mógł bezpiecznie ocenić zlecenie bez przełączania aplikacji."
              iconColor={c.success}
              bgColor={isDark ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.10)'}
            />
            <View style={[styles.cardSep, { backgroundColor: c.separator }]} />
            <DisclosureBullet
              c={c}
              icon="server-off"
              iconFamily="MaterialCommunityIcons"
              title="Prywatność i bezpieczeństwo"
              body="Dane o zamówieniach z Usługi Dostępności są przetwarzane lokalnie na urządzeniu w celu obliczenia rentowności. Wybrane dane konta, status subskrypcji oraz zapytania nawigacyjne są bezpiecznie przesyłane do usług Firebase i Google Maps Platform."
              iconColor={c.warning}
              bgColor={isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.10)'}
            />
          </View>

          {/* English summary for Google Play policy compliance */}
          <View style={[
            styles.policyBox,
            {
              backgroundColor: isDark ? '#0A1A3D' : '#EEF3FF',
              borderColor: isDark ? '#1E3A6E' : '#C7D7FF',
            },
          ]}>
            <Feather name="info" size={14} color={c.primary} style={styles.policyIcon} />
            <Text style={[styles.policyText, { color: isDark ? '#94B4FF' : '#2750B5' }]}>
              <Text style={{ fontFamily: fonts.semiBold }}>Purpose: </Text>
              DriveMind uses the Android Accessibility API solely to read active delivery order details (price, pickup address, destination) from supported courier apps running in the foreground.
              {'\n\n'}
              <Text style={{ fontFamily: fonts.semiBold }}>Data use: </Text>
              Order data is processed locally on the device to compute profitability. Minimal account details, subscription status, and navigation routing preferences are transmitted securely to Firebase and Google Maps Platform services.
            </Text>
          </View>

          <View style={styles.scrollSpacer} />
        </ScrollView>

        {/* Sticky action buttons */}
        <View style={[styles.buttonArea, { backgroundColor: c.bg, borderTopColor: c.separator }]}>
          <AnimatedButton
            style={[styles.btnAccept, { backgroundColor: c.primary }]}
            activeOpacity={0.85}
            onPress={handleAccept}
            accessibilityLabel="Akceptuję i kontynuuję"
          >
            <MaterialCommunityIcons name="shield-check" size={18} color="#FFFFFF" />
            <Text style={styles.btnAcceptText}>Akceptuję i kontynuuję</Text>
          </AnimatedButton>

          <AnimatedButton
            style={[styles.btnCancel, { borderColor: c.border }]}
            activeOpacity={0.75}
            onPress={handleCancel}
            accessibilityLabel="Anuluj"
          >
            <Text style={[styles.btnCancelText, { color: c.textSecondary }]}>Anuluj</Text>
          </AnimatedButton>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  shieldBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 8,
  },
  headline: {
    fontSize: 30,
    fontFamily: fonts.bold,
    fontWeight: '700',
    lineHeight: 36,
  },
  subheadline: {
    fontSize: 14,
    fontFamily: fonts.regular,
    marginTop: 6,
    marginBottom: 2,
  },
  divider: {
    height: 1,
    marginVertical: 22,
    borderRadius: 1,
  },
  intro: {
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 22,
    marginBottom: 20,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  cardSep: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 70,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 14,
  },
  bulletIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bulletTextWrap: {
    flex: 1,
  },
  bulletTitle: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    marginBottom: 5,
    lineHeight: 20,
  },
  bulletBody: {
    fontSize: 13,
    fontFamily: fonts.regular,
    lineHeight: 19,
  },
  policyBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  policyIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  policyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.regular,
    lineHeight: 18,
  },
  scrollSpacer: {
    height: 16,
  },
  buttonArea: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'android' ? 18 : 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  btnAccept: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 14,
    gap: 8,
  },
  btnAcceptText: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnCancel: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelText: {
    fontSize: 15,
    fontFamily: fonts.medium,
  },
})
