package com.wra1th.eq.model

import kotlinx.serialization.Serializable

/**
 * A user-created preset. Persisted (and imported/exported) as JSON via kotlinx.serialization.
 */
@Serializable
data class UserEqPreset(
    val id: String,
    val name: String,
    val gainsDb: List<Float>,
    val bassBoostStrength: Int,
    val loudnessGainDb: Float,
    val preampDb: Float,
    val createdAtEpochMs: Long,
    val updatedAtEpochMs: Long
) {
    fun toEqPreset(): EqPreset = EqPreset(
        id = id,
        name = name,
        gainsDb = gainsDb,
        bassBoostStrength = bassBoostStrength,
        loudnessGainDb = loudnessGainDb,
        preampDb = preampDb,
        builtIn = false
    )
}
