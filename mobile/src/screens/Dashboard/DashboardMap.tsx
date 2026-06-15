import React, { memo, useMemo } from 'react'
import { StyleSheet, Platform, Animated } from 'react-native'
import MapView, {
  Marker,
  MarkerAnimated,
  PROVIDER_GOOGLE,
} from '../../components/MapViewWeb'
import { NavigationMapLayers } from '../../components/navigation/NavigationMapLayers'
import { PlayerNavMarker } from '../../components/navigation/PlayerNavMarker'
import type { LatLng } from '../../navigation/navigationGeometry'
import type { MarkerStyleId } from '../../store/navigationSettingsStore'
import { MAP_STYLE_DARK_IDLE, MAP_STYLE_LIGHT_IDLE } from '../../map/mapStyles'

type DashboardMapProps = {
  mapRef: React.RefObject<any>
  isDark: boolean
  isMapStyleReady: boolean
  mapStyleForMap: object | undefined
  onMapReady: () => void
  isNavigating: boolean
  showsUserLocation: boolean
  mapBottomPadding: number
  initialRegion: LatLng & { latitudeDelta?: number; longitudeDelta?: number }
  trimmedRoute: LatLng[]
  destCoordNav: LatLng | null
  navigationPhase: 'pickup' | 'dropoff' | null
  destPulse: Animated.Value
  nearDestination: boolean
  animatedCoord: any
  markerStyle: MarkerStyleId
  smoothHeading: number
  userLocation: LatLng | null
}

function DashboardMapInner({
  mapRef,
  isDark,
  isMapStyleReady,
  mapStyleForMap,
  onMapReady,
  isNavigating,
  showsUserLocation,
  mapBottomPadding,
  initialRegion,
  trimmedRoute,
  destCoordNav,
  navigationPhase,
  destPulse,
  nearDestination,
  animatedCoord,
  markerStyle,
  smoothHeading,
  userLocation,
}: DashboardMapProps) {
  // Idle mode: surface poi.business (restaurants/cafes) and poi.attraction
  // (hotels/guest houses) as muted reference markers — useful for pickup/dropoff
  // planning without cluttering the screen. During active navigation the base
  // style (all POIs off) is restored to keep the route overlay readable.
  const navStyle = useMemo(() => mapStyleForMap, [mapStyleForMap])
  const idleStyle = useMemo(
    () => (isDark ? MAP_STYLE_DARK_IDLE : MAP_STYLE_LIGHT_IDLE),
    [isDark],
  )
  const effectiveMapStyle = useMemo(() => {
    if (!isMapStyleReady) return undefined
    return isNavigating ? navStyle : idleStyle
  }, [isMapStyleReady, isNavigating, navStyle, idleStyle])

  return (
    <MapView
      key={isDark ? 'map-dark' : 'map-light'}
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_GOOGLE}
      mapType="standard"
      googleRenderer={Platform.OS === 'android' ? 'LEGACY' : undefined}
      userInterfaceStyle="light"
      customMapStyle={effectiveMapStyle}
      onMapReady={onMapReady}
      showsScale={false}
      showsPointsOfInterests={false}
      showsBuildings={false}
      showsIndoors={false}
      showsTraffic
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={false}
      compassEnabled={false}
      zoomControlEnabled={false}
      toolbarEnabled={false}
      mapToolbarEnabled={false}
      mapPadding={{ top: 0, right: 0, bottom: mapBottomPadding, left: 0 }}
      initialRegion={initialRegion}
    >
      {isNavigating && (
        <NavigationMapLayers
          trimmedPolyline={trimmedRoute}
          destCoord={destCoordNav}
          navigationPhase={navigationPhase}
          destPulse={destPulse}
          nearDestination={nearDestination}
          isDark={isDark}
        />
      )}
      {isNavigating && Platform.OS !== 'web' && (
        <MarkerAnimated coordinate={animatedCoord} anchor={{ x: 0.5, y: 0.5 }} flat>
          <PlayerNavMarker styleId={markerStyle} headingDeg={smoothHeading} />
        </MarkerAnimated>
      )}
      {isNavigating && Platform.OS === 'web' && userLocation && (
        <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }} flat>
          <PlayerNavMarker styleId={markerStyle} headingDeg={smoothHeading} />
        </Marker>
      )}
    </MapView>
  )
}

export const DashboardMap = memo(DashboardMapInner)
