import React from 'react'
import { Platform, View, Text, StyleSheet } from 'react-native'
import i18n from '../i18n'

let MapViewComponent: React.ComponentType<any>
let MarkerComponent: React.ComponentType<any>
let PolylineComponent: React.ComponentType<any>
let MarkerAnimatedComponent: React.ComponentType<any>
let AnimatedRegionClass: any
let PROVIDER_GOOGLE_VALUE: any

const NUCLEAR_DISABLE_NATIVE_MAPS = false

if (Platform.OS === 'web' || NUCLEAR_DISABLE_NATIVE_MAPS) {
  MapViewComponent = ({ style, children }: any) => (
    <View style={[webStyles.container, style]}>
      <Text style={webStyles.label}>{i18n.t('map_web_unavailable')}</Text>
      {children}
    </View>
  )
  MarkerComponent = () => null
  PolylineComponent = () => null
  MarkerAnimatedComponent = () => null
  AnimatedRegionClass = class WebAnimatedRegion {
    constructor(_: any) {}
    timing(_: any) {
      return { start: (_cb?: () => void) => {} }
    }
  }
  PROVIDER_GOOGLE_VALUE = 'google'
} else {
  // Native: use Google Maps on Android/iOS when MapView gets provider={PROVIDER_GOOGLE}.
  // Android needs Maps SDK + API key (Expo android.config.googleMaps / prebuild); iOS uses ios.config.googleMapsApiKey.
  try {
    const RNMaps = require('react-native-maps')
    MapViewComponent = RNMaps.default
    MarkerComponent = RNMaps.Marker
    PolylineComponent = RNMaps.Polyline
    MarkerAnimatedComponent = RNMaps.MarkerAnimated ?? RNMaps.Marker
    AnimatedRegionClass = RNMaps.AnimatedRegion
    PROVIDER_GOOGLE_VALUE = RNMaps.PROVIDER_GOOGLE
  } catch {
    // Fallback stub (same as web branch) if native maps module is unavailable.
    MapViewComponent = ({ style, children }: any) => (
      <View style={[webStyles.container, style]}>
        <Text style={webStyles.label}>{i18n.t('map_web_disabled')}</Text>
        {children}
      </View>
    )
    MarkerComponent = () => null
    PolylineComponent = () => null
    MarkerAnimatedComponent = () => null
    AnimatedRegionClass = class WebAnimatedRegion {
      constructor(_: any) {}
      timing(_: any) {
        return { start: (_cb?: () => void) => {} }
      }
    }
    PROVIDER_GOOGLE_VALUE = 'google'
  }
}

const webStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
  },
  label: {
    color: '#888888',
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
})

export default MapViewComponent
export {
  MarkerComponent as Marker,
  PolylineComponent as Polyline,
  MarkerAnimatedComponent as MarkerAnimated,
  AnimatedRegionClass as AnimatedRegion,
  PROVIDER_GOOGLE_VALUE as PROVIDER_GOOGLE,
}
