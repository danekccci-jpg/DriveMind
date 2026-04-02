import { Audio } from 'expo-av'
import * as Haptics from 'expo-haptics'

let moneySound: Audio.Sound | null = null

/** Short positive feedback when a payout hits the wallet. */
export async function playWalletCreditSound(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    })
    if (!moneySound) {
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/order_ping.wav'),
        { shouldPlay: false, volume: 0.65 },
      )
      moneySound = sound
    }
    await moneySound.setPositionAsync(0)
    await moneySound.playAsync()
  } catch {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }
}
