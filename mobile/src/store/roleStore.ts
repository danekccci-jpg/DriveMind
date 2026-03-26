import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

type Role = 'courier' | 'taxi'
type VehicleType = 'bike' | 'moped' | 'car'

interface RoleState {
  role: Role | null
  vehicleType: VehicleType
  fuelConsumption: number
  onboardingComplete: boolean
  selectedServices: string[]
  setRole: (role: Role) => void
  setVehicleType: (vehicleType: VehicleType) => void
  setFuelConsumption: (fuelConsumption: number) => void
  setOnboardingComplete: (complete: boolean) => void
  setSelectedServices: (services: string[]) => void
}

const storage =
  Platform.OS === 'web'
    ? createJSONStorage(() => localStorage)
    : createJSONStorage(() => AsyncStorage)

export const useRoleStore = create<RoleState>()(
  persist(
    (set) => ({
      role: null,
      vehicleType: 'bike',
      fuelConsumption: 8.0,
      onboardingComplete: false,
      selectedServices: [],
      setRole: (role) => set({ role }),
      setVehicleType: (vehicleType) => set({ vehicleType }),
      setFuelConsumption: (fuelConsumption) => set({ fuelConsumption }),
      setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
      setSelectedServices: (selectedServices) => set({ selectedServices }),
    }),
    {
      name: 'drivemind-role',
      storage,
    },
  ),
)
