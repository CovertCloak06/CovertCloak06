package com.wra1th.eq

import android.app.Application
import android.content.Context
import com.wra1th.eq.audio.AudioCapabilityDetector
import com.wra1th.eq.audio.AudioEffectController
import com.wra1th.eq.audio.AudioEffectSessionManager
import com.wra1th.eq.audio.AudioVolumeController
import com.wra1th.eq.data.DataStoreUserPresetStorage
import com.wra1th.eq.data.EqPreferencesRepository
import com.wra1th.eq.data.EqPresetRepository
import com.wra1th.eq.data.SettingsDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Manual dependency graph — no DI framework needed at this size. Everything here is
 * application-scoped; ViewModels receive dependencies through their factories.
 */
class AppContainer(context: Context) {

    val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val settingsDataStore = SettingsDataStore(context)
    val eqPreferencesRepository = EqPreferencesRepository(settingsDataStore, applicationScope)
    val userPresetStorage = DataStoreUserPresetStorage(settingsDataStore)
    val presetRepository = EqPresetRepository(userPresetStorage)

    val volumeController = AudioVolumeController(context)
    val capabilityDetector = AudioCapabilityDetector()
    val effectController = AudioEffectController()
    val sessionManager = AudioEffectSessionManager(
        controller = effectController,
        capabilityDetector = capabilityDetector,
        preferences = eqPreferencesRepository,
        scope = applicationScope
    )

    fun start() {
        applicationScope.launch {
            eqPreferencesRepository.load()
            sessionManager.start()
        }
    }
}

class Wra1thEqApplication : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        container.start()
    }
}
