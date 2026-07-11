package com.wra1th.eq.util

import kotlin.math.roundToInt

/** Clipping-risk classification for the current boost configuration. */
enum class ClippingRisk { Low, Moderate, High }

/**
 * Decibel / millibel math and headroom estimation.
 *
 * Preamp on the public Android effect chain is a headroom-management calculation:
 * where no native pre-gain stage exists, the value is used for diagnostics and
 * recommendations rather than actual signal attenuation.
 */
object DbMath {

    const val MIN_PREAMP_DB = -18f
    const val MAX_PREAMP_DB = 0f
    const val MAX_LOUDNESS_DB = 12f
    const val MAX_BASS_BOOST_STRENGTH = 1000

    /** 1 dB = 100 mB, the unit used by [android.media.audiofx.LoudnessEnhancer]. */
    fun dbToMillibels(db: Float): Int = (db * 100f).roundToInt()

    fun millibelsToDb(millibels: Int): Float = millibels / 100f

    /** Rough perceptual contribution of BassBoost at full strength, in dB. */
    private const val BASS_BOOST_FULL_STRENGTH_DB = 4f

    fun estimateBassBoostDb(bassBoostStrength: Int): Float =
        bassBoostStrength.coerceIn(0, MAX_BASS_BOOST_STRENGTH) /
            MAX_BASS_BOOST_STRENGTH.toFloat() * BASS_BOOST_FULL_STRENGTH_DB

    /** Total estimated positive boost: max positive EQ gain + loudness + bass-boost estimate. */
    fun estimateTotalBoostDb(
        gainsDb: List<Float>,
        loudnessGainDb: Float,
        bassBoostStrength: Int
    ): Float {
        val maxEqGain = gainsDb.maxOfOrNull { it }?.coerceAtLeast(0f) ?: 0f
        return maxEqGain + loudnessGainDb.coerceAtLeast(0f) + estimateBassBoostDb(bassBoostStrength)
    }

    /**
     * Recommended preamp = -(total estimated boost), clamped to [-18, 0] dB.
     */
    fun calculateRecommendedPreampDb(
        gainsDb: List<Float>,
        loudnessGainDb: Float,
        bassBoostStrength: Int
    ): Float {
        val totalBoost = estimateTotalBoostDb(gainsDb, loudnessGainDb, bassBoostStrength)
        return (-totalBoost).coerceIn(MIN_PREAMP_DB, MAX_PREAMP_DB)
    }

    /**
     * Estimated headroom after applying the (possibly conceptual) preamp.
     * Negative headroom means the configuration likely pushes peaks past full scale.
     */
    fun estimateHeadroomDb(
        gainsDb: List<Float>,
        loudnessGainDb: Float,
        bassBoostStrength: Int,
        preampDb: Float
    ): Float {
        val totalBoost = estimateTotalBoostDb(gainsDb, loudnessGainDb, bassBoostStrength)
        return -(totalBoost + preampDb.coerceIn(MIN_PREAMP_DB, MAX_PREAMP_DB))
    }

    /**
     * Risk of digital clipping given the residual (uncompensated) boost.
     * <= 1 dB residual boost: Low. <= 4 dB: Moderate. Above that: High.
     */
    fun clippingRisk(
        gainsDb: List<Float>,
        loudnessGainDb: Float,
        bassBoostStrength: Int,
        preampDb: Float
    ): ClippingRisk {
        val residual = -estimateHeadroomDb(gainsDb, loudnessGainDb, bassBoostStrength, preampDb)
        return when {
            residual <= 1f -> ClippingRisk.Low
            residual <= 4f -> ClippingRisk.Moderate
            else -> ClippingRisk.High
        }
    }
}
