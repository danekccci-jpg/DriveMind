import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import i18n from '../../i18n'
import { useColors, type AppColors } from '../../theme/theme'
import { fonts } from '../../theme/typography'
import {
  useNavigationSettingsStore,
  type MarkerStyleId,
  type MapAppearance,
  type Units,
  type DirectionsMode,
} from '../../store/navigationSettingsStore'
import { useLanguageStore, cycleDriveMindLanguage, type Language } from '../../store/languageStore'
import { IntegrationHealthCard } from '../../components/IntegrationHealthCard'

const LANG_I18N_KEY: Record<Language, 'language_en' | 'language_pl' | 'language_uk' | 'language_ru'> = {
  en: 'language_en',
  pl: 'language_pl',
  uk: 'language_uk',
  ru: 'language_ru',
}

const MARKER_OPTIONS: { id: MarkerStyleId; labelKey: string }[] = [
  { id: 'classic', labelKey: 'nav_marker_classic' },
  { id: 'arrow3d', labelKey: 'nav_marker_3d' },
  { id: 'car', labelKey: 'nav_marker_car' },
]

const MAP_APPEARANCE: { id: MapAppearance; labelKey: string }[] = [
  { id: 'auto', labelKey: 'nav_map_auto' },
  { id: 'light', labelKey: 'nav_map_light' },
  { id: 'dark', labelKey: 'nav_map_dark' },
]

const UNITS_OPTS: { id: Units; labelKey: string }[] = [
  { id: 'metric', labelKey: 'nav_units_metric' },
  { id: 'imperial', labelKey: 'nav_units_imperial' },
]

const MODE_OPTS: { id: DirectionsMode; labelKey: string }[] = [
  { id: 'driving', labelKey: 'nav_mode_driving' },
  { id: 'bicycling', labelKey: 'nav_mode_bicycling' },
]

export default function NavigationSettingsScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const c = useColors()
  const language = useLanguageStore((s) => s.language)
  const setLanguage = useLanguageStore((s) => s.setLanguage)

  const markerStyle = useNavigationSettingsStore((s) => s.markerStyle)
  const setMarkerStyle = useNavigationSettingsStore((s) => s.setMarkerStyle)
  const mapAppearance = useNavigationSettingsStore((s) => s.mapAppearance)
  const setMapAppearance = useNavigationSettingsStore((s) => s.setMapAppearance)
  const units = useNavigationSettingsStore((s) => s.units)
  const setUnits = useNavigationSettingsStore((s) => s.setUnits)
  const avoidTolls = useNavigationSettingsStore((s) => s.avoidTolls)
  const setAvoidTolls = useNavigationSettingsStore((s) => s.setAvoidTolls)
  const trafficAware = useNavigationSettingsStore((s) => s.trafficAware)
  const setTrafficAware = useNavigationSettingsStore((s) => s.setTrafficAware)
  const directionsMode = useNavigationSettingsStore((s) => s.directionsMode)
  const setDirectionsMode = useNavigationSettingsStore((s) => s.setDirectionsMode)

  const cycleLang = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const next = cycleDriveMindLanguage(language)
    setLanguage(next)
    void i18n.changeLanguage(next)
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: c.bg }]}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: c.text }]}>{t('nav_settings_title')}</Text>
      <Text style={[styles.sub, { color: c.textSecondary }]}>{t('nav_settings_subtitle')}</Text>

      <Section title={t('nav_marker_title')} c={c} />
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {MARKER_OPTIONS.map((opt) => {
          const selected = markerStyle === opt.id
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.rowPick, { borderBottomColor: c.separator }]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setMarkerStyle(opt.id)
              }}
            >
              <Text style={[styles.rowLabel, { color: c.text }]}>{t(opt.labelKey)}</Text>
              <View style={[styles.radio, { borderColor: selected ? c.primary : c.border }]}>
                {selected && <View style={[styles.radioInner, { backgroundColor: c.primary }]} />}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <Section title={t('nav_map_style_title')} c={c} />
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {MAP_APPEARANCE.map((opt, i) => {
          const selected = mapAppearance === opt.id
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.rowPick, i === MAP_APPEARANCE.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setMapAppearance(opt.id)
              }}
            >
              <Text style={[styles.rowLabel, { color: c.text }]}>{t(opt.labelKey)}</Text>
              <View style={[styles.radio, { borderColor: selected ? c.primary : c.border }]}>
                {selected && <View style={[styles.radioInner, { backgroundColor: c.primary }]} />}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <Section title={t('nav_lang_units_title')} c={c} />
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <TouchableOpacity style={[styles.rowPick, { borderBottomColor: c.separator }]} onPress={cycleLang} activeOpacity={0.7}>
          <Text style={[styles.rowLabel, { color: c.text }]}>{t('language')}</Text>
          <Text style={[styles.value, { color: c.textSecondary }]}>{t(LANG_I18N_KEY[language])}</Text>
        </TouchableOpacity>
        {UNITS_OPTS.map((opt, i) => {
          const selected = units === opt.id
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.rowPick, i === UNITS_OPTS.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setUnits(opt.id)
              }}
            >
              <Text style={[styles.rowLabel, { color: c.text }]}>{t(opt.labelKey)}</Text>
              <View style={[styles.radio, { borderColor: selected ? c.primary : c.border }]}>
                {selected && <View style={[styles.radioInner, { backgroundColor: c.primary }]} />}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <Section title={t('nav_route_prefs_title')} c={c} />
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={[styles.rowSwitch, { borderBottomColor: c.separator }]}>
          <Text style={[styles.rowLabel, { color: c.text }]}>{t('nav_avoid_tolls')}</Text>
          <Switch
            value={avoidTolls}
            onValueChange={(v) => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              setAvoidTolls(v)
            }}
            trackColor={{ false: c.border, true: c.primaryDim }}
            thumbColor={Platform.OS === 'android' ? (avoidTolls ? c.primary : c.surfaceAlt) : undefined}
          />
        </View>
        <View style={styles.rowSwitch}>
          <Text style={[styles.rowLabel, { color: c.text, flex: 1 }]}>{t('nav_traffic_aware')}</Text>
          <Switch
            value={trafficAware}
            onValueChange={(v) => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              setTrafficAware(v)
            }}
            trackColor={{ false: c.border, true: c.primaryDim }}
            thumbColor={Platform.OS === 'android' ? (trafficAware ? c.primary : c.surfaceAlt) : undefined}
          />
        </View>
      </View>

      <Section title={t('nav_mode_title')} c={c} />
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {MODE_OPTS.map((opt, i) => {
          const selected = directionsMode === opt.id
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.rowPick, i === MODE_OPTS.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setDirectionsMode(opt.id)
              }}
            >
              <Text style={[styles.rowLabel, { color: c.text }]}>{t(opt.labelKey)}</Text>
              <View style={[styles.radio, { borderColor: selected ? c.primary : c.border }]}>
                {selected && <View style={[styles.radioInner, { backgroundColor: c.primary }]} />}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      {Platform.OS === 'android' ? <IntegrationHealthCard /> : null}

      <Text style={[styles.hint, { color: c.textMuted }]}>{t('nav_settings_hint')}</Text>
    </ScrollView>
  )
}

function Section({ title, c }: { title: string; c: AppColors }) {
  return (
    <Text style={[styles.section, { color: c.textMuted }]}>{title}</Text>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { fontSize: 22, fontFamily: fonts.bold, fontWeight: '700', marginBottom: 6 },
  sub: { fontSize: 14, fontFamily: fonts.regular, marginBottom: 20, lineHeight: 20 },
  section: {
    fontSize: 11,
    fontFamily: fonts.medium,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 8,
  },
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
  rowPick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 15, fontFamily: fonts.regular, flex: 1 },
  value: { fontSize: 14, fontFamily: fonts.medium },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 12, height: 12, borderRadius: 6 },
  hint: { fontSize: 12, fontFamily: fonts.regular, marginTop: 16, lineHeight: 18 },
})
