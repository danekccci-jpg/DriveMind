package com.guessxx.drivemind

import java.util.Locale
import java.util.regex.Pattern

/**
 * Regex extraction for Polish driver-offer notification blobs.
 *
 * Examples:
 * - "Nowe żądanie: UberX (35,15 zł). Do klienta 3.2 km (10 min)."
 * - "Nowa oferta: 35,15 PLN · 3.2km · 10min"
 */
object NotificationOrderExtractor {

    data class Fields(
        val price: String,
        val distanceKm: String,
        val etaMin: String,
        val pickup: String,
        val dropoff: String,
    )

    private val PRICE_PATTERNS = listOf(
        // "(35,15 zł)" — common Uber PL layout
        Pattern.compile(
            "\\(\\s*(\\d+(?:[.,]\\d{1,2})?)\\s*(?:zł|PLN|zl)\\s*\\)",
            Pattern.CASE_INSENSITIVE,
        ),
        // "35,15 zł" / "42,80 PLN" / "18 zł"
        Pattern.compile(
            "(\\d+(?:[.,]\\d{1,2})?)\\s*(?:zł|PLN|zl|EUR|€|\\$|USD)\\b",
            Pattern.CASE_INSENSITIVE,
        ),
        // "zł 35,15"
        Pattern.compile(
            "(?:zł|PLN|zl)\\s*(\\d+(?:[.,]\\d{1,2})?)",
            Pattern.CASE_INSENSITIVE,
        ),
    )

    // "3.2 km" / "0,8km" / "Do klienta 3.2 km"
    private val DISTANCE_PATTERN = Pattern.compile(
        "(\\d+(?:[.,]\\d+)?)\\s*(?:km|км)\\b",
        Pattern.CASE_INSENSITIVE,
    )

    // "10 min" / "(10 min)" / "10min"
    private val ETA_PATTERN = Pattern.compile(
        "(\\d{1,3})\\s*(?:min(?:utes?)?|мин|хв)\\b",
        Pattern.CASE_INSENSITIVE,
    )

    private fun defaults(): Fields = Fields(
        price = "0",
        distanceKm = "0",
        etaMin = "0",
        pickup = "Unknown",
        dropoff = "Unknown",
    )

    fun parse(title: String, text: String, bigText: String): Fields {
        return try {
            val blob = listOf(title, text, bigText).filter { it.isNotBlank() }.joinToString("\n")
            if (blob.isBlank()) return defaults()

            Fields(
                price = parsePrice(blob) ?: "0",
                distanceKm = parseDistance(blob) ?: "0",
                etaMin = parseEtaMinutes(blob) ?: "0",
                pickup = parsePickup(blob),
                dropoff = parseDropoff(blob),
            )
        } catch (_: Exception) {
            defaults()
        }
    }

    private fun parsePrice(blob: String): String? {
        val candidates = mutableListOf<Double>()
        for (pattern in PRICE_PATTERNS) {
            val matcher = pattern.matcher(blob)
            while (matcher.find()) {
                toDecimal(matcher.group(1))?.takeIf { it > 0 }?.let { candidates.add(it) }
            }
        }
        return candidates.maxOrNull()?.let(::formatDecimal)
    }

    private fun parseDistance(blob: String): String? =
        firstDecimal(DISTANCE_PATTERN, blob)?.let(::formatDecimal)

    private fun parseEtaMinutes(blob: String): String? {
        val matcher = ETA_PATTERN.matcher(blob)
        val values = mutableListOf<Int>()
        while (matcher.find()) {
            matcher.group(1)?.toIntOrNull()?.takeIf { it in 1..180 }?.let { values.add(it) }
        }
        if (values.isEmpty()) return null

        val lower = blob.lowercase()
        val isBoltLike = lower.contains("bolt") || lower.contains("mtakso") || lower.contains("taxify")
        if (values.size >= 2 && isBoltLike) return values[0] + values[1]
        return values.first().toString()
    }

    private fun parsePickup(blob: String): String {
        val lines = blob.lines().map { it.trim() }.filter { it.isNotEmpty() }
        return lines.getOrNull(1)?.takeIf { it.length > 2 } ?: "Unknown"
    }

    private fun parseDropoff(blob: String): String {
        val lines = blob.lines().map { it.trim() }.filter { it.isNotEmpty() }
        val pickup = parsePickup(blob)
        return lines.getOrNull(2)?.takeIf { it.length > 2 }
            ?: lines.lastOrNull()?.takeIf { it.length > 2 && it != pickup }
            ?: "Unknown"
    }

    private fun firstDecimal(pattern: Pattern, blob: String): Double? =
        pattern.matcher(blob).let { if (it.find()) toDecimal(it.group(1)) else null }

    private fun toDecimal(raw: String?): Double? =
        raw?.trim()?.replace(',', '.')?.toDoubleOrNull()

    /** Normalizes comma decimals to dot strings without trailing noise. */
    private fun formatDecimal(value: Double): String {
        if (value == value.toLong().toDouble()) return value.toLong().toString()
        return String.format(Locale.US, "%.2f", value)
            .trimEnd('0')
            .trimEnd('.')
    }
}
