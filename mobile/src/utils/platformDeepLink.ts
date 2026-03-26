import { Linking, Platform } from 'react-native'

type KnownPlatform = 'glovo' | 'uber' | 'bolt' | 'wolt'

const DEEP_LINKS: Record<KnownPlatform, string> = {
  glovo: 'glovo://',
  uber: 'uber://',
  bolt: 'bolt://',
  wolt: 'wolt://',
}

const PLAY_STORE_FALLBACKS: Record<KnownPlatform, string> = {
  glovo: 'https://play.google.com/store/apps/details?id=com.glovo',
  uber: 'https://play.google.com/store/apps/details?id=com.ubercab',
  bolt: 'https://play.google.com/store/apps/details?id=ee.mtakso.client',
  wolt: 'https://play.google.com/store/apps/details?id=com.wolt.android',
}

const APP_STORE_FALLBACKS: Record<KnownPlatform, string> = {
  glovo: 'https://apps.apple.com/app/glovo/id951812684',
  uber: 'https://apps.apple.com/app/uber/id368677368',
  bolt: 'https://apps.apple.com/app/bolt-request-a-ride/id675033630',
  wolt: 'https://apps.apple.com/app/wolt-delivery/id943905271',
}

function getFallbackUrl(platform: KnownPlatform): string {
  return Platform.OS === 'ios'
    ? APP_STORE_FALLBACKS[platform]
    : PLAY_STORE_FALLBACKS[platform]
}

export async function openPlatformDeepLink(platform: string): Promise<void> {
  const key = platform.toLowerCase() as KnownPlatform
  const deepLink = DEEP_LINKS[key]

  if (!deepLink) {
    console.warn(`[DriveMind] Unknown platform for deep link: "${platform}"`)
    return
  }

  try {
    const supported = await Linking.canOpenURL(deepLink)
    if (supported) {
      await Linking.openURL(deepLink)
    } else {
      await Linking.openURL(getFallbackUrl(key))
    }
  } catch (err) {
    console.warn(`[DriveMind] Failed to open deep link for ${platform}:`, err)
    try {
      await Linking.openURL(getFallbackUrl(key))
    } catch {
      // Nothing more we can do
    }
  }
}
