import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

export type MarkerStyleId = 'classic' | 'arrow3d' | 'car'
export type MapAppearance = 'auto' | 'light' | 'dark'
export type Units = 'metric' | 'imperial'
export type DirectionsMode = 'driving' | 'bicycling'

const storage =
  Platform.OS === 'web'
    ? createJSONStorage(() => localStorage)
    : createJSONStorage(() => AsyncStorage)

export interface NavigationSettingsState {
  /** Google Directions `mode` — default driving to avoid bicycle walking instructions in HUD */
  directionsMode: DirectionsMode
  markerStyle: MarkerStyleId
  /** Map tiles: auto follows app theme, or force light/dark */
  mapAppearance: MapAppearance
  units: Units
  avoidTolls: boolean
  trafficAware: boolean
  navMuted: boolean
  /** 3D tilt when navigating (pitch) vs 2D top-down */
  mapPerspective3d: boolean
  setDirectionsMode: (m: DirectionsMode) => void
  setMarkerStyle: (m: MarkerStyleId) => void
  setMapAppearance: (m: MapAppearance) => void
  setUnits: (u: Units) => void
  setAvoidTolls: (v: boolean) => void
  setTrafficAware: (v: boolean) => void
  setNavMuted: (v: boolean) => void
  setMapPerspective3d: (v: boolean) => void
}

export const useNavigationSettingsStore = create<NavigationSettingsState>()(
  persist(
    (set) => ({
      directionsMode: 'driving',
      markerStyle: 'classic',
      mapAppearance: 'auto',
      units: 'metric',
      avoidTolls: false,
      trafficAware: true,
      navMuted: false,
      mapPerspective3d: true,
      setDirectionsMode: (directionsMode) => set({ directionsMode }),
      setMarkerStyle: (markerStyle) => set({ markerStyle }),
      setMapAppearance: (mapAppearance) => set({ mapAppearance }),
      setUnits: (units) => set({ units }),
      setAvoidTolls: (avoidTolls) => set({ avoidTolls }),
      setTrafficAware: (trafficAware) => set({ trafficAware }),
      setNavMuted: (navMuted) => set({ navMuted }),
      setMapPerspective3d: (mapPerspective3d) => set({ mapPerspective3d }),
    }),
    {
      name: 'drivemind-navigation-settings',
      storage,
    },
  ),
)
