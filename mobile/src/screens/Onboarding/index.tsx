import React, { useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
  SafeAreaView,
  Platform,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useRoleStore } from '../../store/roleStore'
import PlatformIcon from '../../components/PlatformIcon'
import { fonts } from '../../theme/typography'
import { useColors } from '../../theme/theme'

const { width: SCREEN_W } = Dimensions.get('window')
const H_PAD = 28
const TILE_W = SCREEN_W - H_PAD * 2
const TILE_H = 170

type VehicleType = 'bike' | 'moped' | 'car'
type PlatformId = 'glovo' | 'uber' | 'bolt' | 'wolt'

const COURIER_PLATFORMS: PlatformId[] = ['glovo', 'uber', 'bolt', 'wolt']
const TAXI_PLATFORMS: PlatformId[] = ['uber', 'bolt']

const PLATFORM_LABELS: Record<PlatformId, string> = {
  glovo: 'Glovo',
  uber: 'Uber',
  bolt: 'Bolt',
  wolt: 'Wolt',
}

const VEHICLE_OPTIONS: { id: VehicleType; icon: string; label: string }[] = [
  { id: 'bike', icon: 'bike', label: 'bike' },
  { id: 'moped', icon: 'moped', label: 'moped' },
  { id: 'car', icon: 'car-outline', label: 'car' },
]

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
  const role = useRoleStore((s) => s.role) ?? 'courier'
  const { setVehicleType, setSelectedServices, setOnboardingComplete } = useRoleStore()

  const [step, setStep] = useState(0)
  const [selectedServices, setSelectedServicesLocal] = useState<PlatformId[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>('bike')
  const translateX = useRef(new Animated.Value(0)).current

  const isTaxi = role === 'taxi'
  const totalSteps = isTaxi ? 1 : 2
  const platforms = isTaxi ? TAXI_PLATFORMS : COURIER_PLATFORMS

  const animateTo = useCallback(
    (next: number, dir: 1 | -1) => {
      translateX.setValue(dir * SCREEN_W)
      setStep(next)
      Animated.timing(translateX, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    },
    [translateX],
  )

  const handleFinish = useCallback(() => {
    setVehicleType(selectedVehicle)
    setSelectedServices(selectedServices)
    setOnboardingComplete(true)
  }, [selectedVehicle, selectedServices, setVehicleType, setSelectedServices, setOnboardingComplete])

  const goNext = useCallback(() => {
    if (step === 0 && isTaxi) {
      handleFinish()
      return
    }
    if (step === 1) {
      handleFinish()
      return
    }
    animateTo(step + 1, 1)
  }, [step, isTaxi, animateTo, handleFinish])

  const goBack = useCallback(() => {
    animateTo(step - 1, -1)
  }, [step, animateTo])

  const toggleService = useCallback((id: PlatformId) => {
    setSelectedServicesLocal((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }, [])

  const renderChooseServices = () => (
    <View style={[st.step, { backgroundColor: c.bg }]}>
      <ProgressDots total={totalSteps} current={0} activeColor={c.primary} mutedColor={c.border} />
      <Text style={[st.title, { color: c.text }]}>{t('choose_services')}</Text>
      <Text style={[st.sub, { color: c.textSecondary }]}>{t('choose_services_subtitle')}</Text>

      <View style={st.serviceList}>
        {platforms.map((id) => {
          const selected = selectedServices.includes(id)
          return (
            <TouchableOpacity
              key={id}
              activeOpacity={0.7}
              style={[
                st.serviceCard,
                {
                  width: TILE_W,
                  height: TILE_H,
                  backgroundColor: selected ? c.primaryDim : c.surface,
                  borderColor: selected ? c.primary : c.border,
                },
              ]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleService(id) }}
            >
              <PlatformIcon platform={id} size={34} active={selected} />
              <Text style={[st.serviceLabel, { color: c.text }]}>{PLATFORM_LABELS[id].toUpperCase()}</Text>
              <View
                style={[
                  st.checkbox,
                  {
                    borderColor: selected ? c.primary : c.textMuted,
                    backgroundColor: selected ? c.primary : 'transparent',
                  },
                ]}
              >
                {selected && <Feather name="check" size={14} color={c.textInverse} />}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <PrimaryBtn
        label={isTaxi ? t('get_started') : t('next')}
        onPress={goNext}
        disabled={selectedServices.length === 0}
        bg={c.primary}
        textColor={c.textInverse}
      />
    </View>
  )

  const renderChooseTransport = () => (
    <View style={[st.step, { backgroundColor: c.bg }]}>
      <ProgressDots total={totalSteps} current={1} activeColor={c.primary} mutedColor={c.border} />
      <TouchableOpacity style={st.backBtn} onPress={goBack} activeOpacity={0.7}>
        <Feather name="arrow-left" size={22} color={c.text} />
      </TouchableOpacity>
      <Text style={[st.title, { color: c.text }]}>{t('choose_transport')}</Text>
      <Text style={[st.sub, { color: c.textSecondary }]}>{t('choose_transport_subtitle')}</Text>

      <View style={st.vehicleRow}>
        {VEHICLE_OPTIONS.map(({ id, icon, label }) => {
          const selected = selectedVehicle === id
          return (
            <TouchableOpacity
              key={id}
              activeOpacity={0.7}
              style={[
                st.vehicleCard,
                {
                  width: TILE_W,
                  height: TILE_H,
                  backgroundColor: selected ? c.primaryDim : c.surface,
                  borderColor: selected ? c.primary : c.border,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setSelectedVehicle(id)
              }}
            >
              <MaterialCommunityIcons
                name={icon as any}
                size={36}
                color={selected ? c.primary : c.secondary}
              />
              <Text style={[st.vehicleLabel, { color: c.text }]}>{t(label).toUpperCase()}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <PrimaryBtn label={t('get_started')} onPress={handleFinish} bg={c.primary} textColor={c.textInverse} />
    </View>
  )

  const steps = [renderChooseServices, renderChooseTransport]

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: c.bg }]}>
      <Animated.View style={[st.animated, { transform: [{ translateX }] }]}>
        {steps[step]?.()}
      </Animated.View>
    </SafeAreaView>
  )
}

function PrimaryBtn({
  label,
  onPress,
  disabled = false,
  bg,
  textColor,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  bg: string
  textColor: string
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[st.primaryBtn, { backgroundColor: bg, opacity: disabled ? 0.3 : 1 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[st.primaryBtnText, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  animated: { flex: 1 },
  step: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 8 : 24,
  },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 16, marginBottom: 8, alignSelf: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  backBtn: { marginTop: 4, marginBottom: 8, alignSelf: 'flex-start', padding: 4 },
  title: { fontSize: 24, fontWeight: '600', fontFamily: fonts.semiBold, marginBottom: 6, marginTop: 16 },
  sub: { fontSize: 14, fontFamily: fonts.regular, marginBottom: 28 },
  serviceList: { gap: 12, flex: 1, alignItems: 'center', justifyContent: 'center' },
  serviceCard: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingHorizontal: 16,
    gap: 8,
    borderWidth: 1,
    position: 'relative',
  },
  serviceLabel: { fontSize: 18, fontWeight: '600', fontFamily: fonts.semiBold, letterSpacing: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 12,
    top: 12,
  },
  vehicleRow: { gap: 12, flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  vehicleCard: {
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  vehicleLabel: { fontSize: 18, fontFamily: fonts.semiBold, fontWeight: '600', letterSpacing: 2 },
  primaryBtn: {
    height: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.semiBold },
})
