package com.wra1th.eq.audio

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.wra1th.eq.util.Logger
import com.wra1th.eq.util.VolumeMath
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Media (STREAM_MUSIC) volume only. Never touches call, ring, alarm, or notification
 * streams. The 0–100% scale maps onto the device's real step count — no fixed
 * 15-step assumption.
 */
class AudioVolumeController(context: Context) {

    private val appContext = context.applicationContext
    private val audioManager =
        appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private companion object {
        const val VOLUME_CHANGED_ACTION = "android.media.VOLUME_CHANGED_ACTION"
        const val EXTRA_VOLUME_STREAM_TYPE = "android.media.EXTRA_VOLUME_STREAM_TYPE"
    }

    private fun minIndex(): Int = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        try {
            audioManager.getStreamMinVolume(AudioManager.STREAM_MUSIC)
        } catch (t: Throwable) {
            0
        }
    } else {
        0
    }

    private fun maxIndex(): Int = try {
        audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    } catch (t: Throwable) {
        15
    }

    fun currentIndex(): Int = try {
        audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
    } catch (t: Throwable) {
        0
    }

    fun maxIndexValue(): Int = maxIndex()

    fun getVolumePercent(): Int =
        VolumeMath.indexToPercent(currentIndex(), minIndex(), maxIndex())

    fun setVolumePercent(percent: Int) {
        try {
            val index = VolumeMath.percentToIndex(percent, minIndex(), maxIndex())
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, index, 0)
        } catch (t: Throwable) {
            // Some devices restrict volume changes (e.g. Do Not Disturb) — never crash.
            Logger.w("Setting media volume failed", t)
        }
    }

    /**
     * Emits the media-volume percentage whenever any app or the hardware keys change it.
     * The receiver is unregistered when the collector is cancelled — no leaks.
     */
    fun volumeChanges(): Flow<Int> = callbackFlow {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val stream = intent?.getIntExtra(EXTRA_VOLUME_STREAM_TYPE, -1) ?: -1
                if (stream == AudioManager.STREAM_MUSIC) {
                    trySend(getVolumePercent())
                }
            }
        }
        try {
            ContextCompat.registerReceiver(
                appContext,
                receiver,
                IntentFilter(VOLUME_CHANGED_ACTION),
                ContextCompat.RECEIVER_NOT_EXPORTED
            )
        } catch (t: Throwable) {
            Logger.w("Volume receiver registration failed", t)
        }
        awaitClose {
            try {
                appContext.unregisterReceiver(receiver)
            } catch (t: Throwable) {
                Logger.w("Volume receiver unregistration failed", t)
            }
        }
    }
}
