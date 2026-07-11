package com.wra1th.eq.viewmodel

import android.app.Application
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.wra1th.eq.Wra1thEqApplication
import com.wra1th.eq.data.EqPreferencesRepository
import com.wra1th.eq.data.EqPresetRepository
import com.wra1th.eq.data.PresetOperationResult
import com.wra1th.eq.data.SettingsDataStore
import com.wra1th.eq.model.EqPreset
import com.wra1th.eq.model.EqStateTransforms
import com.wra1th.eq.model.UserEqPreset
import com.wra1th.eq.util.DbMath
import com.wra1th.eq.util.Logger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class PresetsUiState(
    val builtInPresets: List<EqPreset> = emptyList(),
    val userPresets: List<UserEqPreset> = emptyList(),
    val activePresetId: String = "flat",
    val confirmDeletion: Boolean = true
)

/**
 * Presets screen: apply/duplicate/rename/delete/import/export. File access uses the
 * Storage Access Framework — the composable only supplies the picked Uri.
 */
class PresetsViewModel(
    private val application: Application,
    private val presetRepository: EqPresetRepository,
    private val preferences: EqPreferencesRepository,
    settingsDataStore: SettingsDataStore
) : ViewModel() {

    val state: StateFlow<PresetsUiState> = combine(
        presetRepository.userPresets,
        preferences.state,
        settingsDataStore.appSettings
    ) { userPresets, eqState, settings ->
        PresetsUiState(
            builtInPresets = presetRepository.builtInPresets,
            userPresets = userPresets,
            activePresetId = eqState.selectedPresetId,
            confirmDeletion = settings.confirmPresetDeletion
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = PresetsUiState(builtInPresets = presetRepository.builtInPresets)
    )

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun consumeMessage() {
        _message.value = null
    }

    fun applyPreset(preset: EqPreset) {
        preferences.update { current ->
            val next = EqStateTransforms.withPresetApplied(current, preset)
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
        _message.value = "Applied \"${preset.name}\""
    }

    fun applyUserPreset(preset: UserEqPreset) = applyPreset(preset.toEqPreset())

    fun duplicatePreset(id: String) {
        viewModelScope.launch {
            report(presetRepository.duplicatePreset(id), "Duplicated as")
        }
    }

    fun renamePreset(id: String, newName: String) {
        viewModelScope.launch {
            report(presetRepository.renamePreset(id, newName), "Renamed to")
        }
    }

    fun deletePreset(id: String) {
        viewModelScope.launch {
            when (val result = presetRepository.deletePreset(id)) {
                is PresetOperationResult.Success ->
                    _message.value = "Deleted \"${result.preset.name}\""
                is PresetOperationResult.Failure ->
                    _message.value = result.reason
            }
        }
    }

    fun resetToFactory() {
        viewModelScope.launch {
            presetRepository.resetToFactory()
            _message.value = "Custom presets removed"
        }
    }

    /** Write the preset as JSON to a SAF-picked document. */
    fun exportPreset(preset: UserEqPreset, target: Uri) {
        viewModelScope.launch {
            val outcome = withContext(Dispatchers.IO) {
                try {
                    application.contentResolver.openOutputStream(target)?.use { stream ->
                        stream.write(presetRepository.exportToJson(preset).toByteArray(Charsets.UTF_8))
                    } ?: return@withContext "Could not open the selected file"
                    null
                } catch (t: Throwable) {
                    Logger.w("Preset export failed", t)
                    "Export failed: ${t.message ?: t.javaClass.simpleName}"
                }
            }
            _message.value = outcome ?: "Exported \"${preset.name}\""
        }
    }

    /** Read, validate, and import a preset from a SAF-picked document. */
    fun importPreset(source: Uri) {
        viewModelScope.launch {
            val raw = withContext(Dispatchers.IO) {
                try {
                    application.contentResolver.openInputStream(source)?.use { stream ->
                        stream.readBytes().toString(Charsets.UTF_8)
                    }
                } catch (t: Throwable) {
                    Logger.w("Preset import read failed", t)
                    null
                }
            }
            if (raw == null) {
                _message.value = "Could not read the selected file"
                return@launch
            }
            report(presetRepository.importPreset(raw), "Imported")
        }
    }

    private fun report(result: PresetOperationResult, successVerb: String) {
        _message.value = when (result) {
            is PresetOperationResult.Success -> "$successVerb \"${result.preset.name}\""
            is PresetOperationResult.Failure -> result.reason
        }
    }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[APPLICATION_KEY] as Wra1thEqApplication
                PresetsViewModel(
                    application = app,
                    presetRepository = app.container.presetRepository,
                    preferences = app.container.eqPreferencesRepository,
                    settingsDataStore = app.container.settingsDataStore
                )
            }
        }
    }
}
