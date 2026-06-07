package com.guessxx.drivemind

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator

object DriveMindSound {
  private const val PREFS = "drivemind_prefs"
  private const val KEY_SOUND = "dm_sound_enabled"

  fun isSoundEnabled(context: Context): Boolean {
    return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_SOUND, true)
  }

  fun setSoundEnabled(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_SOUND, enabled).apply()
  }

  /** Short system "ack" tone — lightweight and universal across OEMs. */
  fun playSoftClick(context: Context) {
    if (!isSoundEnabled(context)) return
    try {
      val tg = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 60)
      tg.startTone(ToneGenerator.TONE_PROP_ACK, 120)
      android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
        tg.release()
      }, 200)
    } catch (_: Exception) {
      // ignore — no audio route
    }
  }
}
