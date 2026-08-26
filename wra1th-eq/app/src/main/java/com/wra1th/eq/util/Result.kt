package com.wra1th.eq.util

import com.wra1th.eq.audio.AudioEffectError

/**
 * Result type for audio-effect operations. Failures carry a domain error rather than
 * a raw exception so the UI can show readable messages.
 */
sealed class OpResult<out T> {
    data class Success<T>(val value: T) : OpResult<T>()
    data class Failure(val error: AudioEffectError) : OpResult<Nothing>()

    val isSuccess: Boolean get() = this is Success

    fun valueOrNull(): T? = (this as? Success)?.value

    fun errorOrNull(): AudioEffectError? = (this as? Failure)?.error

    companion object {
        fun <T> success(value: T): OpResult<T> = Success(value)
        fun failure(error: AudioEffectError): OpResult<Nothing> = Failure(error)
    }
}
