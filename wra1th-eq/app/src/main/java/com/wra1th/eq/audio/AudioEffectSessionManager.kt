package com.wra1th.eq.audio

import com.wra1th.eq.data.EqPreferencesRepository
import com.wra1th.eq.model.AudioCapabilities
import com.wra1th.eq.model.EqBand
import com.wra1th.eq.model.PersistedEqState
import com.wra1th.eq.model.ProcessingStatus
import com.wra1th.eq.presets.PresetInterpolator
import com.wra1th.eq.util.Logger
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Application-scoped coordinator for the audio-effect chain.
 *
 * - Attaches to a manually entered session ID (diagnostics) or the session-0 global
 *   output mix where the device supports it.
 * - Releases previous effects before attaching new ones.
 * - Reinitializes when the target session changes.
 * - Reports the real attachment state as [ProcessingStatus] — the UI never claims
 *   processing that is not actually active.
 *
 * All effect access is serialized onto a single-threaded dispatcher.
 */
class AudioEffectSessionManager(
    private val controller: AudioEffectController,
    private val capabilityDetector: AudioCapabilityDetector,
    private val preferences: EqPreferencesRepository,
    private val scope: CoroutineScope,
    dispatcher: CoroutineDispatcher = Dispatchers.Default
) {

    companion object {
        /** Session 0 = global output mix. Deprecated by Android, still the only public "everything" hook. */
        const val GLOBAL_SESSION = 0
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private val effectDispatcher = dispatcher.limitedParallelism(1)

    private val _processingState = MutableStateFlow(AudioProcessingState())
    val processingState: StateFlow<AudioProcessingState> = _processingState.asStateFlow()

    private val _status = MutableStateFlow<ProcessingStatus>(ProcessingStatus.WaitingForSession)
    val status: StateFlow<ProcessingStatus> = _status.asStateFlow()

    private val _deviceBands = MutableStateFlow<List<EqBand>>(emptyList())
    val deviceBands: StateFlow<List<EqBand>> = _deviceBands.asStateFlow()

    private val _capabilities = MutableStateFlow(AudioCapabilities())
    val capabilities: StateFlow<AudioCapabilities> = _capabilities.asStateFlow()

    private val _lastErrorMessage = MutableStateFlow<String?>(null)
    val lastErrorMessage: StateFlow<String?> = _lastErrorMessage.asStateFlow()

    /** The session the chain is actually attached to right now, or null. */
    val activeSessionId: Int? get() = controller.attachedSessionId

    private var started = false
    private var lastAppliedState: PersistedEqState? = null
    private var released = false

    /** Detect capabilities and start following the persisted state. Idempotent. */
    fun start() {
        if (started) return
        started = true
        scope.launch(effectDispatcher) {
            _capabilities.value = capabilityDetector.detect(GLOBAL_SESSION)
        }
        scope.launch {
            preferences.state.collect { state ->
                withContext(effectDispatcher) {
                    applyState(state)
                }
            }
        }
    }

    /** Re-attach after the UI resumes (e.g. effects were released when the activity finished). */
    fun ensureAttached() {
        scope.launch(effectDispatcher) {
            released = false
            lastAppliedState = null
            applyState(preferences.state.value)
        }
    }

    /** User-triggered retry from Settings/Diagnostics. Rebuilds the chain from scratch. */
    fun retryAttachment() {
        scope.launch(effectDispatcher) {
            released = false
            controller.release()
            lastAppliedState = null
            _capabilities.value = capabilityDetector.detect(GLOBAL_SESSION)
            applyState(preferences.state.value)
        }
    }

    /** Detach and release every effect. Reported as [ProcessingStatus.Detached]. */
    fun release() {
        scope.launch(effectDispatcher) {
            released = true
            controller.release()
            lastAppliedState = null
            _deviceBands.value = emptyList()
            _status.value = ProcessingStatus.Detached
            publishProcessingState()
        }
    }

    private fun applyState(state: PersistedEqState) {
        if (released) return

        val capabilities = _capabilities.value
        if (!capabilities.anyEffectSupported && capabilities.detectionError != null) {
            _status.value = ProcessingStatus.Unsupported(
                "No supported audio effects: ${capabilities.detectionError}"
            )
            _lastErrorMessage.value = capabilities.detectionError
            publishProcessingState()
            return
        }

        val targetSession = state.manualSessionId ?: GLOBAL_SESSION

        // Reinitialize when the session changed or nothing is attached yet.
        if (!controller.isAttached || controller.attachedSessionId != targetSession) {
            val result = controller.attach(targetSession)
            if (!result.isSuccess) {
                val error = result.errorOrNull()
                _status.value = when (error) {
                    is AudioEffectError.InvalidSession ->
                        ProcessingStatus.Failed(error.readableMessage())
                    is AudioEffectError.Unsupported ->
                        ProcessingStatus.Unsupported(error.readableMessage())
                    is AudioEffectError.InitializationFailed ->
                        ProcessingStatus.Failed(error.readableMessage())
                    else ->
                        ProcessingStatus.Failed("Effect attachment failed")
                }
                _lastErrorMessage.value = error?.readableMessage()
                _deviceBands.value = emptyList()
                lastAppliedState = null
                publishProcessingState()
                return
            }
            lastAppliedState = null // force full re-apply on the fresh chain
        }

        applyParameters(state)

        _deviceBands.value = controller.readDeviceBands()
        controller.lastError?.let { _lastErrorMessage.value = it.readableMessage() }

        _status.value = controller.attachedSessionId?.let { ProcessingStatus.Active(it) }
            ?: ProcessingStatus.WaitingForSession
        publishProcessingState()
        Logger.d(
            "Applied EQ state to session ${controller.attachedSessionId} " +
                "(enabled=${state.enabled}, preset=${state.selectedPresetId})"
        )
    }

    private fun applyParameters(state: PersistedEqState) {
        val previous = lastAppliedState

        if (previous?.referenceGainsDb != state.referenceGainsDb || previous == null) {
            val bands = controller.readDeviceBands()
            if (bands.isNotEmpty()) {
                val deviceGains = PresetInterpolator.deviceGainsFor(
                    referenceGainsDb = state.referenceGainsDb,
                    deviceFrequenciesHz = bands.map { it.frequencyHz },
                    deviceMinDb = bands.first().minimumDb,
                    deviceMaxDb = bands.first().maximumDb
                )
                controller.applyDeviceGains(deviceGains)
            }
        }

        if (previous?.bassBoostStrength != state.bassBoostStrength || previous == null) {
            controller.setBassBoostStrength(state.bassBoostStrength)
        }

        if (previous?.loudnessGainDb != state.loudnessGainDb || previous == null) {
            controller.setLoudnessGainDb(state.loudnessGainDb)
        }

        if (previous?.enabled != state.enabled || previous?.loudnessGainDb != state.loudnessGainDb ||
            previous == null
        ) {
            controller.setEnabled(state.enabled, loudnessOn = state.loudnessGainDb > 0f)
        }

        lastAppliedState = state
    }

    private fun publishProcessingState() {
        _processingState.value = AudioProcessingState(
            status = _status.value,
            attachedSessionId = controller.attachedSessionId,
            equalizerActive = controller.equalizerAttached && controller.isEqualizerEnabled(),
            bassBoostActive = controller.bassBoostAttached,
            loudnessActive = controller.loudnessAttached,
            hasEffectControl = controller.hasControl(),
            lastError = _lastErrorMessage.value
        )
    }
}
