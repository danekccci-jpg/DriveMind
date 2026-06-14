package com.guessxx.drivemind

import android.app.Notification
import android.os.Bundle

/**
 * Maps notification posters (production or Kraków QA mocks) to a canonical brand +
 * package ID used by the JS ingest pipeline.
 */
object NotificationBrandRouter {

    const val PACKAGE_UBER = "com.ubercab.driver"
    const val PACKAGE_BOLT = "com.bolt.driver"
    const val PACKAGE_BOLT_MTAKSO = "ee.mtakso.driver"
    const val PACKAGE_BOLT_FOOD = "com.bolt.delivery"
    const val PACKAGE_GLOVO = "com.glovoapp.courier"
    const val PACKAGE_WOLT = "com.wolt.handler"

    /**
     * Kraków QA mocks (UberDriverMock.apk, BoltDriverMock.apk, BoltFoodMock.apk)
     * ship with these exact applicationIds — same as production.
     */
    val KRAKOW_MOCK_PACKAGES: Set<String> = setOf(
        PACKAGE_UBER,
        PACKAGE_BOLT,
        PACKAGE_BOLT_FOOD,
    )

    val PRODUCTION_PACKAGES: Set<String> = setOf(
        PACKAGE_UBER,
        PACKAGE_BOLT,
        PACKAGE_BOLT_MTAKSO,
        PACKAGE_BOLT_FOOD,
        PACKAGE_GLOVO,
        PACKAGE_WOLT,
    )

    val NOTIFICATION_TARGET_PACKAGES: Set<String> = setOf(
        PACKAGE_UBER,
        PACKAGE_BOLT,
        PACKAGE_BOLT_MTAKSO,
        PACKAGE_BOLT_FOOD,
    )

    private val PACKAGE_ALIASES: Map<String, String> = mapOf(
        PACKAGE_BOLT_MTAKSO to PACKAGE_BOLT,
    )

    data class BrandMatch(
        val brand: String,
        val canonicalPackage: String,
    )

    data class NotificationContent(
        val title: String,
        val text: String,
        val bigText: String,
        val fullContentLower: String,
    )

    fun canonicalPackage(sourcePackage: String): String =
        PACKAGE_ALIASES[sourcePackage] ?: sourcePackage

    fun extractContent(extras: Bundle): NotificationContent {
        val title = listOfNotNull(
            extras.getCharSequence(Notification.EXTRA_TITLE),
            extras.getCharSequence("android.title"),
        ).firstOrNull()?.toString()?.trim().orEmpty()

        val text = listOfNotNull(
            extras.getCharSequence(Notification.EXTRA_TEXT),
            extras.getCharSequence("android.text"),
        ).firstOrNull()?.toString()?.trim().orEmpty()

        val bigText = listOfNotNull(
            extras.getCharSequence(Notification.EXTRA_BIG_TEXT),
            extras.getCharSequence("android.bigText"),
        ).firstOrNull()?.toString()?.trim().orEmpty()

        val fullContentLower = "$title $text $bigText".lowercase()
        return NotificationContent(title, text, bigText, fullContentLower)
    }

    fun matchBrand(fullContentLower: String): BrandMatch? {
        val c = fullContentLower
        if (c.isBlank()) return null

        return when {
            c.contains("glovo") -> BrandMatch("glovo", PACKAGE_GLOVO)
            c.contains("wolt") -> BrandMatch("wolt", PACKAGE_WOLT)
            c.contains("uber") -> BrandMatch("uber", PACKAGE_UBER)
            c.contains("bolt food") || c.contains("bolt delivery") || c.contains("bolt dostawa") ||
                c.contains("boltfood") || c.contains("bolt_food") ->
                BrandMatch("bolt_food", PACKAGE_BOLT_FOOD)
            c.contains("bolt") || c.contains("mtakso") || c.contains("taxify") ->
                BrandMatch("bolt", PACKAGE_BOLT)
            else -> null
        }
    }

    /**
     * Kraków QA mocks often use custom package IDs like com.guessxx.mock.uber —
     * route by package name when notification body lacks brand keywords.
     */
    fun matchPackageHint(sourcePackage: String): BrandMatch? {
        val p = sourcePackage.lowercase()
        if (p.isBlank() || p == "com.guessxx.drivemind") return null

        return when {
            p.contains("ubercab") || p.contains("uber") -> BrandMatch("uber", PACKAGE_UBER)
            p.contains("boltfood") || p.contains("bolt_food") ||
                (p.contains("bolt") && (p.contains("food") || p.contains("delivery") || p.contains("dostawa"))) ||
                (p.contains("delivery") && p.contains("bolt")) ->
                BrandMatch("bolt_food", PACKAGE_BOLT_FOOD)
            p.contains("bolt") || p.contains("mtakso") || p.contains("taxify") ->
                BrandMatch("bolt", PACKAGE_BOLT)
            p.contains("glovo") -> BrandMatch("glovo", PACKAGE_GLOVO)
            p.contains("wolt") -> BrandMatch("wolt", PACKAGE_WOLT)
            else -> null
        }
    }

    /**
     * Any notification posted by a whitelisted driver-app package is ingested,
     * even when title/body are empty or lack brand keywords (system layouts, mocks).
     */
    fun matchWhitelistedPackage(sourcePackage: String): BrandMatch? = when (sourcePackage) {
        PACKAGE_UBER -> BrandMatch("uber", PACKAGE_UBER)
        PACKAGE_BOLT, PACKAGE_BOLT_MTAKSO -> BrandMatch("bolt", canonicalPackage(sourcePackage))
        PACKAGE_BOLT_FOOD -> BrandMatch("bolt_food", PACKAGE_BOLT_FOOD)
        PACKAGE_GLOVO -> BrandMatch("glovo", PACKAGE_GLOVO)
        PACKAGE_WOLT -> BrandMatch("wolt", PACKAGE_WOLT)
        else -> matchPackageHint(sourcePackage)
    }

    /**
     * Package whitelist wins first — if the user sees a notification from Uber/Bolt
     * in the shade, we ingest it. Text-based brand match is a fallback for unknown
     * poster package IDs (legacy mocks, alternate builds).
     */
    fun resolveRoute(sourcePackage: String, content: NotificationContent): BrandMatch? {
        matchWhitelistedPackage(sourcePackage)?.let { return it }
        matchBrand(content.fullContentLower)?.let { return it }
        return null
    }
}
