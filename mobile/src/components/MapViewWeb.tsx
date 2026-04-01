import React from 'react'
import { Platform, View, Text, StyleSheet } from 'react-native'

let MapViewComponent: React.ComponentType<any>
let MarkerComponent: React.ComponentType<any>
let PolylineComponent: React.ComponentType<any>
let MarkerAnimatedComponent: React.ComponentType<any>
let AnimatedRegionClass: any
let PROVIDER_GOOGLE_VALUE: any

if (Platform.OS === 'web') {
  MapViewComponent = ({ style, children }: any) => (
    <View style={[webStyles.container, style]}>
      <Text style={webStyles.label}>Map not available on web</Text>
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
  const RNMaps = require('react-native-maps')
  MapViewComponent = RNMaps.default
  MarkerComponent = RNMaps.Marker
  PolylineComponent = RNMaps.Polyline
  MarkerAnimatedComponent = RNMaps.MarkerAnimated ?? RNMaps.Marker
  AnimatedRegionClass = RNMaps.AnimatedRegion
  PROVIDER_GOOGLE_VALUE = RNMaps.PROVIDER_GOOGLE
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
