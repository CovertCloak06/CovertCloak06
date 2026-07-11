package com.wra1th.eq.data

import com.wra1th.eq.model.UserEqPreset
import com.wra1th.eq.util.Logger
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** Versioned envelope so preset-storage migrations can be added later. */
@Serializable
data class UserPresetsEnvelope(
    val version: Int = CURRENT_VERSION,
    val presets: List<UserEqPreset> = emptyList()
) {
    companion object {
        const val CURRENT_VERSION = 1
    }
}

/**
 * Storage abstraction for user presets. The production implementation is DataStore-backed;
 * tests use [InMemoryUserPresetStorage].
 */
interface UserPresetStorage {
    val presets: Flow<List<UserEqPreset>>
    suspend fun save(presets: List<UserEqPreset>)
}

class DataStoreUserPresetStorage(
    private val settings: SettingsDataStore
) : UserPresetStorage {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    override val presets: Flow<List<UserEqPreset>> = settings.data.map { prefs ->
        val raw = prefs[SettingsDataStore.Keys.USER_PRESETS_JSON] ?: return@map emptyList()
        try {
            json.decodeFromString(UserPresetsEnvelope.serializer(), raw).presets
        } catch (t: Throwable) {
            Logger.w("User presets were unreadable; treating as empty", t)
            emptyList()
        }
    }

    override suspend fun save(presets: List<UserEqPreset>) {
        settings.setString(
            SettingsDataStore.Keys.USER_PRESETS_JSON,
            json.encodeToString(UserPresetsEnvelope.serializer(), UserPresetsEnvelope(presets = presets))
        )
    }
}

/** In-memory implementation for unit tests. */
class InMemoryUserPresetStorage(
    initial: List<UserEqPreset> = emptyList()
) : UserPresetStorage {

    private val state = MutableStateFlow(initial)

    override val presets: Flow<List<UserEqPreset>> = state

    override suspend fun save(presets: List<UserEqPreset>) {
        state.value = presets
    }
}
