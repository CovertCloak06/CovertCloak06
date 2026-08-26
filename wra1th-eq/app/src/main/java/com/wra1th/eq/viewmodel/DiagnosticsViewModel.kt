package com.wra1th.eq.viewmodel

import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.wra1th.eq.BuildConfig
import com.wra1th.eq.Wra1thEqApplication
import com.wra1th.eq.audio.AudioEffectSessionManager
import com.wra1th.eq.audio.AudioProcessingState
import com.wra1th.eq.audio.AudioVolumeController
import com.wra1th.eq.data.EqPreferencesRepository
import com.wra1th.eq.model.AudioCapabilities
import com.wra1th.eq.model.EqBand
import com.wra1th.eq.model.ProcessingStatus
import com.wra1th.eq.presets.PresetInterpolator
import com.wra1th.eq.util.FrequencyFormatter
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import java.util.Locale

data class DiagnosticsUiState(
    val manufacturer: String = Build.MANUFACTURER ?: "unknown",
    val model: String = Build.MODEL ?: "unknown",
    val androidVersion: String = "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
    val appVersion: String = BuildConfig.VERSION_NAME,
    val capabilities: AudioCapabilities = AudioCapabilities(),
    val processing: AudioProcessingState = AudioProcessingState(),
    val activeSessionId: Int? = null,
    val manualSessionId: Int? = null,
    val deviceBands: List<EqBand> = emptyList(),
    val mappedDeviceGainsDb: List<Float> = emptyList(),
    val mediaVolumeIndex: Int = 0,
    val mediaVolumeMaxIndex: Int = 0,
    val lastError: String? = null
)

class DiagnosticsViewModel(
    sessionManager: AudioEffectSessionManager,
    preferences: EqPreferencesRepository,
    private val volumeController: AudioVolumeController
) : ViewModel() {

    val state: StateFlow<DiagnosticsUiState> = combine(
        sessionManager.capabilities,
        sessionManager.processingState,
        sessionManager.deviceBands,
        preferences.state
    ) { capabilities, processing, bands, eqState ->
        val mappedGains = if (bands.isNotEmpty()) {
            PresetInterpolator.deviceGainsFor(
                referenceGainsDb = eqState.referenceGainsDb,
                deviceFrequenciesHz = bands.map { it.frequencyHz },
                deviceMinDb = bands.first().minimumDb,
                deviceMaxDb = bands.first().maximumDb
            )
        } else {
            emptyList()
        }
        DiagnosticsUiState(
            capabilities = capabilities,
            processing = processing,
            activeSessionId = processing.attachedSessionId,
            manualSessionId = eqState.manualSessionId,
            deviceBands = bands,
            mappedDeviceGainsDb = mappedGains,
            mediaVolumeIndex = volumeController.currentIndex(),
            mediaVolumeMaxIndex = volumeController.maxIndexValue(),
            lastError = processing.lastError
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = DiagnosticsUiState()
    )

    /** Plain-text report for the copy-diagnostics button. */
    fun buildDiagnosticsReport(current: DiagnosticsUiState): String = buildString {
        appendLine("Wra1th EQ diagnostics")
        appendLine("app_version=${current.appVersion}")
        appendLine("manufacturer=${current.manufacturer}")
        appendLine("model=${current.model}")
        appendLine("android=${current.androidVersion}")
        appendLine("processing_status=${describeStatus(current.processing.status)}")
        appendLine("active_session_id=${current.activeSessionId ?: "none"}")
        appendLine("manual_session_id=${current.manualSessionId ?: "auto (session 0)"}")
        appendLine("has_effect_control=${current.processing.hasEffectControl}")
        appendLine("equalizer_supported=${current.capabilities.equalizerSupported}")
        appendLine("equalizer_bands=${current.capabilities.bandCount}")
        appendLine(
            "equalizer_centers=" + current.capabilities.bandFrequenciesHz
                .joinToString(",") { FrequencyFormatter.format(it) }
        )
        appendLine(
            "band_gain_range_db=${current.capabilities.minGainDb}..${current.capabilities.maxGainDb}"
        )
        appendLine("bassboost_supported=${current.capabilities.bassBoostSupported}")
        appendLine("bassboost_strength_supported=${current.capabilities.bassBoostStrengthSupported}")
        appendLine("loudness_supported=${current.capabilities.loudnessEnhancerSupported}")
        appendLine("media_volume_index=${current.mediaVolumeIndex}/${current.mediaVolumeMaxIndex}")
        appendLine(
            "mapped_device_gains_db=" + current.mappedDeviceGainsDb
                .joinToString(",") { String.format(Locale.US, "%.1f", it) }
        )
        appendLine("last_error=${current.lastError ?: "none"}")
    }

    private fun describeStatus(status: ProcessingStatus): String = when (status) {
        is ProcessingStatus.Active -> "active(session=${status.sessionId})"
        is ProcessingStatus.Failed -> "failed(${status.message})"
        is ProcessingStatus.Unsupported -> "unsupported(${status.reason})"
        ProcessingStatus.Detached -> "detached"
        ProcessingStatus.WaitingForSession -> "waiting_for_session"
    }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[APPLICATION_KEY] as Wra1thEqApplication
                DiagnosticsViewModel(
                    sessionManager = app.container.sessionManager,
                    preferences = app.container.eqPreferencesRepository,
                    volumeController = app.container.volumeController
                )
            }
        }
    }
}
