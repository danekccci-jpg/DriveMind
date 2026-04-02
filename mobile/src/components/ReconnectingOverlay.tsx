import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Platform } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSocketConnectionStore } from '../store/socketConnectionStore'
import { fonts } from '../theme/typography'
import { useTheme } from '../theme/theme'

const BAD_SOCKET = new Set(['disconnected', 'reconnecting'])

/**
 * Full-width banner after 5s of no socket connection or no network reachability.
 */
export function ReconnectingOverlay() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const socketStatus = useSocketConnectionStore((s) => s.status)

  const [netBad, setNetBad] = useState(false)

  useEffect(() => {
    if (Platform.OS === 'web') {
      setNetBad(false)
      return
    }
    let cancelled = false
    NetInfo.fetch().then((state) => {
      if (cancelled) return
      setNetBad(state.isConnected === false || state.isInternetReachable === false)
    })
    const unsub = NetInfo.addEventListener((state) => {
      setNetBad(state.isConnected === false || state.isInternetReachable === false)
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  const socketBad = BAD_SOCKET.has(socketStatus)
  const bad = socketBad || netBad

  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!bad) {
      setShow(false)
      return
    }
    const tmr = setTimeout(() => setShow(true), 5000)
    return () => clearTimeout(tmr)
  }, [bad])

  if (!show) return null

  return (
    <View pointerEvents="none" style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={[styles.pill, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.pulse} />
        <Text style={[styles.txt, { color: c.text }]}>{t('reconnecting_overlay')}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 360,
  },
  pulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
  },
  txt: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    flex: 1,
  },
})
