import React, { useCallback } from 'react'
import { View, Text, StyleSheet, Modal, ScrollView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { MaterialCommunityIcons } from '@expo/vector-icons'

import AnimatedButton from './AnimatedButton'
import { fonts } from '../theme/typography'
import { useTheme } from '../theme/theme'

interface Props {
  visible: boolean
  onAccept: () => void
  onDecline: () => void
}

/**
 * Google Play prominent-disclosure requirement for BACKGROUND_LOCATION.
 * MUST be shown before the system permission dialog is ever triggered.
 * Do not dismiss via backdrop tap or hardware back — require an explicit choice.
 */
export function BackgroundLocationDisclosureModal({ visible, onAccept, onDecline }: Props) {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const { colors: c, isDark } = useTheme()

  const handleAccept = useCallback(() => onAccept(), [onAccept])
  const handleDecline = useCallback(() => onDecline(), [onDecline])

  if (!visible) return null

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => { /* non-dismissible — require an explicit Accept/Decline tap */ }}
    >
      <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.headerBar, { borderBottomColor: c.separator }]}>
          <View style={[styles.iconBadge, { backgroundColor: c.primaryDim }]}>
            <MaterialCommunityIcons name="map-marker-radius" size={22} color={c.primary} />
          </View>
          <Text style={[styles.headerLabel, { color: c.textMuted }]}>
            {t('bg_location_disclosure_header')}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Text style={[styles.headline, { color: c.text }]}>
            {t('bg_location_disclosure_title')}
          </Text>

          <View style={[styles.bodyBox, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.bodyText, { color: c.textSecondary }]}>
              {t('bg_location_disclosure_body')}
            </Text>
          </View>

          <View
            style={[
              styles.policyBox,
              {
                backgroundColor: isDark ? '#0A1A3D' : '#EEF3FF',
                borderColor: isDark ? '#1E3A6E' : '#C7D7FF',
              },
            ]}
          >
            <MaterialCommunityIcons name="shield-check" size={16} color={c.primary} style={styles.policyIcon} />
            <Text style={[styles.policyText, { color: isDark ? '#94B4FF' : '#2750B5' }]}>
              {t('bg_location_disclosure_footnote')}
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.buttonArea, { backgroundColor: c.bg, borderTopColor: c.separator }]}>
          <AnimatedButton
            style={[styles.btnAccept, { backgroundColor: c.primary }]}
            activeOpacity={0.85}
            onPress={handleAccept}
            accessibilityRole="button"
            accessibilityLabel={t('bg_location_disclosure_accept')}
          >
            <MaterialCommunityIcons name="check-circle" size={18} color="#FFFFFF" />
            <Text style={styles.btnAcceptText}>{t('bg_location_disclosure_accept')}</Text>
          </AnimatedButton>

          <AnimatedButton
            style={styles.btnDecline}
            activeOpacity={0.75}
            onPress={handleDecline}
            accessibilityRole="button"
            accessibilityLabel={t('bg_location_disclosure_decline')}
          >
            <Text style={[styles.btnDeclineText, { color: c.textSecondary }]}>
              {t('bg_location_disclosure_decline')}
            </Text>
          </AnimatedButton>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  iconBadge: {
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 8,
  },
  headline: {
    fontSize: 24,
    fontFamily: fonts.bold,
    fontWeight: '700',
    lineHeight: 30,
    marginBottom: 18,
  },
  bodyBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
  policyBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
  },
  policyIcon: { marginTop: 2, flexShrink: 0 },
  policyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.regular,
    lineHeight: 18,
  },
  buttonArea: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'android' ? 18 : 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
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
  btnDecline: {
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDeclineText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    textDecorationLine: 'underline',
  },
})
