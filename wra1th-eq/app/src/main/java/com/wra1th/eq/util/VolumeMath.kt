package com.wra1th.eq.util

import kotlin.math.roundToInt

/**
 * Pure media-volume percentage <-> stream-index mapping. Kept free of Android imports
 * so the mapping is unit-testable. Never assumes a fixed number of volume steps.
 */
object VolumeMath {

    fun percentToIndex(percent: Int, minIndex: Int, maxIndex: Int): Int {
        if (maxIndex <= minIndex) return minIndex
        val clamped = percent.coerceIn(0, 100)
        val span = (maxIndex - minIndex).toFloat()
        return minIndex + (clamped / 100f * span).roundToInt()
    }

    fun indexToPercent(index: Int, minIndex: Int, maxIndex: Int): Int {
        if (maxIndex <= minIndex) return 0
        val clamped = index.coerceIn(minIndex, maxIndex)
        val span = (maxIndex - minIndex).toFloat()
        return ((clamped - minIndex) / span * 100f).roundToInt().coerceIn(0, 100)
    }
}
