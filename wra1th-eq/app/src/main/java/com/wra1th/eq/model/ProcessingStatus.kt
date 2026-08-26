package com.wra1th.eq.model

/**
 * The live state of the audio-effect chain. Shown prominently in the UI —
 * Wra1th EQ never pretends to process audio it is not actually attached to.
 */
sealed interface ProcessingStatus {
    data object WaitingForSession : ProcessingStatus
    data class Active(val sessionId: Int) : ProcessingStatus
    data class Unsupported(val reason: String) : ProcessingStatus
    data class Failed(val message: String) : ProcessingStatus
    data object Detached : ProcessingStatus
}
