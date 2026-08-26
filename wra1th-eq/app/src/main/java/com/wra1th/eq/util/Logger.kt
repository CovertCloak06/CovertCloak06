package com.wra1th.eq.util

import android.util.Log

/**
 * Thin logging facade. Falls back to stdout when android.util.Log is unavailable
 * (e.g. in local JVM unit tests that happen to touch logging code).
 */
object Logger {
    private const val TAG = "Wra1thEQ"

    fun d(message: String) = safeLog { Log.d(TAG, message) }

    fun w(message: String, throwable: Throwable? = null) = safeLog { Log.w(TAG, message, throwable) }

    fun e(message: String, throwable: Throwable? = null) = safeLog { Log.e(TAG, message, throwable) }

    private inline fun safeLog(block: () -> Unit) {
        try {
            block()
        } catch (_: RuntimeException) {
            // Not on a device (unit test) — logging is best-effort.
        }
    }
}
