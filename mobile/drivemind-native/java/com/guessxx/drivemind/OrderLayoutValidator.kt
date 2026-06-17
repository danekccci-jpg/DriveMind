package com.guessxx.drivemind

/**
 * Structural guard: only treat accessibility / notification blobs as orders when
 * they contain verifiable price currency AND navigation metrics (time/distance).
 */
object OrderLayoutValidator {

    private val PRICE_TOKENS = listOf("zł", "pln", "eur", "€", "$", "usd")
    private val METRIC_TOKENS = listOf("min", "мин", "хв", "km", "км")
    private val NOISE_HEADERS = setOf(
        "powiadomienie",
        "powiadomienia",
        "notification",
        "notifications",
        "alert",
        "reminder",
        "przypomnienie",
        "уведомление",
        "уведомления",
        "сповіщення",
    )

    fun isValidOrderTextList(texts: List<String>): Boolean {
        if (texts.isEmpty()) return false
        val normalized = texts.map { it.trim() }.filter { it.isNotEmpty() }
        if (normalized.isEmpty()) return false

        val blob = normalized.joinToString("\n").lowercase()
        if (isNoiseOnly(normalized)) return false

        val hasPrice = PRICE_TOKENS.any { blob.contains(it) }
        val hasMetrics = METRIC_TOKENS.any { token ->
            // Word-boundary-ish: avoid matching "admin" for "min" — check token in blob
            blob.contains(token)
        }
        return hasPrice && hasMetrics
    }

    fun isValidOrderBlob(blob: String): Boolean =
        isValidOrderTextList(blob.lines())

    /** Human-readable reason for scrape debug logs. */
    fun rejectReason(texts: List<String>): String {
        if (texts.isEmpty()) return "empty-tree"
        val normalized = texts.map { it.trim() }.filter { it.isNotEmpty() }
        if (normalized.isEmpty()) return "empty-text"
        val blob = normalized.joinToString("\n").lowercase()
        if (isNoiseOnly(normalized)) return "noise-only"
        val hasPrice = PRICE_TOKENS.any { blob.contains(it) }
        val hasMetrics = METRIC_TOKENS.any { blob.contains(it) }
        return when {
            !hasPrice && !hasMetrics -> "no-price-no-metrics"
            !hasPrice -> "no-price"
            !hasMetrics -> "no-metrics"
            else -> "unknown"
        }
    }

    private fun isNoiseOnly(lines: List<String>): Boolean {
        val substantive = lines.filter { line ->
            val lower = line.lowercase().trim()
            lower.isNotEmpty() && NOISE_HEADERS.none { lower == it || lower.startsWith("$it ") }
        }
        if (substantive.isEmpty()) return true
        return substantive.all { line ->
            val lower = line.lowercase().trim()
            NOISE_HEADERS.any { lower == it || lower.startsWith("$it ") }
        }
    }
}
