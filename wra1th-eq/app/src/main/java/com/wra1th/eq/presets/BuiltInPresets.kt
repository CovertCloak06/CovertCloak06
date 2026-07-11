package com.wra1th.eq.presets

import com.wra1th.eq.model.EqPreset

/**
 * Factory presets defined on the 10-band reference curve. These are never mutated;
 * user edits fork into the "Custom" state and can be saved as user presets.
 */
object BuiltInPresets {

    /** Device-independent reference band centers, in Hz. */
    val REFERENCE_FREQUENCIES_HZ: List<Float> = listOf(
        31f, 62f, 125f, 250f, 500f, 1000f, 2000f, 4000f, 8000f, 16000f
    )

    const val REFERENCE_BAND_COUNT = 10

    val flat = EqPreset(
        id = "flat",
        name = "Flat",
        gainsDb = listOf(
            0f, 0f, 0f, 0f, 0f,
            0f, 0f, 0f, 0f, 0f
        )
    )

    val rock = EqPreset(
        id = "rock",
        name = "Rock",
        gainsDb = listOf(
            4f, 3f, 1f, -1f, -2f,
            0f, 2f, 4f, 5f, 4f
        ),
        bassBoostStrength = 250,
        loudnessGainDb = 1f
    )

    val rap = EqPreset(
        id = "rap",
        name = "Rap",
        gainsDb = listOf(
            6f, 6f, 4f, 1f, -1f,
            0f, 1f, 2f, 3f, 2f
        ),
        bassBoostStrength = 500,
        loudnessGainDb = 2f
    )

    val classical = EqPreset(
        id = "classical",
        name = "Classical",
        gainsDb = listOf(
            1f, 1f, 0f, -1f, 0f,
            1f, 2f, 3f, 3f, 2f
        ),
        bassBoostStrength = 100
    )

    val electronic = EqPreset(
        id = "electronic",
        name = "Electronic",
        gainsDb = listOf(
            5f, 5f, 3f, 0f, -2f,
            0f, 2f, 4f, 5f, 4f
        ),
        bassBoostStrength = 450,
        loudnessGainDb = 2f
    )

    val vocal = EqPreset(
        id = "vocal",
        name = "Vocal",
        gainsDb = listOf(
            -3f, -2f, -1f, 0f, 2f,
            4f, 5f, 4f, 2f, 0f
        )
    )

    val bass = EqPreset(
        id = "bass",
        name = "Bass",
        gainsDb = listOf(
            7f, 6f, 4f, 1f, -2f,
            -1f, 0f, 1f, 1f, 0f
        ),
        bassBoostStrength = 650,
        loudnessGainDb = 1f
    )

    val podcast = EqPreset(
        id = "podcast",
        name = "Podcast",
        gainsDb = listOf(
            -5f, -4f, -3f, -1f, 2f,
            4f, 5f, 3f, 1f, -1f
        )
    )

    val carAudio = EqPreset(
        id = "car_audio",
        name = "Car Audio",
        gainsDb = listOf(
            4f, 4f, 2f, 0f, -1f,
            0f, 1f, 2f, 2f, 1f
        ),
        bassBoostStrength = 350,
        loudnessGainDb = 1f
    )

    val night = EqPreset(
        id = "night",
        name = "Night",
        gainsDb = listOf(
            -3f, -2f, -1f, 0f, 1f,
            2f, 2f, 1f, 0f, -1f
        ),
        bassBoostStrength = 100,
        loudnessGainDb = 2f
    )

    val all: List<EqPreset> = listOf(
        flat, rock, rap, classical, electronic,
        vocal, bass, podcast, carAudio, night
    )

    fun byId(id: String): EqPreset? = all.firstOrNull { it.id == id }

    fun isBuiltInId(id: String): Boolean = all.any { it.id == id }
}
