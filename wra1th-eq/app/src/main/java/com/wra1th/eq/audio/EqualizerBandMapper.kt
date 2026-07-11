package com.wra1th.eq.audio

import kotlin.math.ln

/**
 * Maps the device-independent 10-band reference curve onto whatever bands the device
 * equalizer actually exposes, using logarithmic-frequency interpolation
 * (linear interpolation in log-frequency space, which matches how humans hear octaves).
 */
object EqualizerBandMapper {

    /**
     * For each device band center frequency, interpolate a gain from the reference curve.
     *
     * position = (ln(target) - ln(lower)) / (ln(upper) - ln(lower))
     *
     * Frequencies below/above the reference range take the edge reference gain.
     */
    fun mapReferenceCurveToDeviceBands(
        referenceFrequenciesHz: List<Float>,
        referenceGainsDb: List<Float>,
        deviceFrequenciesHz: List<Float>
    ): List<Float> {
        require(referenceFrequenciesHz.size == referenceGainsDb.size) {
            "Reference frequency and gain lists must be the same size"
        }
        if (referenceFrequenciesHz.isEmpty()) {
            return deviceFrequenciesHz.map { 0f }
        }
        return deviceFrequenciesHz.map { deviceFreq ->
            interpolateLogFrequency(referenceFrequenciesHz, referenceGainsDb, deviceFreq)
        }
    }

    /** Clamp every gain to the device-supported range. */
    fun clampGains(gainsDb: List<Float>, minDb: Float, maxDb: Float): List<Float> =
        gainsDb.map { it.coerceIn(minDb, maxDb) }

    private fun interpolateLogFrequency(
        frequenciesHz: List<Float>,
        gainsDb: List<Float>,
        targetHz: Float
    ): Float {
        if (targetHz <= frequenciesHz.first()) return gainsDb.first()
        if (targetHz >= frequenciesHz.last()) return gainsDb.last()

        var upperIndex = frequenciesHz.indexOfFirst { it >= targetHz }
        if (upperIndex <= 0) upperIndex = 1
        val lowerIndex = upperIndex - 1

        val lowerHz = frequenciesHz[lowerIndex]
        val upperHz = frequenciesHz[upperIndex]
        if (upperHz == lowerHz) return gainsDb[lowerIndex]

        val position = ((ln(targetHz.toDouble()) - ln(lowerHz.toDouble())) /
            (ln(upperHz.toDouble()) - ln(lowerHz.toDouble()))).toFloat()

        return gainsDb[lowerIndex] + position * (gainsDb[upperIndex] - gainsDb[lowerIndex])
    }
}
