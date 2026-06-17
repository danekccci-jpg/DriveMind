package com.guessxx.drivemind

import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Shared scan gating for the accessibility scraper.
 *
 * Scanning runs while:
 * - a burst window is open ([extendScanWindow], notifications, Accept), or
 * - shift is armed AND a whitelist driver app is in the foreground.
 */
object DriveMindScraperState {
  private val scanUntilMs = AtomicLong(0L)
  private val orderParsingEnabled = AtomicBoolean(false)
  private val shiftScanActive = AtomicBoolean(false)
  private val driverAppInForeground = AtomicBoolean(false)

  fun setOrderParsingEnabled(enabled: Boolean) {
    orderParsingEnabled.set(enabled)
    if (!enabled) {
      scanUntilMs.set(0L)
      shiftScanActive.set(false)
      driverAppInForeground.set(false)
    }
  }

  fun isOrderParsingEnabled(): Boolean = orderParsingEnabled.get()

  fun setShiftScanActive(active: Boolean) {
    shiftScanActive.set(active)
    if (!active) {
      driverAppInForeground.set(false)
    }
  }

  fun isShiftScanActive(): Boolean = shiftScanActive.get()

  fun setDriverAppInForeground(active: Boolean) {
    driverAppInForeground.set(active)
  }

  fun isDriverAppInForeground(): Boolean = driverAppInForeground.get()

  fun extendScanWindow(durationMs: Long) {
    if (!orderParsingEnabled.get()) return
    val now = System.currentTimeMillis()
    val target = now + durationMs
    var cur: Long
    do {
      cur = scanUntilMs.get()
      val next = maxOf(cur, target)
      if (scanUntilMs.compareAndSet(cur, next)) break
    } while (true)
  }

  fun shouldScan(): Boolean {
    if (!orderParsingEnabled.get()) return false
    if (shiftScanActive.get() && driverAppInForeground.get()) return true
    return System.currentTimeMillis() < scanUntilMs.get()
  }
}
