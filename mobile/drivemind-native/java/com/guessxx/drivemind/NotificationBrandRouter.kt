package com.guessxx.drivemind

import android.app.Notification
import android.os.Bundle
import android.util.Log

/**
 * Maps notification posters (production or Kraków QA mocks) to a canonical brand +
 * package ID used by the JS ingest pipeline.
 *
 * Also owns accessibility / scraper package gates (flexible matching + mock QA).
 */
object NotificationBrandRouter {

    private const val TAG = "DriveMindScraper"

    const val PACKAGE_UBER = "com.ubercab.driver"
    /** Global Bolt Driver build — canonical for JS routing. */
    const val PACKAGE_BOLT = "com.bolt.driver"
    /** Kraków / EU production Bolt (Taxify) — must match accessibility events. */
    const val PACKAGE_BOLT_MTAKSO = "ee.mtakso.driver"
    const val PACKAGE_BOLT_FOOD = "com.bolt.delivery"
    const val PACKAGE_GLOVO = "com.glovoapp.courier"
    /** Current Wolt Courier production ID. */
    const val PACKAGE_WOLT = "com.wolt.courier.android"
    /** Legacy Wolt handler package (older builds / mocks). */
    const val PACKAGE_WOLT_LEGACY = "com.wolt.handler"
    const val PACKAGE_PYSZNE = "pl.pyszne"
    const val PACKAGE_JUST_EAT = "com.justeattakeaway.courier"

    /** Guessxx Kraków mock APKs that use non-production applicationIds. */
    val GUESSXX_MOCK_PACKAGES: Set<String> = setOf(
        "com.guessxx.mock.uber",
        "com.guessxx.mock.bolt",
        "com.guessxx.mock.boltfood",
        "com.guessxx.krakowmocks",
    )

    /**
     * Kraków QA mocks (UberDriverMock.apk, BoltDriverMock.apk, BoltFoodMock.apk)
     * ship with production applicationIds — same as production.
     */
    val KRAKOW_MOCK_PACKAGES: Set<String> = setOf(
        PACKAGE_UBER,
        PACKAGE_BOLT,
        PACKAGE_BOLT_MTAKSO,
        PACKAGE_BOLT_FOOD,
    )

    val PRODUCTION_PACKAGES: Set<String> = setOf(
        PACKAGE_UBER,
        PACKAGE_BOLT,
        PACKAGE_BOLT_MTAKSO,
        PACKAGE_BOLT_FOOD,
        PACKAGE_GLOVO,
        PACKAGE_WOLT,
        PACKAGE_WOLT_LEGACY,
        PACKAGE_PYSZNE,
        PACKAGE_JUST_EAT,
    )

    val NOTIFICATION_TARGET_PACKAGES: Set<String> = setOf(
        PACKAGE_UBER,
        PACKAGE_BOLT,
        PACKAGE_BOLT_MTAKSO,
        PACKAGE_BOLT_FOOD,
        PACKAGE_GLOVO,
        PACKAGE_WOLT,
        PACKAGE_WOLT_LEGACY,
        PACKAGE_PYSZNE,
        PACKAGE_JUST_EAT,
    )

    /** Exact IDs for accessibility_service_config.xml (superset of production + QA mocks). */
    val ACCESSIBILITY_XML_PACKAGE_FILTER: Set<String> = PRODUCTION_PACKAGES +
        KRAKOW_MOCK_PACKAGES +
        GUESSXX_MOCK_PACKAGES

    private val PACKAGE_ALIASES: Map<String, String> = mapOf(
        PACKAGE_BOLT_MTAKSO to PACKAGE_BOLT,
        PACKAGE_WOLT_LEGACY to PACKAGE_WOLT,
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

    /**
     * QA / dev mock packages — substring heuristics so KrakówMocks dist builds
     * are not dropped by strict Set membership in the scraper.
     */
    fun isMockOrTestPackage(packageName: String): Boolean {
        val p = packageName.lowercase()
        if (p.isBlank() || p == "com.guessxx.drivemind") return false
        if (p in GUESSXX_MOCK_PACKAGES.map { it.lowercase() }) return true
        return p.contains("mock") ||
            p.contains("krakowmock") ||
            p.contains("drivermock") ||
            p.startsWith("com.guessxx.mock") ||
            p.contains(".mock.")
    }

    /**
     * True when accessibility events from this foreground package should keep
     * the overlay/scrape pipeline armed (production IDs, heuristics, or mocks).
     */
    fun isOverlayTargetPackage(packageName: String): Boolean {
        if (packageName.isBlank() || packageName == "com.guessxx.drivemind") return false
        if (packageName in PRODUCTION_PACKAGES) return true
        if (packageName in KRAKOW_MOCK_PACKAGES) return true
        if (isMockOrTestPackage(packageName)) return true
        return matchPackageHint(packageName) != null
    }

    /** Same gate as overlay for scrape ticks — alias for readability in scraper. */
    fun isMonitoredDriverPackage(packageName: String): Boolean =
        isOverlayTargetPackage(packageName)

    fun logWindowPackage(packageName: String, gate: String, accepted: Boolean) {
        Log.d(TAG, "Current window package: $packageName")
        if (!accepted) {
            Log.d(TAG, "Package rejected ($gate): $packageName")
        }
    }

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
            c.contains("pyszne") || c.contains("just eat") || c.contains("justeat") ->
                BrandMatch("pyszne", PACKAGE_PYSZNE)
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
     * Route by package name when notification body lacks brand keywords
     * (Kraków QA mocks, alternate regional builds).
     */
    fun matchPackageHint(sourcePackage: String): BrandMatch? {
        val p = sourcePackage.lowercase()
        if (p.isBlank() || p == "com.guessxx.drivemind") return null
        if (isMockOrTestPackage(sourcePackage)) {
            return matchPackageHintForMock(p)
        }

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
            p.contains("pyszne") -> BrandMatch("pyszne", PACKAGE_PYSZNE)
            p.contains("justeat") || p.contains("just_eat") || p.contains("justeattakeaway") ->
                BrandMatch("just_eat", PACKAGE_JUST_EAT)
            else -> null
        }
    }

    private fun matchPackageHintForMock(p: String): BrandMatch? = when {
        p.contains("uber") -> BrandMatch("uber", PACKAGE_UBER)
        p.contains("boltfood") || p.contains("food") -> BrandMatch("bolt_food", PACKAGE_BOLT_FOOD)
        p.contains("bolt") || p.contains("mtakso") -> BrandMatch("bolt", PACKAGE_BOLT)
        p.contains("glovo") -> BrandMatch("glovo", PACKAGE_GLOVO)
        p.contains("wolt") -> BrandMatch("wolt", PACKAGE_WOLT)
        p.contains("pyszne") -> BrandMatch("pyszne", PACKAGE_PYSZNE)
        else -> BrandMatch("mock", PACKAGE_UBER)
    }

    fun matchWhitelistedPackage(sourcePackage: String): BrandMatch? {
        if (isMockOrTestPackage(sourcePackage)) {
            matchPackageHint(sourcePackage)?.let { return it }
        }
        return when (sourcePackage) {
            PACKAGE_UBER -> BrandMatch("uber", PACKAGE_UBER)
            PACKAGE_BOLT, PACKAGE_BOLT_MTAKSO -> BrandMatch("bolt", canonicalPackage(sourcePackage))
            PACKAGE_BOLT_FOOD -> BrandMatch("bolt_food", PACKAGE_BOLT_FOOD)
            PACKAGE_GLOVO -> BrandMatch("glovo", PACKAGE_GLOVO)
            PACKAGE_WOLT, PACKAGE_WOLT_LEGACY -> BrandMatch("wolt", PACKAGE_WOLT)
            PACKAGE_PYSZNE -> BrandMatch("pyszne", PACKAGE_PYSZNE)
            PACKAGE_JUST_EAT -> BrandMatch("just_eat", PACKAGE_JUST_EAT)
            else -> matchPackageHint(sourcePackage)
        }
    }

    fun resolveRoute(sourcePackage: String, content: NotificationContent): BrandMatch? {
        matchWhitelistedPackage(sourcePackage)?.let { return it }
        matchBrand(content.fullContentLower)?.let { return it }
        return null
    }
}
