/**
 * react-native-svg and react-native-maps ship class-component types that are
 * incompatible with the stricter JSX checks in React 19 + TypeScript 5.
 * These module overrides re-declare the components we use as FC-compatible so
 * the compiler is satisfied without breaking runtime behaviour.
 */

import React from 'react'

// ── react-native-svg ──────────────────────────────────────────────────────────
declare module 'react-native-svg' {
  import { ViewProps } from 'react-native'

  interface CommonProps {
    fill?: string
    stroke?: string
    strokeWidth?: number | string
    strokeLinecap?: 'butt' | 'round' | 'square'
    strokeLinejoin?: 'miter' | 'round' | 'bevel'
    opacity?: number | string
    x?: number | string
    y?: number | string
    style?: ViewProps['style']
  }

  interface SvgProps extends CommonProps {
    width?: number | string
    height?: number | string
    viewBox?: string
    children?: React.ReactNode
    style?: ViewProps['style']
  }
  const Svg: React.FC<SvgProps>

  interface CircleProps extends CommonProps {
    cx?: number | string
    cy?: number | string
    r?: number | string
  }
  const Circle: React.FC<CircleProps>

  interface RectProps extends CommonProps {
    x?: number | string
    y?: number | string
    width?: number | string
    height?: number | string
    rx?: number | string
    ry?: number | string
  }
  const Rect: React.FC<RectProps>

  interface LineProps extends CommonProps {
    x1?: number | string
    y1?: number | string
    x2?: number | string
    y2?: number | string
  }
  const Line: React.FC<LineProps>

  interface PathProps extends CommonProps {
    d?: string
  }
  const Path: React.FC<PathProps>

  interface TextProps extends CommonProps {
    fontSize?: number | string
    fontWeight?: number | string
    fontFamily?: string
    textAnchor?: 'start' | 'middle' | 'end'
    children?: React.ReactNode
  }
  const Text: React.FC<TextProps>

  export { Svg, Circle, Rect, Line, Path, Text }
  export default Svg
}

// ── react-native-maps ─────────────────────────────────────────────────────────
declare module 'react-native-maps' {
  import { ViewStyle, StyleProp } from 'react-native'

  export interface Region {
    latitude: number
    longitude: number
    latitudeDelta: number
    longitudeDelta: number
  }

  export interface MapViewProps {
    style?: StyleProp<ViewStyle>
    provider?: 'google' | null
    customMapStyle?: object[]
    showsUserLocation?: boolean
    showsMyLocationButton?: boolean
    initialRegion?: Region
    region?: Region
    children?: React.ReactNode
    [key: string]: any
  }
  const MapView: React.FC<MapViewProps>

  export interface LatLng {
    latitude: number
    longitude: number
  }

  export interface MarkerProps {
    coordinate: LatLng
    pinColor?: string
    title?: string
    description?: string
    children?: React.ReactNode
    [key: string]: any
  }
  const Marker: React.FC<MarkerProps>

  export interface PolylineProps {
    coordinates: LatLng[]
    strokeColor?: string
    strokeWidth?: number
    [key: string]: any
  }
  const Polyline: React.FC<PolylineProps>

  export const PROVIDER_GOOGLE: 'google'

  export { Marker, Polyline }
  export default MapView
}
