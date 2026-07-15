import React, { useEffect, useRef } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  type ActivityIndicatorProps,
  type ColorValue,
  type ViewStyle,
} from 'react-native'

type SpinnerSize = ActivityIndicatorProps['size']

type LoadingSpinnerProps = Omit<ActivityIndicatorProps, 'size'> & {
  size?: SpinnerSize
  style?: ViewStyle
}

/**
 * Drop-in ActivityIndicator replacement. On Android, RN's ActivityIndicator routes
 * through ProgressBarAndroid → AndroidProgressBar, which is not registered in
 * New Architecture / bridgeless release builds and crashes on first render.
 */
export function LoadingSpinner({
  animating = true,
  color,
  size = 'small',
  style,
  ...rest
}: LoadingSpinnerProps) {
  if (Platform.OS !== 'android') {
    return (
      <ActivityIndicator
        animating={animating}
        color={color}
        size={size}
        style={style}
        {...rest}
      />
    )
  }

  if (!animating) {
    return null
  }

  return (
    <AndroidSpinner color={color ?? null} size={size} style={style} />
  )
}

function AndroidSpinner({
  color,
  size,
  style,
}: {
  color: ColorValue | null | undefined
  size: SpinnerSize
  style?: ViewStyle
}) {
  const spin = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [spin])

  const dim = typeof size === 'number' ? size : size === 'large' ? 36 : 20
  const borderWidth = typeof size === 'number' ? Math.max(2, Math.round(size / 10)) : size === 'large' ? 3 : 2
  const tint = color ?? '#999999'
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <Animated.View
      style={[
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          borderWidth,
          borderColor: tint,
          borderTopColor: 'transparent',
          transform: [{ rotate }],
        },
        style,
      ]}
    />
  )
}

export default LoadingSpinner
