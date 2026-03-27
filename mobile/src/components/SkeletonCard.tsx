import React, { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet, ViewStyle } from 'react-native'
import { useColors } from '../theme/theme'

function Block({ width, height, opacity, color, style }: {
  width: number | `${number}%`; height: number; opacity: Animated.Value; color: string; style?: ViewStyle
}) {
  return (
    <Animated.View style={[styles.block, { width: width as any, height, opacity, backgroundColor: color }, style]} />
  )
}

export default function SkeletonCard() {
  const c = useColors()
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 750, useNativeDriver: true }),
      ]),
    ).start()
  }, [opacity])

  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <View style={styles.row}>
        <Block width={40} height={40} opacity={opacity} color={c.shimmer} style={styles.iconBlock} />
        <View style={styles.headerText}>
          <Block width={80} height={14} opacity={opacity} color={c.shimmer} />
          <Block width={60} height={20} opacity={opacity} color={c.shimmer} style={{ marginTop: 6 }} />
        </View>
      </View>
      <Block width="100%" height={12} opacity={opacity} color={c.shimmer} style={{ marginTop: 14 }} />
      <Block width="75%" height={12} opacity={opacity} color={c.shimmer} style={{ marginTop: 8 }} />
      <View style={styles.pillRow}>
        <Block width={80} height={28} opacity={opacity} color={c.shimmer} style={styles.pill} />
        <Block width={80} height={28} opacity={opacity} color={c.shimmer} style={styles.pill} />
        <Block width={80} height={28} opacity={opacity} color={c.shimmer} style={styles.pill} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, marginBottom: 12 },
  block: { borderRadius: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconBlock: { borderRadius: 40 * 0.22, marginRight: 12 },
  headerText: { flex: 1 },
  pillRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  pill: { borderRadius: 14 },
})
