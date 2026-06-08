package com.guessxx.drivemind

import java.util.concurrent.atomic.AtomicLong

/**
 * Shared end time for the 10s accessibility scan window (ms since epoch).
 * Extended by notifications, JS "Accept", etc.
 */
object DriveMindScraperState {
  private val scanUntilMs = AtomicLong(0L)
  private val orderParsingEnabled = java.util.concurrent.atomic.AtomicBoolean(false)

  fun setOrderParsingEnabled(enabled: Boolean) {
    orderParsingEnabled.set(enabled)
    if (!enabled) {
      scanUntilMs.set(0L)
    }
  }

  fun isOrderParsingEnabled(): Boolean = orderParsingEnabled.get()

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

  fun shouldScan(): Boolean =
    orderParsingEnabled.get() && System.currentTimeMillis() < scanUntilMs.get()
}
