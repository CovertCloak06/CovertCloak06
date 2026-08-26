package com.wra1th.eq.model

/**
 * What the current device's audio-effect engine actually supports.
 * Detected at runtime by probing the platform effect classes.
 */
data class AudioCapabilities(
    val equalizerSupported: Boolean = false,
    val bandCount: Int = 0,
    val bandFrequenciesHz: List<Float> = emptyList(),
    val minGainDb: Float = 0f,
    val maxGainDb: Float = 0f,
    val bassBoostSupported: Boolean = false,
    val bassBoostStrengthSupported: Boolean = false,
    val loudnessEnhancerSupported: Boolean = false,
    val detectionError: String? = null
) {
    val anyEffectSupported: Boolean
        get() = equalizerSupported || bassBoostSupported || loudnessEnhancerSupported
}
