package com.guessxx.drivemind

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

private const val PREFS = "drivemind_notification_buffer"
private const val KEY_ENTRIES = "entries_json"
private const val KEY_DIAGNOSTIC = "diagnostic_events_json"
private const val MAX_DIAGNOSTIC = 200
private const val MAX_OFFLINE_ENTRIES = 50

object NotificationBufferPrefs {
  fun append(context: Context, title: String, text: String, timestampMs: Long, packageName: String) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_ENTRIES, "[]") ?: "[]"
    val arr = try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }
    val o = JSONObject()
    o.put("title", title)
    o.put("text", text)
    o.put("timestamp", timestampMs)
    o.put("packageName", packageName)
    arr.put(o)
    while (arr.length() > MAX_OFFLINE_ENTRIES) {
      arr.remove(0)
    }
    prefs.edit().putString(KEY_ENTRIES, arr.toString()).apply()
  }

  fun readAllJson(context: Context): String {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return prefs.getString(KEY_ENTRIES, "[]") ?: "[]"
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_ENTRIES).apply()
  }

  fun appendDiagnostic(context: Context, title: String, text: String, timestampMs: Long, packageName: String) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_DIAGNOSTIC, "[]") ?: "[]"
    val arr = try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }
    val o = JSONObject()
    o.put("title", title)
    o.put("text", text)
    o.put("timestamp", timestampMs)
    o.put("packageName", packageName)
    arr.put(o)
    while (arr.length() > MAX_DIAGNOSTIC) {
      arr.remove(0)
    }
    prefs.edit().putString(KEY_DIAGNOSTIC, arr.toString()).apply()
  }

  fun readRecentDiagnosticJson(context: Context, limit: Int): String {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_DIAGNOSTIC, "[]") ?: "[]"
    val arr = try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }
    if (arr.length() <= limit) return arr.toString()
    val trimmed = JSONArray()
    val start = arr.length() - limit
    for (i in start until arr.length()) {
      trimmed.put(arr.get(i))
    }
    return trimmed.toString()
  }
}
