import React, { useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useColors } from '../../theme/theme'
import { fonts } from '../../theme/typography'

const CARD_GAP = 14
const H_PAD = 28
const SCREEN_W = Dimensions.get('window').width
const TILE_W = SCREEN_W - H_PAD * 2
const TILE_H = 170

type Role = 'courier' | 'taxi'

interface Props {
  onSelect: (role: Role) => void
}

export default function RoleSelectionScreen({ onSelect }: Props) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const scaleA = useRef(new Animated.Value(1)).current
  const scaleB = useRef(new Animated.Value(1)).current

  const handlePress = (role: Role, scale: Animated.Value) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start(() => onSelect(role))
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 24, backgroundColor: c.bg }]}>
      <View style={s.header}>
        <Text style={[s.brand, { color: c.text }]}>DRIVEMIND</Text>
        <View style={[s.divider, { backgroundColor: c.primary }]} />
        <Text style={[s.subtitle, { color: c.secondary }]}>SELECT YOUR MODE</Text>
      </View>

      <View style={s.cards}>
        <Animated.View style={{ width: '100%', alignItems: 'center', transform: [{ scale: scaleA }] }}>
          <TouchableOpacity
            activeOpacity={1}
            style={[s.card, { width: TILE_W, height: TILE_H, backgroundColor: c.surface, borderColor: c.border }]}
            onPress={() => handlePress('courier', scaleA)}
          >
            <View style={[s.iconRing, { borderColor: c.primaryDim, backgroundColor: c.primaryDim }]}>
              <MaterialCommunityIcons name="bike" size={36} color={c.primary} />
            </View>
            <Text style={[s.cardTitle, { color: c.text }]}>COURIER</Text>
            <Text style={[s.cardDesc, { color: c.secondary }]}>Delivery & logistics</Text>
            <View style={[s.cardLine, { backgroundColor: c.primaryDim }]} />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ width: '100%', alignItems: 'center', transform: [{ scale: scaleB }] }}>
          <TouchableOpacity
            activeOpacity={1}
            style={[s.card, { width: TILE_W, height: TILE_H, backgroundColor: c.surface, borderColor: c.border }]}
            onPress={() => handlePress('taxi', scaleB)}
          >
            <View style={[s.iconRing, { borderColor: c.primaryDim, backgroundColor: c.primaryDim }]}>
              <MaterialCommunityIcons name="car-outline" size={36} color={c.primary} />
            </View>
            <Text style={[s.cardTitle, { color: c.text }]}>TAXI</Text>
            <Text style={[s.cardDesc, { color: c.secondary }]}>Rideshare & transport</Text>
            <View style={[s.cardLine, { backgroundColor: c.primaryDim }]} />
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Text style={[s.footer, { color: c.textMuted }]}>Tap to begin</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: H_PAD },
  header: { alignItems: 'center', marginBottom: 28 },
  brand: { fontSize: 14, fontFamily: fonts.semiBold, fontWeight: '600', letterSpacing: 8 },
  divider: { width: 32, height: 1, marginVertical: 12 },
  subtitle: { fontSize: 11, fontFamily: fonts.medium, letterSpacing: 4 },
  cards: { flex: 1, gap: CARD_GAP, alignItems: 'center', justifyContent: 'center' },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  cardTitle: { fontSize: 22, fontFamily: fonts.bold, fontWeight: '700', letterSpacing: 8 },
  cardDesc: { fontSize: 12, fontFamily: fonts.regular, letterSpacing: 2 },
  cardLine: { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 1 },
  footer: { textAlign: 'center', fontSize: 12, fontFamily: fonts.regular, letterSpacing: 3, paddingVertical: 20 },
})
