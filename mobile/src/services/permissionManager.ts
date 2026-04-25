import { Alert, NativeModules, Platform } from 'react-native'
import { PERMISSIONS, request, requestNotifications } from 'react-native-permissions'
import i18n from '../i18n'

type ServiceStatuses = {
  notificationListenerEnabled: boolean
  accessibilityServiceEnabled: boolean
  ignoringBatteryOptimizations: boolean
}

type DriveMindNativeType = {
  isOverlayPermissionGranted: () => Promise<boolean>
  openOverlaySettings?: () => void
  requestOverlayPermission?: () => void
  openAccessibilitySettings?: () => void
  getServiceStatuses: () => Promise<ServiceStatuses>
  isAccessibilityServiceEnabled?: () => Promise<boolean>
}

function getNative(): DriveMindNativeType | null {
  if (Platform.OS !== 'android') return null
  return (NativeModules.DriveMindNative as DriveMindNativeType | undefined) ?? null
}

async function isAccessibilityServiceEnabled(native: DriveMindNativeType): Promise<boolean> {
  if (typeof native.isAccessibilityServiceEnabled === 'function') {
    return native.isAccessibilityServiceEnabled()
  }
  const statuses = await native.getServiceStatuses()
  return statuses.accessibilityServiceEnabled
}

async function requestSystemPermissions(): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    if (Platform.OS === 'ios') {
      await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE)
      await requestNotifications(['alert', 'badge', 'sound'])
    } else if (Platform.OS === 'android') {
      await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION)
      await requestNotifications()
    }
  } catch (e) {
    console.warn('[DriveMind] requestSystemPermissions', e)
  }
}

/**
 * After the map is ready: request runtime permissions, then verify Android overlay + accessibility.
 */
export async function requestAllPermissions(): Promise<void> {
  await requestSystemPermissions()

  const native = getNative()
  if (!native) return

  try {
    // Overlay permission is mandatory for the contextual interactive widget.
    const overlayOk = await native.isOverlayPermissionGranted()
    if (!overlayOk) {
      Alert.alert(i18n.t('perm_alert_title'), i18n.t('perm_alert_msg'), [
        { text: i18n.t('no'), style: 'cancel' },
        {
          text: i18n.t('yes'),
          onPress: () => {
            if (typeof native.openOverlaySettings === 'function') {
              native.openOverlaySettings()
            } else {
              native.requestOverlayPermission?.()
            }
          },
        },
      ])
      return
    }

    const a11yOk = await isAccessibilityServiceEnabled(native)
    if (a11yOk) return

    Alert.alert(i18n.t('perm_alert_title'), i18n.t('perm_alert_msg'), [
      { text: i18n.t('no'), style: 'cancel' },
      {
        text: i18n.t('yes'),
        onPress: () => {
          if (typeof native.openAccessibilitySettings === 'function') {
            native.openAccessibilitySettings()
          } else if (typeof native.openOverlaySettings === 'function') {
            native.openOverlaySettings()
          } else {
            native.requestOverlayPermission?.()
          }
        },
      },
    ])
  } catch (e) {
    console.warn('[DriveMind] requestAllPermissions special checks', e)
  }
}
