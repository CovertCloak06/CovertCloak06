package com.wra1th.eq.audio

import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import com.wra1th.eq.model.AudioCapabilities
import com.wra1th.eq.util.Logger

/**
 * Probes the platform effect classes to find out what this device actually supports.
 * Every probe constructs the effect defensively and always releases it, so a broken
 * vendor audio stack can never crash the app or leak an effect handle.
 */
class AudioCapabilityDetector {

    fun detect(sessionId: Int = 0): AudioCapabilities {
        var equalizerSupported = false
        var bandCount = 0
        var frequencies = emptyList<Float>()
        var minGainDb = 0f
        var maxGainDb = 0f
        var bassBoostSupported = false
        var bassBoostStrengthSupported = false
        var loudnessSupported = false
        var detectionError: String? = null

        var equalizer: Equalizer? = null
        try {
            equalizer = Equalizer(0, sessionId)
            equalizerSupported = true
            bandCount = equalizer.numberOfBands.toInt()
            frequencies = (0 until bandCount).map { band ->
                // getCenterFreq reports milliHertz.
                equalizer.getCenterFreq(band.toShort()) / 1000f
            }
            val range = equalizer.bandLevelRange
            if (range != null && range.size >= 2) {
                minGainDb = range[0] / 100f
                maxGainDb = range[1] / 100f
            }
        } catch (t: Throwable) {
            detectionError = "Equalizer probe failed: ${t.javaClass.simpleName}: ${t.message}"
            Logger.w("Equalizer capability probe failed", t)
        } finally {
            try {
                equalizer?.release()
            } catch (t: Throwable) {
                Logger.w("Equalizer probe release failed", t)
            }
        }

        var bassBoost: BassBoost? = null
        try {
            bassBoost = BassBoost(0, sessionId)
            bassBoostSupported = true
            bassBoostStrengthSupported = bassBoost.strengthSupported
        } catch (t: Throwable) {
            if (detectionError == null) {
                detectionError = "BassBoost probe failed: ${t.javaClass.simpleName}: ${t.message}"
            }
            Logger.w("BassBoost capability probe failed", t)
        } finally {
            try {
                bassBoost?.release()
            } catch (t: Throwable) {
                Logger.w("BassBoost probe release failed", t)
            }
        }

        var loudness: LoudnessEnhancer? = null
        try {
            loudness = LoudnessEnhancer(sessionId)
            loudnessSupported = true
        } catch (t: Throwable) {
            if (detectionError == null) {
                detectionError = "LoudnessEnhancer probe failed: ${t.javaClass.simpleName}: ${t.message}"
            }
            Logger.w("LoudnessEnhancer capability probe failed", t)
        } finally {
            try {
                loudness?.release()
            } catch (t: Throwable) {
                Logger.w("LoudnessEnhancer probe release failed", t)
            }
        }

        return AudioCapabilities(
            equalizerSupported = equalizerSupported,
            bandCount = bandCount,
            bandFrequenciesHz = frequencies,
            minGainDb = minGainDb,
            maxGainDb = maxGainDb,
            bassBoostSupported = bassBoostSupported,
            bassBoostStrengthSupported = bassBoostStrengthSupported,
            loudnessEnhancerSupported = loudnessSupported,
            detectionError = detectionError
        )
    }
}
