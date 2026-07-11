package com.wra1th.eq.util

import kotlin.math.roundToInt

/** Formats frequencies the way hardware EQs label them: 31, 250, 1k, 2.5k, 16k. */
object FrequencyFormatter {

    fun format(frequencyHz: Float): String {
        if (frequencyHz < 1000f) {
            return frequencyHz.roundToInt().toString()
        }
        val kilo = frequencyHz / 1000f
        val rounded = (kilo * 10).roundToInt() / 10f
        return if (rounded % 1f == 0f) {
            "${rounded.toInt()}k"
        } else {
            "${rounded}k"
        }
    }

    fun formatWithUnit(frequencyHz: Float): String {
        return if (frequencyHz < 1000f) "${format(frequencyHz)} Hz" else "${format(frequencyHz)}Hz"
    }
}
