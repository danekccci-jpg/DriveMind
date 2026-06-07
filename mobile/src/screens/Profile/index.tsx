import React, { useState } from 'react'
import Constants from 'expo-constants'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import i18n from '../../i18n'
import * as Haptics from 'expo-haptics'

import { useRoleStore } from '../../store/roleStore'
import { useDriverSessionStore } from '../../store/driverSessionStore'
import { useAuthStore } from '../../store/authStore'
import { signOutFirebase } from '../../services/firebaseAuth'
import { useThemeStore } from '../../store/themeStore'
import { useLanguageStore, cycleDriveMindLanguage, type Language } from '../../store/languageStore'
import { useColors, type AppColors } from '../../theme/theme'
import { fonts } from '../../theme/typography'
import Logo from '../../components/common/Logo'

const LANG_I18N_KEY: Record<Language, 'language_en' | 'language_pl' | 'language_uk' | 'language_ru'> = {
  en: 'language_en',
  pl: 'language_pl',
  uk: 'language_uk',
  ru: 'language_ru',
}

type Role = 'courier' | 'taxi'
type VehicleType = 'bike' | 'moped' | 'car'

const VEHICLE_OPTIONS: { id: VehicleType; icon: string; label: string }[] = [
  { id: 'bike', icon: 'bike', label: 'bike' },
  { id: 'moped', icon: 'moped', label: 'moped' },
  { id: 'car', icon: 'car-outline', label: 'car' },
]

const THEME_LABELS: Record<string, string> = { dark: 'Dark', light: 'Light', system: 'System' }

export default function ProfileScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const c = useColors()
  const navigation = useNavigation<any>()

  const role = useRoleStore((s) => s.role)
  const vehicleType = useRoleStore((s) => s.vehicleType)
  const fuelConsumption = useRoleStore((s) => s.fuelConsumption)
  const setRole = useRoleStore((s) => s.setRole)
  const setVehicleType = useRoleStore((s) => s.setVehicleType)
  const setFuelConsumption = useRoleStore((s) => s.setFuelConsumption)

  const isOnline = useDriverSessionStore((s) => s.isOnline)
  const setIsOnline = useDriverSessionStore((s) => s.setIsOnline)

  const themeMode = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const { language, setLanguage } = useLanguageStore()

  const userName = useAuthStore((s) => s.userName)
  const userEmail = useAuthStore((s) => s.userEmail)
  const authSignOut = useAuthStore((s) => s.signOut)

  const [fuelInput, setFuelInput] = useState(String(fuelConsumption))

  const handleFuelChange = (val: string) => {
    setFuelInput(val)
    const n = parseFloat(val)
    if (!isNaN(n) && n > 0) setFuelConsumption(n)
  }

  const handleLanguageToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const next = cycleDriveMindLanguage(language)
    setLanguage(next)
    i18n.changeLanguage(next)
  }

  return (
    <ScrollView
      style={[s.root, { backgroundColor: c.bg }]}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* User card */}
      <View style={[s.userCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={s.userRow}>
          <View style={[s.avatar, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <Text style={[s.avatarText, { color: c.text }]}>DM</Text>
          </View>
          <View style={s.userInfo}>
            <View style={s.userNameRow}>
              <Text style={[s.userName, { color: c.text }]} numberOfLines={1}>
                {userName?.trim() || 'DriveMind'}
              </Text>
              <View style={[s.rolePill, { backgroundColor: c.surfaceAlt }]}>
                <Text style={[s.rolePillText, { color: c.textSecondary }]}>{role ?? 'courier'}</Text>
              </View>
            </View>
            <Text style={[s.memberSince, { color: c.textSecondary }]} numberOfLines={1}>
              {userEmail?.trim() || '—'}
            </Text>
          </View>
        </View>
      </View>

      <SectionLabel label={t('availability_section')} color={c.textMuted} />
      <View style={[s.settingsCard, { backgroundColor: c.surface, borderColor: c.border, marginBottom: 16 }]}>
        <View style={s.availabilityRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[s.availTitle, { color: c.text }]}>{t('driver_online')}</Text>
            <Text style={[s.availSub, { color: c.textSecondary }]}>{t('driver_online_desc')}</Text>
          </View>
          <Switch
            value={isOnline}
            onValueChange={(v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              setIsOnline(v)
            }}
            trackColor={{ false: c.border, true: c.primaryDim }}
            thumbColor={isOnline ? c.primary : c.surfaceAlt}
          />
        </View>
      </View>

      {/* My Role */}
      <SectionLabel label={t('my_role')} color={c.textMuted} />
      <View style={s.roleRow}>
        {(['courier', 'taxi'] as Role[]).map((r) => {
          const selected = role === r
          return (
            <TouchableOpacity
              key={r}
              activeOpacity={0.7}
              style={[
                s.roleCard,
                {
                  backgroundColor: selected ? c.primaryDim : c.surface,
                  borderColor: selected ? c.primary : c.border,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setRole(r)
              }}
            >
              <MaterialCommunityIcons
                name={r === 'courier' ? 'bike' : 'car-outline'}
                size={24}
                color={selected ? c.primary : c.secondary}
              />
              <Text style={[s.roleCardLabel, { color: c.text }]}>{t(r)}</Text>
              <Text style={[s.roleCardSub, { color: c.textSecondary }]}>
                {r === 'courier' ? t('courier_subtitle') : t('taxi_subtitle')}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Transport (courier only) */}
      {role === 'courier' && (
        <>
          <SectionLabel label={t('my_transport')} color={c.textMuted} />
          <View style={s.vehicleRow}>
            {VEHICLE_OPTIONS.map(({ id, icon, label }) => {
              const selected = vehicleType === id
              return (
                <TouchableOpacity
                  key={id}
                  activeOpacity={0.7}
                  style={[
                    s.vehicleCard,
                    {
                      backgroundColor: selected ? c.primaryDim : c.surface,
                      borderColor: selected ? c.primary : c.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setVehicleType(id)
                  }}
                >
                  <MaterialCommunityIcons name={icon as any} size={24} color={selected ? c.primary : c.secondary} />
                  <Text style={[s.vehicleLabel, { color: c.text }]}>{t(label)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </>
      )}

      {/* Fuel consumption (taxi only) */}
      {role === 'taxi' && (
        <>
          <SectionLabel label={t('fuel_consumption_label')} color={c.textMuted} />
          <TextInput
            style={[s.fuelInput, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
            value={fuelInput}
            onChangeText={handleFuelChange}
            placeholder={t('fuel_consumption')}
            placeholderTextColor={c.textMuted}
            keyboardType="numeric"
            returnKeyType="done"
          />
        </>
      )}

      {/* Settings */}
      <SectionLabel label={t('settings')} color={c.textMuted} />
      <View style={[s.settingsCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <SettingsRow
          icon={<Feather name="shield" size={20} color={c.secondary} />}
          label={t('system_permissions')}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            navigation.navigate('Permissions')
          }}
          right={<Feather name="chevron-right" size={18} color={c.textMuted} />}
          separatorColor={c.separator}
        />
        <SettingsRow
          icon={<Feather name="map" size={20} color={c.secondary} />}
          label={t('navigation_settings')}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            navigation.navigate('NavigationSettings')
          }}
          right={<Feather name="chevron-right" size={18} color={c.textMuted} />}
          separatorColor={c.separator}
        />
        <SettingsRow
          icon={<Feather name="bell" size={20} color={c.secondary} />}
          label={t('notification_prefs')}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            navigation.navigate('Notifications')
          }}
          right={<Feather name="chevron-right" size={18} color={c.textMuted} />}
          separatorColor={c.separator}
        />
        <SettingsRow
          icon={<Feather name="globe" size={20} color={c.secondary} />}
          label={t('language')}
          right={
            <TouchableOpacity onPress={handleLanguageToggle} activeOpacity={0.7}>
              <Text style={[s.settingsValue, { color: c.textMuted }]}>
                {t(LANG_I18N_KEY[language])}
              </Text>
            </TouchableOpacity>
          }
          separatorColor={c.separator}
        />
        <SettingsRow
          icon={<Feather name="moon" size={20} color={c.secondary} />}
          label={t('dark_mode')}
          right={
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                toggleTheme()
              }}
              activeOpacity={0.7}
              style={[s.themeToggle, { backgroundColor: c.surfaceAlt }]}
            >
              <Text style={[s.themeToggleText, { color: c.text }]}>
                {THEME_LABELS[themeMode]}
              </Text>
            </TouchableOpacity>
          }
          separatorColor={c.separator}
        />
        
      </View>

      <View style={s.aboutBlock}>
        <Logo theme="auto" variant="symbol" size={56} />
        <Text style={[s.aboutVersion, { color: c.textMuted }]}>
          {`DriveMind v${Constants.expoConfig?.version ?? '1.0.0'}`}
        </Text>
      </View>

      <TouchableOpacity
        style={s.signOutBtn}
        activeOpacity={0.7}
        onPress={async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          await signOutFirebase()
          authSignOut()
        }}
      >
        <Text style={[s.signOutText, { color: c.danger }]}>{t('sign_out')}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return <Text style={[s.sectionLabel, { color }]}>{label}</Text>
}

function SettingsRow({
  icon,
  label,
  right,
  separatorColor,
  onPress,
  noBorder = false,
}: {
  icon: React.ReactNode
  label: string
  right: React.ReactNode
  separatorColor: string
  onPress?: () => void
  noBorder?: boolean
}) {
  const colors = useColors()
  const row = (
    <View style={[s.settingsRow, !noBorder && { borderBottomWidth: 1, borderBottomColor: separatorColor }]}>
      {icon}
      <Text style={[s.settingsLabel, { color: colors.text }]}>{label}</Text>
      <View style={s.settingsRight}>{right}</View>
    </View>
  )

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {row}
      </TouchableOpacity>
    )
  }

  return (
    row
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20 },
  userCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 20 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '600', fontFamily: fonts.semiBold },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  userName: { fontSize: 17, fontWeight: '600', fontFamily: fonts.semiBold },
  rolePill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  rolePillText: { fontSize: 11, fontFamily: fonts.medium, textTransform: 'capitalize' },
  memberSince: { fontSize: 13, fontFamily: fonts.regular },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  availTitle: { fontSize: 15, fontFamily: fonts.medium, marginBottom: 2 },
  availSub: { fontSize: 12, fontFamily: fonts.regular, lineHeight: 16 },
  sectionLabel: { fontSize: 11, fontFamily: fonts.medium, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  roleCard: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'flex-start', gap: 4 },
  roleCardLabel: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  roleCardSub: { fontSize: 11, fontFamily: fonts.regular },
  vehicleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  vehicleCard: { flex: 1, height: 72, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 6 },
  vehicleLabel: { fontSize: 12, fontFamily: fonts.medium },
  fuelInput: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 15, fontFamily: fonts.regular, marginBottom: 16 },
  settingsCard: { borderWidth: 1, borderRadius: 12, marginBottom: 20, overflow: 'hidden' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  settingsLabel: { flex: 1, fontSize: 15, fontFamily: fonts.regular },
  settingsRight: { alignItems: 'flex-end' },
  settingsValue: { fontSize: 14, fontFamily: fonts.regular },
  themeToggle: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  themeToggleText: { fontSize: 13, fontFamily: fonts.medium },
  aboutBlock: { alignItems: 'center', marginTop: 8, marginBottom: 4, gap: 10 },
  aboutVersion: { fontSize: 12, fontFamily: fonts.regular },
  signOutBtn: { paddingVertical: 16, alignItems: 'center' },
  signOutText: { fontSize: 14, fontFamily: fonts.medium },
})
