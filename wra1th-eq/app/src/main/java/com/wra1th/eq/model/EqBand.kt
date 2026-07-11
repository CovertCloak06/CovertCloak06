package com.wra1th.eq.model

/**
 * A single device equalizer band as reported by the platform [android.media.audiofx.Equalizer].
 */
data class EqBand(
    val index: Int,
    val frequencyHz: Float,
    val gainDb: Float,
    val minimumDb: Float,
    val maximumDb: Float
)
