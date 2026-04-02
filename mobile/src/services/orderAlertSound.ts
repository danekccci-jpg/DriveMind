import { Audio } from 'expo-av'
import * as Haptics from 'expo-haptics'

let soundObject: Audio.Sound | null = null

/**
 * Plays a short alert for incoming orders. Falls back to haptics if audio fails.
 */
export async function playOrderAlertSound(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    })
    if (!soundObject) {
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/order_ping.wav'),
        { shouldPlay: true, volume: 1 },
      )
      soundObject = sound
      return
    }
    await soundObject.setPositionAsync(0)
    await soundObject.playAsync()
  } catch (e) {
    console.warn('[DriveMind Socket]: order alert sound fallback (haptics)', e)
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }
}
