import React, { useEffect, useRef } from 'react'
import { Animated, Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDriverIngestStore } from '../store/driverIngestStore'
import { useColors } from '../theme/theme'
import { fonts } from '../theme/typography'

/** Brief 2s overlay when scrape succeeds (message from store). Android only pipeline. */
export function DriverIngestToast() {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const message = useDriverIngestStore((s) => s.lastToastMessage)
  const clearToast = useDriverIngestStore((s) => s.clearToast)
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!message || Platform.OS !== 'android') return
    opacity.setValue(0)
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => clearToast())
  }, [message, opacity, clearToast])

  if (!message || Platform.OS !== 'android') return null

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { paddingTop: insets.top + 8, opacity },
      ]}
    >
      <View style={[styles.pill, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.txt, { color: c.text }]} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 20,
  },
  pill: {
    maxWidth: '90%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  txt: {
    fontSize: 14,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
})
