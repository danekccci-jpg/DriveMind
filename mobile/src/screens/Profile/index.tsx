import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import * as Haptics from 'expo-haptics'

import { useRoleStore } from '../../store/roleStore'
import { useThemeStore } from '../../store/themeStore'
import { useLanguageStore } from '../../store/languageStore'
import { fonts } from '../../theme/typography'

type Role = 'courier' | 'taxi'
type VehicleType = 'bike' | 'moped' | 'car'

const VEHICLE_OPTIONS: { id: VehicleType; emoji: string; label: string }[] = [
  { id: 'bike', emoji: '🚲', label: 'bike' },
  { id: 'moped', emoji: '🛵', label: 'moped' },
  { id: 'car', emoji: '🚗', label: 'car' },
]

interface Alert {
  id: string
  type: 'demand' | 'platform' | 'milestone' | 'review'
  title: string
  desc: string
  time: string
}

const MOCK_ALERTS: Alert[] = [
  {
    id: '1',
    type: 'demand',
    title: 'High demand nearby',
    desc: 'Stare Miasto zone is surging right now',
    time: '2 min ago',
  },
  {
    id: '2',
    type: 'platform',
    title: 'Better platform available',
    desc: 'Wolt paying +18% more than Glovo now',
    time: '14 min ago',
  },
  {
    id: '3',
    type: 'milestone',
    title: 'Earnings milestone',
    desc: 'You reached 1,000 PLN this week 🎉',
    time: '1 hr ago',
  },
  {
    id: '4',
    type: 'review',
    title: 'Shift in review',
    desc: 'Yesterday\'s shift summary is ready',
    time: '3 hr ago',
  },
]

const ALERT_DOT_COLOR: Record<Alert['type'], string> = {
  demand: '#F59E0B',
  platform: '#00BCFF',
  milestone: '#22C55E',
  review: '#888888',
}

export default function ProfileScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  const role = useRoleStore((s) => s.role)
  const vehicleType = useRoleStore((s) => s.vehicleType)
  const fuelConsumption = useRoleStore((s) => s.fuelConsumption)
  const setRole = useRoleStore((s) => s.setRole)
  const setVehicleType = useRoleStore((s) => s.setVehicleType)
  const setFuelConsumption = useRoleStore((s) => s.setFuelConsumption)

  const { theme, toggleTheme } = useThemeStore()
  const { language, setLanguage } = useLanguageStore()

  const [fuelInput, setFuelInput] = useState(String(fuelConsumption))

  const handleFuelChange = (val: string) => {
    setFuelInput(val)
    const n = parseFloat(val)
    if (!isNaN(n) && n > 0) setFuelConsumption(n)
  }

  const handleLanguageToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const next = language === 'en' ? 'pl' : 'en'
    setLanguage(next)
    i18n.changeLanguage(next)
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── User card ── */}
      <View style={s.userCard}>
        <View style={s.userRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>DM</Text>
          </View>
          <View style={s.userInfo}>
            <View style={s.userNameRow}>
              <Text style={s.userName}>Damian K.</Text>
              <View style={s.rolePill}>
                <Text style={s.rolePillText}>{role ?? 'courier'}</Text>
              </View>
            </View>
            <Text style={s.memberSince}>Member since March 2026</Text>
          </View>
        </View>
      </View>

      {/* ── My Role ── */}
      <SectionLabel label={t('my_role')} />
      <View style={s.roleRow}>
        {(['courier', 'taxi'] as Role[]).map((r) => {
          const selected = role === r
          return (
            <TouchableOpacity
              key={r}
              activeOpacity={0.7}
              style={[s.roleCard, selected ? s.cardSelected : s.cardUnselected]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setRole(r)
              }}
            >
              <Text style={s.roleEmoji}>{r === 'courier' ? '🚲' : '🚗'}</Text>
              <Text style={s.roleCardLabel}>{t(r)}</Text>
              <Text style={s.roleCardSub}>
                {r === 'courier' ? t('courier_subtitle') : t('taxi_subtitle')}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* ── My Transport (courier only) ── */}
      {role === 'courier' && (
        <>
          <SectionLabel label={t('my_transport')} />
          <View style={s.vehicleRow}>
            {VEHICLE_OPTIONS.map(({ id, emoji, label }) => {
              const selected = vehicleType === id
              return (
                <TouchableOpacity
                  key={id}
                  activeOpacity={0.7}
                  style={[s.vehicleCard, selected ? s.cardSelected : s.cardUnselected]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setVehicleType(id)
                  }}
                >
                  <Text style={s.vehicleEmoji}>{emoji}</Text>
                  <Text style={s.vehicleLabel}>{t(label)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </>
      )}

      {/* ── My Vehicle (taxi only) ── */}
      {role === 'taxi' && (
        <>
          <SectionLabel label={t('my_vehicle')} />
          <TextInput
            style={s.fuelInput}
            value={fuelInput}
            onChangeText={handleFuelChange}
            placeholder={t('fuel_consumption')}
            placeholderTextColor="#444444"
            keyboardType="numeric"
            returnKeyType="done"
          />
        </>
      )}

      {/* ── Recent Alerts ── */}
      <SectionLabel label={t('recent_alerts')} />
      {MOCK_ALERTS.map((alert) => (
        <View key={alert.id} style={s.alertCard}>
          <View style={[s.alertDot, { backgroundColor: ALERT_DOT_COLOR[alert.type] }]} />
          <View style={s.alertBody}>
            <Text style={s.alertTitle}>{alert.title}</Text>
            <Text style={s.alertDesc}>{alert.desc}</Text>
          </View>
          <Text style={s.alertTime}>{alert.time}</Text>
        </View>
      ))}

      {/* ── Settings ── */}
      <SectionLabel label={t('settings')} />
      <View style={s.settingsCard}>
        <SettingsRow
          icon="🔔"
          label={t('notification_prefs')}
          right={<Text style={s.settingsArrow}>›</Text>}
        />
        <SettingsRow
          icon="🌐"
          label={t('language')}
          right={
            <TouchableOpacity onPress={handleLanguageToggle} activeOpacity={0.7}>
              <Text style={s.settingsValue}>{language === 'en' ? 'English' : 'Polski'}</Text>
            </TouchableOpacity>
          }
          noBorder={false}
        />
        <SettingsRow
          icon="🌙"
          label={t('dark_mode')}
              right={
            <Switch
              value={theme === 'dark'}
              onValueChange={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                toggleTheme()
              }}
              trackColor={{ false: '#2A2A2A', true: '#FFFFFF' }}
              thumbColor={theme === 'dark' ? '#000000' : '#888888'}
            />
          }
          noBorder={false}
        />
        <SettingsRow
          icon="ℹ️"
          label={t('about')}
          right={<Text style={s.settingsArrow}>›</Text>}
          noBorder
        />
      </View>

      {/* ── Sign out ── */}
      <TouchableOpacity style={s.signOutBtn} activeOpacity={0.7}>
        <Text style={s.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return <Text style={s.sectionLabel}>{label}</Text>
}

function SettingsRow({
  icon,
  label,
  right,
  noBorder = false,
}: {
  icon: string
  label: string
  right: React.ReactNode
  noBorder?: boolean
}) {
  return (
    <View style={[s.settingsRow, noBorder && s.settingsRowNoBorder]}>
      <Text style={s.settingsIcon}>{icon}</Text>
      <Text style={s.settingsLabel}>{label}</Text>
      <View style={s.settingsRight}>{right}</View>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  content: { paddingHorizontal: 16 },

  // User card
  userCard: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '600', fontFamily: fonts.semiBold, color: '#FFFFFF' },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  userName: { fontSize: 17, fontWeight: '600', fontFamily: fonts.semiBold, color: '#FFFFFF' },
  rolePill: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rolePillText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  memberSince: { fontSize: 13, fontFamily: fonts.regular, color: '#888888' },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: '#444444',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 4,
  },

  // Role cards
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  roleCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'flex-start',
    gap: 4,
  },
  cardSelected: {
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardUnselected: { borderColor: '#2A2A2A', backgroundColor: '#111111' },
  roleEmoji: { fontSize: 24, marginBottom: 4 },
  roleCardLabel: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold, color: '#FFFFFF' },
  roleCardSub: { fontSize: 11, fontFamily: fonts.regular, color: '#888888' },

  // Vehicle cards
  vehicleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  vehicleCard: {
    flex: 1,
    height: 72,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  vehicleEmoji: { fontSize: 24 },
  vehicleLabel: { fontSize: 12, fontFamily: fonts.medium, color: '#FFFFFF' },

  // Fuel input
  fuelInput: {
    height: 48,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: '#FFFFFF',
    marginBottom: 16,
  },

  // Alert cards
  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    flexShrink: 0,
  },
  alertBody: { flex: 1 },
  alertTitle: { fontSize: 14, fontWeight: '500', fontFamily: fonts.medium, color: '#FFFFFF', marginBottom: 2 },
  alertDesc: { fontSize: 13, fontFamily: fonts.regular, color: '#888888' },
  alertTime: { fontSize: 11, fontFamily: fonts.regular, color: '#444444' },

  // Settings
  settingsCard: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    gap: 12,
  },
  settingsRowNoBorder: { borderBottomWidth: 0 },
  settingsIcon: { fontSize: 20 },
  settingsLabel: { flex: 1, fontSize: 15, fontFamily: fonts.regular, color: '#FFFFFF' },
  settingsRight: { alignItems: 'flex-end' },
  settingsValue: { fontSize: 14, fontFamily: fonts.regular, color: '#444444' },
  settingsArrow: { fontSize: 20, color: '#444444' },

  // Sign out
  signOutBtn: { paddingVertical: 16, alignItems: 'center' },
  signOutText: { fontSize: 14, fontFamily: fonts.medium, color: '#EF4444' },
})
