import React from 'react'
import {
  TouchableOpacity,
  TouchableOpacityProps,
  StyleProp,
  ViewStyle,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import HapticFeedback from 'react-native-haptic-feedback'

type Props = TouchableOpacityProps & {
  style?: StyleProp<ViewStyle>
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity)

export default function AnimatedButton({
  children,
  style,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: Props) {
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <AnimatedTouchable
      {...rest}
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        scale.value = withSpring(0.95, { damping: 16, stiffness: 280 })
        onPressIn?.(e)
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 240 })
        onPressOut?.(e)
      }}
      onPress={(e) => {
        HapticFeedback.trigger('impactLight', {
          enableVibrateFallback: true,
          ignoreAndroidSystemSettings: false,
        })
        onPress?.(e)
      }}
    >
      {children}
    </AnimatedTouchable>
  )
}
