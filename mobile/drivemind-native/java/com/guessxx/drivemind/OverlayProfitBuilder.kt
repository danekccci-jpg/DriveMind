package com.guessxx.drivemind

import java.util.regex.Pattern

/**
 * Builds [OverlayProfitFields] on the native hot path (notifications / scrape)
 * without waiting for the RN bridge.
 */
object OverlayProfitBuilder {

    private val PRICE_NUM = Pattern.compile("(\\d+(?:[.,]\\d+)?)")
    private val DIST_NUM = Pattern.compile("(\\d+(?:[.,]\\d+)?)")
    private val ETA_NUM = Pattern.compile("(\\d{1,3})")

    fun fromPriceDistanceEta(
        priceRaw: String,
        distanceKmRaw: String,
        etaMinRaw: String,
        packageName: String,
        contentHash: String = "",
    ): OverlayProfitFields? {
        val price = parseNumber(priceRaw) ?: return null
        if (price <= 0) return null
        val dist = parseNumber(distanceKmRaw)?.takeIf { it > 0 } ?: 5.0
        val eta = parseNumber(etaMinRaw)?.takeIf { it > 0 } ?: 15.0
        val safeDist = dist.coerceAtLeast(0.2)
        val zlPerKm = price / safeDist
        val accent = tierColor(zlPerKm)
        val tierTitle = tierTitle(zlPerKm)
        return OverlayProfitFields(
            tierTitle = tierTitle,
            primaryRateLine = String.format("%.2f zł/km", zlPerKm),
            priceLine = String.format("%.2f zł", price),
            metricsLine = "${eta.toInt()} min · ${String.format("%.1f", safeDist)} km",
            accentColorHex = accent,
            packageName = packageName,
            contentHash = contentHash,
        )
    }

    private fun parseNumber(raw: String): Double? {
        val t = raw.trim().replace(',', '.')
        if (t.isEmpty()) return null
        t.toDoubleOrNull()?.let { return it }
        val m = PRICE_NUM.matcher(t)
        if (!m.find()) return null
        return m.group(1)?.replace(',', '.')?.toDoubleOrNull()
    }

    /** Financial Analyst tier colors — corporate HUD palette. */
    private fun tierColor(zlPerKm: Double): String = when {
        zlPerKm >= 4.0 -> "#22C55E"  // Excellent — green
        zlPerKm >= 3.0 -> "#EAB308"  // Good Deal — amber
        zlPerKm >= 2.3 -> "#A1A1AA"  // Standard — neutral gray
        else -> "#EF4444"             // Low Yield — red
    }

    /** Financial Analyst tier labels based on PLN/km efficiency. */
    private fun tierTitle(zlPerKm: Double): String = when {
        zlPerKm >= 4.0 -> "🟢 Excellent"
        zlPerKm >= 3.0 -> "🟡 Good Deal"
        zlPerKm >= 2.3 -> "⚪ Standard"
        else -> "🔴 Low Yield"
    }
}
