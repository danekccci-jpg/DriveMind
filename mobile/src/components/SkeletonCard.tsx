import React, { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet, ViewStyle } from 'react-native'

function Block({
  width,
  height,
  opacity,
  style,
}: {
  width: number | `${number}%`
  height: number
  opacity: Animated.Value
  style?: ViewStyle
}) {
  return (
    <Animated.View
      style={[
        styles.block,
        { width: width as any, height, opacity },
        style,
      ]}
    />
  )
}

export default function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    ).start()
  }, [opacity])

  return (
    <View style={styles.card}>
      {/* Header row: icon + title + price */}
      <View style={styles.row}>
        <Block width={40} height={40} opacity={opacity} style={styles.iconBlock} />
        <View style={styles.headerText}>
          <Block width={80} height={14} opacity={opacity} />
          <Block width={60} height={20} opacity={opacity} style={{ marginTop: 6 }} />
        </View>
      </View>

      {/* Address lines */}
      <Block width="100%" height={12} opacity={opacity} style={{ marginTop: 14 }} />
      <Block width="75%" height={12} opacity={opacity} style={{ marginTop: 8 }} />

      {/* Pill row */}
      <View style={styles.pillRow}>
        <Block width={80} height={28} opacity={opacity} style={styles.pill} />
        <Block width={80} height={28} opacity={opacity} style={styles.pill} />
        <Block width={80} height={28} opacity={opacity} style={styles.pill} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  block: {
    backgroundColor: '#222222',
    borderRadius: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBlock: {
    borderRadius: 40 * 0.22,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
    gap: 0,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  pill: {
    borderRadius: 14,
  },
})
