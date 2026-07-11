package com.wra1th.eq.model

/**
 * A preset defined on the 10-band reference curve
 * (31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz).
 */
data class EqPreset(
    val id: String,
    val name: String,
    val gainsDb: List<Float>,
    val bassBoostStrength: Int = 0,
    val loudnessGainDb: Float = 0f,
    val preampDb: Float? = null,
    val builtIn: Boolean = true
)
