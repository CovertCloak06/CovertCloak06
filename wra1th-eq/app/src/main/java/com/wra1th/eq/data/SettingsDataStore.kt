package com.wra1th.eq.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException

private val Context.wra1thDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "wra1th_eq_settings"
)

/** Settings-screen preferences, persisted individually. */
data class AppSettings(
    val launchWithEqEnabled: Boolean = true,
    val restoreLastPreset: Boolean = true,
    val showGainValues: Boolean = true,
    val hapticFeedback: Boolean = true,
    val compactSliders: Boolean = false,
    val confirmPresetDeletion: Boolean = true
)

/**
 * Single owner of the Preferences DataStore. Repositories go through this class;
 * composables never touch it directly.
 */
class SettingsDataStore(context: Context) {

    private val dataStore = context.applicationContext.wra1thDataStore

    object Keys {
        val EQ_STATE_JSON = stringPreferencesKey("eq_state_json")
        val USER_PRESETS_JSON = stringPreferencesKey("user_presets_json")
        val LAUNCH_WITH_EQ_ENABLED = booleanPreferencesKey("launch_with_eq_enabled")
        val RESTORE_LAST_PRESET = booleanPreferencesKey("restore_last_preset")
        val SHOW_GAIN_VALUES = booleanPreferencesKey("show_gain_values")
        val HAPTIC_FEEDBACK = booleanPreferencesKey("haptic_feedback")
        val COMPACT_SLIDERS = booleanPreferencesKey("compact_sliders")
        val CONFIRM_PRESET_DELETION = booleanPreferencesKey("confirm_preset_deletion")
    }

    /** Raw preferences with IO errors degraded to defaults instead of crashes. */
    val data: Flow<Preferences> = dataStore.data.catch { throwable ->
        if (throwable is IOException) emit(emptyPreferences()) else throw throwable
    }

    val appSettings: Flow<AppSettings> = data.map { prefs ->
        AppSettings(
            launchWithEqEnabled = prefs[Keys.LAUNCH_WITH_EQ_ENABLED] ?: true,
            restoreLastPreset = prefs[Keys.RESTORE_LAST_PRESET] ?: true,
            showGainValues = prefs[Keys.SHOW_GAIN_VALUES] ?: true,
            hapticFeedback = prefs[Keys.HAPTIC_FEEDBACK] ?: true,
            compactSliders = prefs[Keys.COMPACT_SLIDERS] ?: false,
            confirmPresetDeletion = prefs[Keys.CONFIRM_PRESET_DELETION] ?: true
        )
    }

    suspend fun setBoolean(key: Preferences.Key<Boolean>, value: Boolean) {
        dataStore.edit { prefs -> prefs[key] = value }
    }

    suspend fun setString(key: Preferences.Key<String>, value: String) {
        dataStore.edit { prefs -> prefs[key] = value }
    }

    suspend fun remove(key: Preferences.Key<*>) {
        dataStore.edit { prefs -> prefs.remove(key) }
    }

    /** Reset only the settings-screen preferences (not presets / EQ state). */
    suspend fun resetAppSettings() {
        dataStore.edit { prefs ->
            prefs.remove(Keys.LAUNCH_WITH_EQ_ENABLED)
            prefs.remove(Keys.RESTORE_LAST_PRESET)
            prefs.remove(Keys.SHOW_GAIN_VALUES)
            prefs.remove(Keys.HAPTIC_FEEDBACK)
            prefs.remove(Keys.COMPACT_SLIDERS)
            prefs.remove(Keys.CONFIRM_PRESET_DELETION)
        }
    }
}
