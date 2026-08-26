package com.wra1th.eq.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.wra1th.eq.Wra1thEqApplication
import com.wra1th.eq.audio.AudioEffectSessionManager
import com.wra1th.eq.audio.AudioProcessingState
import com.wra1th.eq.audio.AudioVolumeController
import com.wra1th.eq.data.AppSettings
import com.wra1th.eq.data.EqPreferencesRepository
import com.wra1th.eq.data.EqPresetRepository
import com.wra1th.eq.data.PresetOperationResult
import com.wra1th.eq.data.SettingsDataStore
import com.wra1th.eq.model.AudioCapabilities
import com.wra1th.eq.model.EqPreset
import com.wra1th.eq.model.EqStateTransforms
import com.wra1th.eq.model.EqualizerState
import com.wra1th.eq.model.PersistedEqState
import com.wra1th.eq.util.DbMath
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Drives the main equalizer screen. All mutations funnel through
 * [EqPreferencesRepository]; the application-scoped [AudioEffectSessionManager]
 * observes that state and applies it to the hardware effect chain, so audio keeps
 * working even when this ViewModel is not alive.
 */
class EqualizerViewModel(
    private val preferences: EqPreferencesRepository,
    private val sessionManager: AudioEffectSessionManager,
    private val volumeController: AudioVolumeController,
    private val presetRepository: EqPresetRepository,
    settingsDataStore: SettingsDataStore
) : ViewModel() {

    private val mediaVolumePercent = MutableStateFlow(volumeController.getVolumePercent())

    private val _saveResult = MutableStateFlow<PresetOperationResult?>(null)
    val saveResult: StateFlow<PresetOperationResult?> = _saveResult.asStateFlow()

    val state: StateFlow<EqualizerState> = combine(
        preferences.state,
        sessionManager.status,
        sessionManager.deviceBands,
        mediaVolumePercent
    ) { persisted, status, bands, volume ->
        EqualizerState(
            enabled = persisted.enabled,
            selectedPresetId = persisted.selectedPresetId,
            selectedPresetName = persisted.selectedPresetName,
            deviceBands = bands,
            referenceGainsDb = persisted.referenceGainsDb,
            bassBoostStrength = persisted.bassBoostStrength,
            loudnessGainDb = persisted.loudnessGainDb,
            preampDb = persisted.preampDb,
            mediaVolumePercent = volume,
            autoHeadroomEnabled = persisted.autoHeadroomEnabled,
            processingStatus = status,
            isDirty = persisted.isDirty
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = EqualizerState()
    )

    val appSettings: StateFlow<AppSettings> = settingsDataStore.appSettings.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = AppSettings()
    )

    /** Real per-stage attachment state, straight from the session manager. */
    val processing: StateFlow<AudioProcessingState> = sessionManager.processingState

    /** Detected device capabilities (band count, supported effects). */
    val capabilities: StateFlow<AudioCapabilities> = sessionManager.capabilities

    val builtInPresets: List<EqPreset> = presetRepository.builtInPresets

    init {
        viewModelScope.launch {
            volumeController.volumeChanges().collect { percent ->
                mediaVolumePercent.value = percent
            }
        }
    }

    // --- Mutations (all switch to Custom where the spec requires it) ---

    fun setMasterEnabled(enabled: Boolean) {
        preferences.update { EqStateTransforms.withMasterEnabled(it, enabled) }
    }

    fun setBandGain(bandIndex: Int, gainDb: Float) {
        updateWithHeadroom {
            EqStateTransforms.withBandGain(it, bandIndex, gainDb.coerceIn(-12f, 12f))
        }
    }

    fun setBassBoostPercent(percent: Int) {
        updateWithHeadroom {
            EqStateTransforms.withBassBoost(it, percent.coerceIn(0, 100) * 10)
        }
    }

    fun setLoudnessGainDb(gainDb: Float) {
        updateWithHeadroom { EqStateTransforms.withLoudnessGain(it, gainDb) }
    }

    fun setPreampDb(preampDb: Float) {
        preferences.update { EqStateTransforms.withPreamp(it, preampDb) }
    }

    fun setAutoHeadroom(enabled: Boolean) {
        updateWithHeadroom { EqStateTransforms.withAutoHeadroom(it, enabled) }
    }

    fun applyPreset(preset: EqPreset) {
        updateWithHeadroom { EqStateTransforms.withPresetApplied(it, preset) }
    }

    fun applyPresetById(id: String) {
        viewModelScope.launch {
            presetRepository.findPreset(id)?.let { applyPreset(it) }
        }
    }

    fun resetCurve() {
        updateWithHeadroom { EqStateTransforms.withCurveReset(it) }
    }

    fun setMediaVolumePercent(percent: Int) {
        val clamped = percent.coerceIn(0, 100)
        volumeController.setVolumePercent(clamped)
        mediaVolumePercent.value = clamped
        preferences.update { it.copy(mediaVolumePercent = clamped) }
    }

    fun saveCurrentAsPreset(name: String) {
        viewModelScope.launch {
            val current = preferences.state.value
            val result = presetRepository.createPreset(
                name = name,
                gainsDb = current.referenceGainsDb,
                bassBoostStrength = current.bassBoostStrength,
                loudnessGainDb = current.loudnessGainDb,
                preampDb = current.preampDb
            )
            if (result is PresetOperationResult.Success) {
                preferences.update {
                    EqStateTransforms.withPresetApplied(it, result.preset.toEqPreset())
                }
            }
            _saveResult.value = result
        }
    }

    fun consumeSaveResult() {
        _saveResult.value = null
    }

    fun retryAttachment() {
        sessionManager.retryAttachment()
    }

    // --- Derived headroom values for the UI ---

    fun recommendedPreampDb(state: EqualizerState): Float =
        DbMath.calculateRecommendedPreampDb(
            state.referenceGainsDb, state.loudnessGainDb, state.bassBoostStrength
        )

    fun estimatedHeadroomDb(state: EqualizerState): Float =
        DbMath.estimateHeadroomDb(
            state.referenceGainsDb, state.loudnessGainDb, state.bassBoostStrength, state.preampDb
        )

    /** Recompute the recommended preamp whenever auto-headroom is on. */
    private fun updateWithHeadroom(transform: (PersistedEqState) -> PersistedEqState) {
        preferences.update { current ->
            val next = transform(current)
            if (next.autoHeadroomEnabled) {
                next.copy(
                    preampDb = DbMath.calculateRecommendedPreampDb(
                        next.referenceGainsDb, next.loudnessGainDb, next.bassBoostStrength
                    )
                )
            } else {
                next
            }
        }
    }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[APPLICATION_KEY] as Wra1thEqApplication
                EqualizerViewModel(
                    preferences = app.container.eqPreferencesRepository,
                    sessionManager = app.container.sessionManager,
                    volumeController = app.container.volumeController,
                    presetRepository = app.container.presetRepository,
                    settingsDataStore = app.container.settingsDataStore
                )
            }
        }
    }
}
