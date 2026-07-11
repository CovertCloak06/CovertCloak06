package com.wra1th.eq.audio

import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import com.wra1th.eq.model.EqBand
import com.wra1th.eq.util.DbMath
import com.wra1th.eq.util.Logger
import com.wra1th.eq.util.OpResult

/**
 * Owns the platform effect instances for one audio session. Every construction and
 * every parameter write is wrapped: a missing effect, a stolen effect engine, or an
 * invalidated session degrades gracefully instead of crashing.
 *
 * Not thread-safe on its own — [AudioEffectSessionManager] serializes access.
 */
class AudioEffectController {

    private companion object {
        const val EFFECT_PRIORITY = 0
    }

    private var equalizer: Equalizer? = null
    private var bassBoost: BassBoost? = null
    private var loudnessEnhancer: LoudnessEnhancer? = null

    var attachedSessionId: Int? = null
        private set

    var lastError: AudioEffectError? = null
        private set

    val isAttached: Boolean
        get() = equalizer != null || bassBoost != null || loudnessEnhancer != null

    val equalizerAttached: Boolean get() = equalizer != null
    val bassBoostAttached: Boolean get() = bassBoost != null
    val loudnessAttached: Boolean get() = loudnessEnhancer != null

    val bassBoostStrengthSupported: Boolean
        get() = try {
            bassBoost?.strengthSupported ?: false
        } catch (t: Throwable) {
            false
        }

    /**
     * Release any previous effects, then attach a fresh chain to [sessionId].
     * Succeeds if at least one effect could be constructed.
     */
    fun attach(sessionId: Int): OpResult<Unit> {
        release()
        if (sessionId < 0) {
            val error = AudioEffectError.InvalidSession(sessionId)
            lastError = error
            return OpResult.failure(error)
        }

        var firstFailure: AudioEffectError? = null

        equalizer = try {
            Equalizer(EFFECT_PRIORITY, sessionId)
        } catch (t: Throwable) {
            firstFailure = AudioEffectError.InitializationFailed("Equalizer", t)
            Logger.w("Equalizer attach failed for session $sessionId", t)
            null
        }

        bassBoost = try {
            BassBoost(EFFECT_PRIORITY, sessionId)
        } catch (t: Throwable) {
            if (firstFailure == null) {
                firstFailure = AudioEffectError.InitializationFailed("BassBoost", t)
            }
            Logger.w("BassBoost attach failed for session $sessionId", t)
            null
        }

        loudnessEnhancer = try {
            LoudnessEnhancer(sessionId)
        } catch (t: Throwable) {
            if (firstFailure == null) {
                firstFailure = AudioEffectError.InitializationFailed("LoudnessEnhancer", t)
            }
            Logger.w("LoudnessEnhancer attach failed for session $sessionId", t)
            null
        }

        return if (isAttached) {
            attachedSessionId = sessionId
            lastError = firstFailure // partial attachment still reports what failed
            OpResult.success(Unit)
        } else {
            attachedSessionId = null
            val error = firstFailure ?: AudioEffectError.Unsupported("Audio effects")
            lastError = error
            OpResult.failure(error)
        }
    }

    /** Read the actual device bands from the attached equalizer. */
    fun readDeviceBands(): List<EqBand> {
        val eq = equalizer ?: return emptyList()
        return try {
            val count = eq.numberOfBands.toInt()
            val range = eq.bandLevelRange
            val minDb = if (range != null && range.size >= 2) range[0] / 100f else -15f
            val maxDb = if (range != null && range.size >= 2) range[1] / 100f else 15f
            (0 until count).map { index ->
                EqBand(
                    index = index,
                    frequencyHz = eq.getCenterFreq(index.toShort()) / 1000f,
                    gainDb = eq.getBandLevel(index.toShort()) / 100f,
                    minimumDb = minDb,
                    maximumDb = maxDb
                )
            }
        } catch (t: Throwable) {
            lastError = AudioEffectError.ApplyFailed("Equalizer band read", t)
            Logger.w("Reading device bands failed", t)
            emptyList()
        }
    }

    /** Apply per-band device gains (already mapped from the reference curve), clamped to range. */
    fun applyDeviceGains(gainsDb: List<Float>): OpResult<Unit> {
        val eq = equalizer
            ?: return OpResult.failure(AudioEffectError.Unsupported("Equalizer"))
        return try {
            val count = eq.numberOfBands.toInt()
            val range = eq.bandLevelRange
            val minMb = if (range != null && range.size >= 2) range[0].toInt() else -1500
            val maxMb = if (range != null && range.size >= 2) range[1].toInt() else 1500
            for (index in 0 until minOf(count, gainsDb.size)) {
                val millibels = DbMath.dbToMillibels(gainsDb[index]).coerceIn(minMb, maxMb)
                eq.setBandLevel(index.toShort(), millibels.toShort())
            }
            OpResult.success(Unit)
        } catch (t: Throwable) {
            val error = AudioEffectError.ApplyFailed("Equalizer", t)
            lastError = error
            Logger.w("Applying equalizer gains failed", t)
            OpResult.failure(error)
        }
    }

    fun setBassBoostStrength(strength: Int): OpResult<Unit> {
        val boost = bassBoost
            ?: return OpResult.failure(AudioEffectError.Unsupported("BassBoost"))
        return try {
            if (boost.strengthSupported) {
                boost.setStrength(strength.coerceIn(0, 1000).toShort())
                OpResult.success(Unit)
            } else {
                OpResult.failure(AudioEffectError.Unsupported("BassBoost strength"))
            }
        } catch (t: Throwable) {
            val error = AudioEffectError.ApplyFailed("BassBoost", t)
            lastError = error
            Logger.w("Applying bass boost failed", t)
            OpResult.failure(error)
        }
    }

    fun setLoudnessGainDb(gainDb: Float): OpResult<Unit> {
        val loudness = loudnessEnhancer
            ?: return OpResult.failure(AudioEffectError.Unsupported("LoudnessEnhancer"))
        return try {
            loudness.setTargetGain(DbMath.dbToMillibels(gainDb.coerceIn(0f, DbMath.MAX_LOUDNESS_DB)))
            OpResult.success(Unit)
        } catch (t: Throwable) {
            val error = AudioEffectError.ApplyFailed("LoudnessEnhancer", t)
            lastError = error
            Logger.w("Applying loudness gain failed", t)
            OpResult.failure(error)
        }
    }

    /**
     * Master enable/bypass for the whole chain. [loudnessOn] lets loudness be
     * disabled independently even while the chain is enabled.
     */
    fun setEnabled(enabled: Boolean, loudnessOn: Boolean = true): OpResult<Unit> {
        if (!isAttached) return OpResult.failure(AudioEffectError.Unsupported("Audio effects"))
        var failure: AudioEffectError? = null
        try {
            equalizer?.enabled = enabled
        } catch (t: Throwable) {
            failure = AudioEffectError.ApplyFailed("Equalizer enable", t)
            Logger.w("Toggling equalizer failed", t)
        }
        try {
            bassBoost?.enabled = enabled
        } catch (t: Throwable) {
            if (failure == null) failure = AudioEffectError.ApplyFailed("BassBoost enable", t)
            Logger.w("Toggling bass boost failed", t)
        }
        try {
            loudnessEnhancer?.enabled = enabled && loudnessOn
        } catch (t: Throwable) {
            if (failure == null) failure = AudioEffectError.ApplyFailed("LoudnessEnhancer enable", t)
            Logger.w("Toggling loudness failed", t)
        }
        failure?.let { lastError = it }
        return if (failure == null) OpResult.success(Unit) else OpResult.failure(failure)
    }

    /** Whether this app currently holds control of the equalizer engine. */
    fun hasControl(): Boolean = try {
        equalizer?.hasControl() ?: false
    } catch (t: Throwable) {
        false
    }

    fun isEqualizerEnabled(): Boolean = try {
        equalizer?.enabled ?: false
    } catch (t: Throwable) {
        false
    }

    /** Explicitly release every effect handle. Safe to call repeatedly. */
    fun release() {
        try {
            equalizer?.release()
        } catch (t: Throwable) {
            Logger.w("Equalizer release failed", t)
        }
        try {
            bassBoost?.release()
        } catch (t: Throwable) {
            Logger.w("BassBoost release failed", t)
        }
        try {
            loudnessEnhancer?.release()
        } catch (t: Throwable) {
            Logger.w("LoudnessEnhancer release failed", t)
        }
        equalizer = null
        bassBoost = null
        loudnessEnhancer = null
        attachedSessionId = null
    }
}
