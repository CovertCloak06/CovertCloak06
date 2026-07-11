package com.wra1th.eq.model

import kotlinx.serialization.Serializable

/** Preset id used whenever the user has manually edited any processing parameter. */
const val CUSTOM_PRESET_ID = "custom"
const val CUSTOM_PRESET_NAME = "Custom"

/**
 * Immutable UI state for the equalizer screen. Produced by [com.wra1th.eq.viewmodel.EqualizerViewModel]
 * from the persisted state, the live processing status, and the live system volume.
 */
data class EqualizerState(
    val enabled: Boolean = true,
    val selectedPresetId: String = "flat",
    val selectedPresetName: String = "Flat",
    val deviceBands: List<EqBand> = emptyList(),
    val referenceGainsDb: List<Float> = List(10) { 0f },
    val bassBoostStrength: Int = 0,
    val loudnessGainDb: Float = 0f,
    val preampDb: Float = 0f,
    val mediaVolumePercent: Int = 50,
    val autoHeadroomEnabled: Boolean = true,
    val processingStatus: ProcessingStatus = ProcessingStatus.WaitingForSession,
    val isDirty: Boolean = false
)

/**
 * The persisted (versioned) slice of the equalizer state, stored as JSON in DataStore.
 * All mutations are pure functions so custom-mode switching rules are unit-testable.
 */
@Serializable
data class PersistedEqState(
    val version: Int = PERSISTED_STATE_VERSION,
    val enabled: Boolean = true,
    val selectedPresetId: String = "flat",
    val selectedPresetName: String = "Flat",
    val referenceGainsDb: List<Float> = List(10) { 0f },
    val bassBoostStrength: Int = 0,
    val loudnessGainDb: Float = 0f,
    val preampDb: Float = 0f,
    val autoHeadroomEnabled: Boolean = true,
    val mediaVolumePercent: Int = 50,
    val manualSessionId: Int? = null,
    val isDirty: Boolean = false
) {
    companion object {
        const val PERSISTED_STATE_VERSION = 1
    }
}

/**
 * Pure state-transition functions. Any manual edit of a processing parameter switches the
 * selected preset to "Custom" without touching the built-in preset definitions.
 */
object EqStateTransforms {

    private fun PersistedEqState.asCustom(): PersistedEqState =
        copy(
            selectedPresetId = CUSTOM_PRESET_ID,
            selectedPresetName = CUSTOM_PRESET_NAME,
            isDirty = true
        )

    fun withBandGain(state: PersistedEqState, bandIndex: Int, gainDb: Float): PersistedEqState {
        if (bandIndex !in state.referenceGainsDb.indices) return state
        val gains = state.referenceGainsDb.toMutableList()
        gains[bandIndex] = gainDb
        return state.copy(referenceGainsDb = gains).asCustom()
    }

    fun withBassBoost(state: PersistedEqState, strength: Int): PersistedEqState =
        state.copy(bassBoostStrength = strength.coerceIn(0, 1000)).asCustom()

    fun withLoudnessGain(state: PersistedEqState, gainDb: Float): PersistedEqState =
        state.copy(loudnessGainDb = gainDb.coerceIn(0f, 12f)).asCustom()

    fun withPreamp(state: PersistedEqState, preampDb: Float): PersistedEqState =
        state.copy(preampDb = preampDb.coerceIn(-18f, 0f)).asCustom()

    fun withMasterEnabled(state: PersistedEqState, enabled: Boolean): PersistedEqState =
        state.copy(enabled = enabled)

    fun withAutoHeadroom(state: PersistedEqState, enabled: Boolean): PersistedEqState =
        state.copy(autoHeadroomEnabled = enabled).asCustom()

    fun withPresetApplied(state: PersistedEqState, preset: EqPreset): PersistedEqState =
        state.copy(
            selectedPresetId = preset.id,
            selectedPresetName = preset.name,
            referenceGainsDb = preset.gainsDb,
            bassBoostStrength = preset.bassBoostStrength.coerceIn(0, 1000),
            loudnessGainDb = preset.loudnessGainDb.coerceIn(0f, 12f),
            preampDb = (preset.preampDb ?: state.preampDb).coerceIn(-18f, 0f),
            isDirty = false
        )

    fun withCurveReset(state: PersistedEqState): PersistedEqState =
        state.copy(referenceGainsDb = List(state.referenceGainsDb.size) { 0f }).asCustom()
}
