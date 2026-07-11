package com.wra1th.eq.presets

import com.wra1th.eq.audio.EqualizerBandMapper

/**
 * Convenience wrapper that projects a reference-curve gain list onto the device's actual
 * bands and clamps to the device-supported gain range.
 */
object PresetInterpolator {

    fun deviceGainsFor(
        referenceGainsDb: List<Float>,
        deviceFrequenciesHz: List<Float>,
        deviceMinDb: Float,
        deviceMaxDb: Float
    ): List<Float> {
        val mapped = EqualizerBandMapper.mapReferenceCurveToDeviceBands(
            referenceFrequenciesHz = BuiltInPresets.REFERENCE_FREQUENCIES_HZ,
            referenceGainsDb = referenceGainsDb,
            deviceFrequenciesHz = deviceFrequenciesHz
        )
        return EqualizerBandMapper.clampGains(mapped, deviceMinDb, deviceMaxDb)
    }
}
