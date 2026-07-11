package com.wra1th.eq.data

import com.wra1th.eq.model.PersistedEqState
import com.wra1th.eq.util.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

/**
 * In-memory source of truth for the equalizer state, mirrored to DataStore as
 * versioned JSON. Mutations are immediate (StateFlow) so sliders feel live;
 * persistence is debounced so drags don't hammer disk.
 */
class EqPreferencesRepository(
    private val settings: SettingsDataStore,
    scope: CoroutineScope
) {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _state = MutableStateFlow(PersistedEqState())
    val state: StateFlow<PersistedEqState> = _state.asStateFlow()

    @Volatile
    var isLoaded: Boolean = false
        private set

    init {
        @OptIn(FlowPreview::class)
        scope.launch {
            _state
                .drop(1)
                .debounce(PERSIST_DEBOUNCE_MS)
                .collect { persist(it) }
        }
    }

    /**
     * Load the persisted state once at startup, honoring the launch preferences:
     * "Launch with EQ enabled" forces enabled=true, and disabling
     * "Restore last preset" starts from a flat default curve.
     */
    suspend fun load() {
        if (isLoaded) return
        val prefs = settings.data.first()
        val restored = prefs[SettingsDataStore.Keys.EQ_STATE_JSON]?.let { raw ->
            try {
                json.decodeFromString(PersistedEqState.serializer(), raw)
            } catch (t: Throwable) {
                Logger.w("Persisted EQ state was unreadable; starting fresh", t)
                null
            }
        } ?: PersistedEqState()

        val launchEnabled = prefs[SettingsDataStore.Keys.LAUNCH_WITH_EQ_ENABLED] ?: true
        val restoreLastPreset = prefs[SettingsDataStore.Keys.RESTORE_LAST_PRESET] ?: true

        var initial = if (restoreLastPreset) {
            restored
        } else {
            PersistedEqState(manualSessionId = restored.manualSessionId)
        }
        if (launchEnabled) {
            initial = initial.copy(enabled = true)
        }
        _state.value = initial
        isLoaded = true
    }

    /** Apply a pure transform to the current state. */
    fun update(transform: (PersistedEqState) -> PersistedEqState) {
        _state.update(transform)
    }

    /** Reset the whole equalizer state (keeps the manual session ID off by design). */
    fun resetToDefaults() {
        _state.value = PersistedEqState()
    }

    private suspend fun persist(state: PersistedEqState) {
        try {
            settings.setString(
                SettingsDataStore.Keys.EQ_STATE_JSON,
                json.encodeToString(PersistedEqState.serializer(), state)
            )
        } catch (t: Throwable) {
            Logger.e("Persisting EQ state failed", t)
        }
    }

    private companion object {
        const val PERSIST_DEBOUNCE_MS = 400L
    }
}
