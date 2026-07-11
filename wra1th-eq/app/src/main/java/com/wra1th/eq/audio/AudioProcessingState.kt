package com.wra1th.eq.audio

import com.wra1th.eq.model.ProcessingStatus

/** Domain-specific audio-effect errors. Raw stack traces stay out of the primary UI. */
sealed class AudioEffectError {
    data class InitializationFailed(val effect: String, val cause: Throwable) : AudioEffectError()

    data class Unsupported(val effect: String) : AudioEffectError()

    data class InvalidSession(val sessionId: Int) : AudioEffectError()

    data class ApplyFailed(val effect: String, val cause: Throwable) : AudioEffectError()

    fun readableMessage(): String = when (this) {
        is InitializationFailed ->
            "$effect could not be initialized (${cause.javaClass.simpleName}: ${cause.message ?: "no detail"})"
        is Unsupported ->
            "$effect is not supported on this device or audio session"
        is InvalidSession ->
            "Audio session $sessionId is not valid for effect attachment"
        is ApplyFailed ->
            "Applying $effect failed (${cause.javaClass.simpleName}: ${cause.message ?: "no detail"})"
    }
}

/**
 * Snapshot of the whole processing chain: what is attached, what is actually active,
 * and the last error (if any). Drives the status card and the pipeline display.
 */
data class AudioProcessingState(
    val status: ProcessingStatus = ProcessingStatus.WaitingForSession,
    val attachedSessionId: Int? = null,
    val equalizerActive: Boolean = false,
    val bassBoostActive: Boolean = false,
    val loudnessActive: Boolean = false,
    val hasEffectControl: Boolean = false,
    val lastError: String? = null
)
