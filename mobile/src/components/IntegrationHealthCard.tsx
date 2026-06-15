import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AppState, Platform, StyleSheet, Switch, Text, TouchableOpacity, View, NativeModules } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useColors } from '../theme/theme'
import { fonts } from '../theme/typography'
import { useDriverIngestStore } from '../store/driverIngestStore'
import { devWarn } from '../utils/devLog'
import { openAccessibilitySettings } from '../services/accessibilityDisclosure'

type ServiceStatuses = {
  notificationListenerEnabled: boolean
  accessibilityServiceEnabled: boolean
  ignoringBatteryOptimizations: boolean
}

type DiagnosticEvent = {
  title?: string
  text?: string
  timestamp?: number
  packageName?: string
}

type DriveMindNativeType = {
  getServiceStatuses: () => Promise<ServiceStatuses>
  getRecentDiagnosticEvents: (limit: number) => Promise<string>
  openNotificationListenerSettings: () => void
  openAccessibilitySettings: () => void
  openBatteryOptimizationSettings: () => void
}

const emptyStatuses: ServiceStatuses = {
  notificationListenerEnabled: false,
  accessibilityServiceEnabled: false,
  ignoringBatteryOptimizations: false,
}

function timeLabel(ts?: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds(),
  ).padStart(2, '0')}`
}

export function IntegrationHealthCard() {
  const { t } = useTranslation()
  const c = useColors()
  const [statuses, setStatuses] = useState<ServiceStatuses>(emptyStatuses)
  const [diagnosticMode, setDiagnosticMode] = useState(false)
  const [diagnosticEvents, setDiagnosticEvents] = useState<DiagnosticEvent[]>([])
  const soundEnabled = useDriverIngestStore((s) => s.soundEnabled)
  const setSoundEnabled = useDriverIngestStore((s) => s.setSoundEnabled)

  const dmNative: DriveMindNativeType | null = useMemo(() => {
    if (Platform.OS !== 'android') return null
    return (NativeModules.DriveMindNative as DriveMindNativeType | undefined) ?? null
  }, [])

  const refresh = useCallback(async () => {
    if (!dmNative) return
    try {
      const next = await dmNative.getServiceStatuses()
      setStatuses(next)
      if (diagnosticMode) {
        const raw = await dmNative.getRecentDiagnosticEvents(5)
        const arr = JSON.parse(raw) as DiagnosticEvent[]
        setDiagnosticEvents(Array.isArray(arr) ? arr.slice().reverse() : [])
      }
    } catch (e) {
      devWarn('[DriveMind] IntegrationHealthCard.refresh', e)
    }
  }, [dmNative, diagnosticMode])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh()
    })
    return () => sub.remove()
  }, [refresh])

  if (!dmNative) return null

  const rows = [
    {
      key: 'notification',
      title: t('integration_notification_access'),
      ok: statuses.notificationListenerEnabled,
      action: () => dmNative.openNotificationListenerSettings(),
    },
    {
      key: 'accessibility',
      title: t('integration_accessibility'),
      ok: statuses.accessibilityServiceEnabled,
      action: () => {
        openAccessibilitySettings()
      },
    },
    {
      key: 'battery',
      title: t('integration_battery'),
      ok: statuses.ignoringBatteryOptimizations,
      action: () => dmNative.openBatteryOptimizationSettings(),
    },
  ] as const

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[styles.title, { color: c.text }]}>{t('integration_health_title')}</Text>

      {rows.map((row, idx) => (
        <View
          key={row.key}
          style={[styles.row, idx !== rows.length - 1 && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}
        >
          <View style={styles.rowLeft}>
            <Feather
              name={row.ok ? 'check-circle' : 'alert-triangle'}
              size={18}
              color={row.ok ? c.success : c.danger}
            />
            <Text style={[styles.rowText, { color: c.text }]}>{row.title}</Text>
          </View>
          <TouchableOpacity
            onPress={row.action}
            style={[styles.fixBtn, { borderColor: row.ok ? c.success : c.primary }]}
            activeOpacity={0.75}
          >
            <Text style={[styles.fixBtnText, { color: row.ok ? c.success : c.primary }]}>
              {row.ok ? t('integration_open') : t('integration_setup')}
            </Text>
          </TouchableOpacity>
        </View>
      ))}

      <View style={[styles.row, { borderBottomWidth: 0 }]}>
        <Text style={[styles.rowText, { color: c.text }]}>{t('integration_sound')}</Text>
        <Switch
          value={soundEnabled}
          onValueChange={(v) => setSoundEnabled(v)}
          trackColor={{ false: c.border, true: c.primaryDim }}
          thumbColor={Platform.OS === 'android' ? (soundEnabled ? c.primary : c.surfaceAlt) : undefined}
        />
      </View>

      <View style={[styles.row, { borderTopColor: c.separator, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0 }]}>
        <Text style={[styles.rowText, { color: c.text }]}>{t('integration_diagnostic_mode')}</Text>
        <Switch
          value={diagnosticMode}
          onValueChange={(v) => setDiagnosticMode(v)}
          trackColor={{ false: c.border, true: c.primaryDim }}
          thumbColor={Platform.OS === 'android' ? (diagnosticMode ? c.primary : c.surfaceAlt) : undefined}
        />
      </View>

      {diagnosticMode && (
        <View style={styles.diagList}>
          {diagnosticEvents.length === 0 ? (
            <Text style={[styles.diagLine, { color: c.textMuted }]}>{t('integration_no_events')}</Text>
          ) : (
            diagnosticEvents.map((e, i) => (
              <Text key={`${e.timestamp ?? 0}-${i}`} style={[styles.diagLine, { color: c.textSecondary }]}>
                {timeLabel(e.timestamp)} · {(e.packageName ?? '').replace('com.', '')} · {e.title ?? '—'} · {e.text ?? '—'}
              </Text>
            ))
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  rowText: {
    fontSize: 14,
    fontFamily: fonts.regular,
  },
  fixBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fixBtnText: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
  },
  diagList: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 6,
  },
  diagLine: {
    fontSize: 11,
    fontFamily: fonts.regular,
  },
})
