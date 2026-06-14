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
import { useTranslation } from 'react-i18next'
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons'

import AnimatedButton from './AnimatedButton'
import { fonts } from '../theme/typography'
import { useTheme, type AppColors } from '../theme/theme'
import { navigationRef } from '../navigation/RootNavigator'

interface Props {
  visible: boolean
  /** When native ingest bridge is ready, the modal must not mount. */
  bridgeActive?: boolean
  onAccept: () => void
  onCancel: () => void
}

interface PermissionCardProps {
  icon: string
  iconFamily: 'MaterialCommunityIcons' | 'Feather'
  title: string
  whyLabel: string
  whyBody: string
  notLabel: string
  notBody: string
  iconColor: string
  bgColor: string
  c: AppColors
}

function PermissionCard({
  icon,
  iconFamily,
  title,
  whyLabel,
  whyBody,
  notLabel,
  notBody,
  iconColor,
  bgColor,
  c,
}: PermissionCardProps) {
  const Icon = iconFamily === 'Feather' ? Feather : MaterialCommunityIcons
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconWrap, { backgroundColor: bgColor }]}>
          <Icon name={icon as any} size={22} color={iconColor} />
        </View>
        <Text style={[styles.cardTitle, { color: c.text }]}>{title}</Text>
      </View>

      <View style={styles.cardBlock}>
        <Text style={[styles.cardLabel, { color: c.text }]}>{whyLabel}</Text>
        <Text style={[styles.cardBody, { color: c.textSecondary }]}>{whyBody}</Text>
      </View>

      <View style={[styles.cardInnerSep, { backgroundColor: c.separator }]} />

      <View style={styles.cardBlock}>
        <Text style={[styles.cardLabel, styles.cardLabelNot, { color: c.warning }]}>{notLabel}</Text>
        <Text style={[styles.cardBody, { color: c.textSecondary }]}>{notBody}</Text>
      </View>
    </View>
  )
}

export function ProminentDisclosureModal({ visible, bridgeActive = false, onAccept, onCancel }: Props) {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const { colors: c, isDark } = useTheme()

  const handleAccept = useCallback(() => {
    onAccept()
    setTimeout(() => {
      try {
        if (navigationRef.isReady()) {
          navigationRef.navigate('Permissions')
        }
      } catch {
        /* noop — modal already closed */
      }
    }, 0)
  }, [onAccept])

  const handleCancel = useCallback(() => { onCancel() }, [onCancel])

  if (bridgeActive || !visible) return null

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.headerBar, { borderBottomColor: c.separator }]}>
          <View style={[styles.shieldBadge, { backgroundColor: c.primaryDim }]}>
            <MaterialCommunityIcons name="shield-check" size={22} color={c.primary} />
          </View>
          <Text style={[styles.headerLabel, { color: c.textMuted }]}>
            {t('perm_onboarding_header')}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Text style={[styles.headline, { color: c.text }]}>
            {t('perm_onboarding_title')}
          </Text>
          <Text style={[styles.subheadline, { color: c.textSecondary }]}>
            {t('perm_onboarding_subtitle')}
          </Text>

          <View style={[styles.divider, { backgroundColor: c.separator }]} />

          <Text style={[styles.valueProp, { color: c.textSecondary }]}>
            {t('perm_onboarding_value_prop')}
          </Text>

          <PermissionCard
            c={c}
            icon="bell-ring-outline"
            iconFamily="MaterialCommunityIcons"
            title={t('perm_onboarding_notif_title')}
            whyLabel={t('perm_onboarding_why_label')}
            whyBody={t('perm_onboarding_notif_why_body')}
            notLabel={t('perm_onboarding_not_label')}
            notBody={t('perm_onboarding_notif_not_body')}
            iconColor={c.primary}
            bgColor={c.primaryDim}
          />

          <PermissionCard
            c={c}
            icon="crosshairs-gps"
            iconFamily="MaterialCommunityIcons"
            title={t('perm_onboarding_loc_title')}
            whyLabel={t('perm_onboarding_why_label')}
            whyBody={t('perm_onboarding_loc_why_body')}
            notLabel={t('perm_onboarding_not_label')}
            notBody={t('perm_onboarding_loc_not_body')}
            iconColor={c.success}
            bgColor={isDark ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.10)'}
          />

          <View style={[
            styles.policyBox,
            {
              backgroundColor: isDark ? '#0A1A3D' : '#EEF3FF',
              borderColor: isDark ? '#1E3A6E' : '#C7D7FF',
            },
          ]}>
            <Feather name="info" size={14} color={c.primary} style={styles.policyIcon} />
            <Text style={[styles.policyText, { color: isDark ? '#94B4FF' : '#2750B5' }]}>
              <Text style={{ fontFamily: fonts.semiBold }}>{t('perm_onboarding_policy_label')} </Text>
              {t('perm_onboarding_policy_body')}
            </Text>
          </View>

          <View style={styles.scrollSpacer} />
        </ScrollView>

        <View style={[styles.buttonArea, { backgroundColor: c.bg, borderTopColor: c.separator }]}>
          <AnimatedButton
            style={[styles.btnAccept, { backgroundColor: c.primary }]}
            activeOpacity={0.85}
            onPress={handleAccept}
            accessibilityLabel={t('perm_onboarding_cta_primary')}
          >
            <MaterialCommunityIcons name="shield-check" size={18} color="#FFFFFF" />
            <Text style={styles.btnAcceptText}>{t('perm_onboarding_cta_primary')}</Text>
          </AnimatedButton>

          <AnimatedButton
            style={styles.btnCancel}
            activeOpacity={0.75}
            onPress={handleCancel}
            accessibilityLabel={t('perm_onboarding_cta_secondary')}
          >
            <Text style={[styles.btnCancelText, { color: c.textSecondary }]}>
              {t('perm_onboarding_cta_secondary')}
            </Text>
          </AnimatedButton>

          <Text style={[styles.helperText, { color: c.textMuted }]}>
            {t('perm_onboarding_cta_helper')}
          </Text>
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
    fontSize: 26,
    fontFamily: fonts.bold,
    fontWeight: '700',
    lineHeight: 32,
  },
  subheadline: {
    fontSize: 14,
    fontFamily: fonts.regular,
    marginTop: 8,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    marginVertical: 20,
    borderRadius: 1,
  },
  valueProp: {
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 21,
    marginBottom: 20,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 14,
    paddingBottom: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    flex: 1,
    lineHeight: 20,
  },
  cardBlock: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cardLabel: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  cardLabelNot: {
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 0.6,
  },
  cardBody: {
    fontSize: 13,
    fontFamily: fonts.regular,
    lineHeight: 19,
  },
  cardInnerSep: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  policyBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    marginTop: 4,
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
  btnCancel: {
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    textDecorationLine: 'underline',
  },
  helperText: {
    fontSize: 11,
    fontFamily: fonts.regular,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 2,
    paddingHorizontal: 12,
  },
})
