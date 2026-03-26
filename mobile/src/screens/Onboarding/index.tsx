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
  ScrollView,
  Platform,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRoleStore } from '../../store/roleStore'
import PlatformIcon from '../../components/PlatformIcon'
import { fonts } from '../../theme/typography'

const { width: SCREEN_W } = Dimensions.get('window')

type Role = 'courier' | 'taxi'
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

const VEHICLE_OPTIONS: { id: VehicleType; emoji: string; label: string }[] = [
  { id: 'bike', emoji: '🚲', label: 'bike' },
  { id: 'moped', emoji: '🛵', label: 'moped' },
  { id: 'car', emoji: '🚗', label: 'car' },
]

// ── Progress dots ─────────────────────────────────────────────────────────────
function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i === current ? styles.dotActive : styles.dotInactive]}
        />
      ))}
    </View>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  onComplete?: () => void
}

export default function OnboardingScreen({ onComplete }: Props) {
  const { t } = useTranslation()
  const { setRole, setVehicleType, setSelectedServices, setOnboardingComplete } = useRoleStore()

  const [step, setStep] = useState(0)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [selectedServices, setSelectedServicesLocal] = useState<PlatformId[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>('bike')

  const translateX = useRef(new Animated.Value(0)).current

  const totalSteps = selectedRole === 'taxi' ? 3 : 4

  const animateTo = useCallback(
    (nextStep: number, direction: 1 | -1) => {
      const offset = direction * SCREEN_W
      translateX.setValue(offset)
      setStep(nextStep)
      Animated.timing(translateX, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    },
    [translateX],
  )

  const goNext = useCallback(() => {
    const isTaxi = selectedRole === 'taxi'
    // Courier: steps 0→1→2→3, Taxi: steps 0→1→2
    if (step === 2 && isTaxi) {
      handleFinish()
      return
    }
    animateTo(step + 1, 1)
  }, [step, selectedRole, animateTo])

  const goBack = useCallback(() => {
    animateTo(step - 1, -1)
  }, [step, animateTo])

  const toggleService = useCallback((id: PlatformId) => {
    setSelectedServicesLocal((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }, [])

  const handleFinish = useCallback(() => {
    if (!selectedRole) return
    setRole(selectedRole)
    setVehicleType(selectedVehicle)
    setSelectedServices(selectedServices)
    setOnboardingComplete(true)
    onComplete?.()
  }, [selectedRole, selectedVehicle, selectedServices])

  const platforms = selectedRole === 'taxi' ? TAXI_PLATFORMS : COURIER_PLATFORMS

  // ── Step 1: Welcome ──────────────────────────────────────────────────────
  const renderWelcome = () => (
    <View style={styles.stepContainer}>
      <View style={styles.welcomeCenter}>
        <Text style={styles.welcomeTitle}>DriveMind</Text>
        <View style={styles.welcomeDivider} />
        <Text style={styles.welcomeSubtitle}>{t('welcome_subtitle')}</Text>
      </View>
      <PrimaryButton label={t('continue')} onPress={goNext} />
    </View>
  )

  // ── Step 2: Choose Role ──────────────────────────────────────────────────
  const renderChooseRole = () => (
    <View style={styles.stepContainer}>
      <ProgressDots total={totalSteps} current={1} />
      <BackButton onPress={goBack} />
      <Text style={styles.stepTitle}>{t('choose_role')}</Text>
      <Text style={styles.stepSubtitle}>{t('choose_role_subtitle')}</Text>

      <View style={styles.roleCards}>
        {(['courier', 'taxi'] as Role[]).map((r) => {
          const selected = selectedRole === r
          return (
            <TouchableOpacity
              key={r}
              activeOpacity={0.7}
              style={[styles.roleCard, selected ? styles.cardSelected : styles.cardUnselected]}
              onPress={() => setSelectedRole(r)}
            >
              <Text style={styles.roleEmoji}>{r === 'courier' ? '🚲' : '🚗'}</Text>
              <View style={styles.roleTextBlock}>
                <Text style={styles.roleLabel}>{t(r)}</Text>
                <Text style={styles.roleSubtitle}>
                  {r === 'courier' ? t('courier_subtitle') : t('taxi_subtitle')}
                </Text>
              </View>
              {selected && <View style={styles.checkDot} />}
            </TouchableOpacity>
          )
        })}
      </View>

      <PrimaryButton
        label={t('next')}
        onPress={goNext}
        disabled={!selectedRole}
      />
    </View>
  )

  // ── Step 3: Choose Services ──────────────────────────────────────────────
  const renderChooseServices = () => (
    <View style={styles.stepContainer}>
      <ProgressDots total={totalSteps} current={2} />
      <BackButton onPress={goBack} />
      <Text style={styles.stepTitle}>{t('choose_services')}</Text>
      <Text style={styles.stepSubtitle}>{t('choose_services_subtitle')}</Text>

      <View style={styles.serviceList}>
        {platforms.map((id) => {
          const selected = selectedServices.includes(id)
          return (
            <TouchableOpacity
              key={id}
              activeOpacity={0.7}
              style={[
                styles.serviceCard,
                selected ? styles.cardSelected : styles.cardUnselected,
              ]}
              onPress={() => toggleService(id)}
            >
              <PlatformIcon platform={id} size={44} />
              <Text style={styles.serviceLabel}>{PLATFORM_LABELS[id]}</Text>
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <PrimaryButton
        label={selectedRole === 'taxi' ? t('get_started') : t('next')}
        onPress={goNext}
        disabled={selectedServices.length === 0}
      />
    </View>
  )

  // ── Step 4: Transport (courier only) ─────────────────────────────────────
  const renderChooseTransport = () => (
    <View style={styles.stepContainer}>
      <ProgressDots total={totalSteps} current={3} />
      <BackButton onPress={goBack} />
      <Text style={styles.stepTitle}>{t('choose_transport')}</Text>
      <Text style={styles.stepSubtitle}>{t('choose_transport_subtitle')}</Text>

      <View style={styles.vehicleRow}>
        {VEHICLE_OPTIONS.map(({ id, emoji, label }) => {
          const selected = selectedVehicle === id
          return (
            <TouchableOpacity
              key={id}
              activeOpacity={0.7}
              style={[
                styles.vehicleCard,
                selected ? styles.cardSelected : styles.cardUnselected,
              ]}
              onPress={() => setSelectedVehicle(id)}
            >
              <Text style={styles.vehicleEmoji}>{emoji}</Text>
              <Text style={styles.vehicleLabel}>{t(label)}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <PrimaryButton label={t('get_started')} onPress={handleFinish} />
    </View>
  )

  const steps = [renderWelcome, renderChooseRole, renderChooseServices, renderChooseTransport]

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View style={[styles.animated, { transform: [{ translateX }] }]}>
        {steps[step]?.()}
      </Animated.View>
    </SafeAreaView>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.primaryBtn, disabled && styles.primaryBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  )
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.backBtn} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.backBtnText}>←</Text>
    </TouchableOpacity>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000000',
  },
  animated: {
    flex: 1,
  },

  // Step layout
  stepContainer: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 8 : 24,
  },

  // Progress dots
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 16,
    marginBottom: 8,
    alignSelf: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
  },
  dotInactive: {
    backgroundColor: '#333333',
  },

  // Back button
  backBtn: {
    marginTop: 4,
    marginBottom: 8,
    alignSelf: 'flex-start',
    padding: 4,
  },
  backBtnText: {
    fontSize: 22,
    color: '#FFFFFF',
  },

  // Step title / subtitle
  stepTitle: {
    fontSize: 24,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: '#FFFFFF',
    marginBottom: 6,
    marginTop: 16,
  },
  stepSubtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: '#888888',
    marginBottom: 28,
  },

  // Welcome step
  welcomeCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: {
    fontSize: 36,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  welcomeDivider: {
    width: 40,
    height: 2,
    backgroundColor: '#FFFFFF',
    marginVertical: 12,
  },
  welcomeSubtitle: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: '#888888',
    textAlign: 'center',
    maxWidth: 260,
  },

  // Primary button
  primaryBtn: {
    height: 54,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
  },
  primaryBtnDisabled: {
    opacity: 0.3,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: '#000000',
  },

  // Role cards
  roleCards: {
    gap: 12,
    flex: 1,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 90,
    borderRadius: 14,
    paddingHorizontal: 20,
    gap: 16,
  },
  cardSelected: {
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardUnselected: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: '#111111',
  },
  roleEmoji: {
    fontSize: 32,
  },
  roleTextBlock: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 17,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: '#FFFFFF',
  },
  roleSubtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: '#888888',
    marginTop: 2,
  },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },

  // Service cards
  serviceList: {
    gap: 10,
    flex: 1,
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    borderRadius: 12,
    paddingHorizontal: 16,
    gap: 14,
  },
  serviceLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    fontFamily: fonts.medium,
    color: '#FFFFFF',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#444444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  checkmark: {
    fontSize: 13,
    color: '#000000',
    fontWeight: '700',
  },

  // Vehicle cards
  vehicleRow: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
    alignItems: 'flex-start',
    marginTop: 8,
  },
  vehicleCard: {
    width: 100,
    height: 90,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  vehicleEmoji: {
    fontSize: 30,
  },
  vehicleLabel: {
    fontSize: 13,
    fontFamily: fonts.medium,
    fontWeight: '500',
    color: '#FFFFFF',
  },
})
