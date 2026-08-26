package com.wra1th.eq.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.wra1th.eq.Wra1thEqApplication
import com.wra1th.eq.audio.AudioEffectSessionManager
import com.wra1th.eq.data.AppSettings
import com.wra1th.eq.data.EqPreferencesRepository
import com.wra1th.eq.data.EqPresetRepository
import com.wra1th.eq.data.SettingsDataStore
import com.wra1th.eq.model.ProcessingStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SettingsUiState(
    val settings: AppSettings = AppSettings(),
    val autoHeadroomEnabled: Boolean = true,
    val manualSessionId: Int? = null,
    val processingStatus: ProcessingStatus = ProcessingStatus.WaitingForSession
)

class SettingsViewModel(
    private val settingsDataStore: SettingsDataStore,
    private val preferences: EqPreferencesRepository,
    private val presetRepository: EqPresetRepository,
    private val sessionManager: AudioEffectSessionManager
) : ViewModel() {

    val state: StateFlow<SettingsUiState> = combine(
        settingsDataStore.appSettings,
        preferences.state,
        sessionManager.status
    ) { settings, eqState, status ->
        SettingsUiState(
            settings = settings,
            autoHeadroomEnabled = eqState.autoHeadroomEnabled,
            manualSessionId = eqState.manualSessionId,
            processingStatus = status
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = SettingsUiState()
    )

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun consumeMessage() {
        _message.value = null
    }

    private fun setBoolean(key: androidx.datastore.preferences.core.Preferences.Key<Boolean>, value: Boolean) {
        viewModelScope.launch { settingsDataStore.setBoolean(key, value) }
    }

    fun setLaunchWithEqEnabled(value: Boolean) =
        setBoolean(SettingsDataStore.Keys.LAUNCH_WITH_EQ_ENABLED, value)

    fun setRestoreLastPreset(value: Boolean) =
        setBoolean(SettingsDataStore.Keys.RESTORE_LAST_PRESET, value)

    fun setShowGainValues(value: Boolean) =
        setBoolean(SettingsDataStore.Keys.SHOW_GAIN_VALUES, value)

    fun setHapticFeedback(value: Boolean) =
        setBoolean(SettingsDataStore.Keys.HAPTIC_FEEDBACK, value)

    fun setCompactSliders(value: Boolean) =
        setBoolean(SettingsDataStore.Keys.COMPACT_SLIDERS, value)

    fun setConfirmPresetDeletion(value: Boolean) =
        setBoolean(SettingsDataStore.Keys.CONFIRM_PRESET_DELETION, value)

    fun setAutoHeadroom(value: Boolean) {
        preferences.update { it.copy(autoHeadroomEnabled = value) }
    }

    /**
     * Manual audio-session ID for diagnostics. Null returns to the session-0
     * global-mix fallback. The session manager reinitializes automatically.
     */
    fun setManualSessionId(sessionId: Int?) {
        preferences.update { it.copy(manualSessionId = sessionId) }
        _message.value = if (sessionId == null) {
            "Using global output mix (session 0)"
        } else {
            "Attaching to session $sessionId"
        }
    }

    fun retryAttachment() {
        sessionManager.retryAttachment()
        _message.value = "Reattaching audio effects…"
    }

    fun resetApplicationSettings() {
        viewModelScope.launch {
            settingsDataStore.resetAppSettings()
            preferences.resetToDefaults()
            _message.value = "Application settings reset"
        }
    }

    fun resetCustomPresets() {
        viewModelScope.launch {
            presetRepository.resetToFactory()
            _message.value = "Custom presets removed"
        }
    }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[APPLICATION_KEY] as Wra1thEqApplication
                SettingsViewModel(
                    settingsDataStore = app.container.settingsDataStore,
                    preferences = app.container.eqPreferencesRepository,
                    presetRepository = app.container.presetRepository,
                    sessionManager = app.container.sessionManager
                )
            }
        }
    }
}
