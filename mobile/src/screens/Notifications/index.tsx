import React from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'

import { useColors } from '../../theme/theme'
import { fonts } from '../../theme/typography'

type NotificationType = 'demand' | 'platform' | 'milestone' | 'review'

interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  descKey: string
  descParams?: Record<string, string | number>
  time: string
}

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    type: 'demand',
    title: 'high_demand',
    descKey: 'high_demand_desc',
    descParams: { zone: 'Kazimierz' },
    time: '2m',
  },
  {
    id: '2',
    type: 'platform',
    title: 'better_platform',
    descKey: 'better_platform_desc_tmpl',
    descParams: { p1: 'Wolt', p2: 'Glovo', percent: 18 },
    time: '14m',
  },
  {
    id: '3',
    type: 'milestone',
    title: 'earnings_milestone',
    descKey: 'earnings_milestone_desc',
    time: '1h',
  },
  {
    id: '4',
    type: 'review',
    title: 'shift_review',
    descKey: 'shift_review_desc',
    time: '3h',
  },
]

export default function NotificationsScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const c = useColors()

  const dotColor = (type: NotificationType) => {
    const map: Record<NotificationType, string> = {
      demand: '#F59E0B',
      platform: '#00BCFF',
      milestone: '#22C55E',
      review: c.secondary,
    }
    return map[type]
  }

  return (
    <ScrollView
      style={[s.root, { backgroundColor: c.bg }]}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: 32 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[s.headerCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={[s.iconWrap, { backgroundColor: c.primaryDim }]}>
          <Feather name="bell" size={18} color={c.primary} />
        </View>
        <View style={s.headerText}>
          <Text style={[s.headerTitle, { color: c.text }]}>{t('notification_prefs')}</Text>
          <Text style={[s.headerSub, { color: c.textSecondary }]}>{t('latest_updates_drivemind')}</Text>
        </View>
      </View>

      {MOCK_NOTIFICATIONS.map((n) => (
        <View key={n.id} style={[s.item, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[s.dot, { backgroundColor: dotColor(n.type) }]} />
          <View style={s.itemBody}>
            <Text style={[s.itemTitle, { color: c.text }]}>{t(n.title)}</Text>
            <Text style={[s.itemDesc, { color: c.textSecondary }]}>
              {t(n.descKey, n.descParams)}
            </Text>
          </View>
          <Text style={[s.itemTime, { color: c.textMuted }]}>
            {n.time.endsWith('m')
              ? `${n.time.replace('m', '')} ${t('min_ago_short')}`
              : `${n.time.replace('h', '')} ${t('hr_ago_short')}`}
          </Text>
        </View>
      ))}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20 },
  headerCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 16, fontFamily: fonts.semiBold, fontWeight: '600' },
  headerSub: { fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0 },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '500', fontFamily: fonts.medium, marginBottom: 2 },
  itemDesc: { fontSize: 13, fontFamily: fonts.regular },
  itemTime: { fontSize: 11, fontFamily: fonts.regular },
})
