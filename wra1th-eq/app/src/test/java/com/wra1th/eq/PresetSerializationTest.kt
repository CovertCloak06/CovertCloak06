package com.wra1th.eq

import com.wra1th.eq.data.EqPresetRepository
import com.wra1th.eq.data.InMemoryUserPresetStorage
import com.wra1th.eq.data.PresetOperationResult
import com.wra1th.eq.model.PersistedEqState
import com.wra1th.eq.model.UserEqPreset
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PresetSerializationTest {

    private val repository = EqPresetRepository(InMemoryUserPresetStorage())

    private val preset = UserEqPreset(
        id = "abc-123",
        name = "Night Drive",
        gainsDb = listOf(4f, 3f, 1f, -1f, -2f, 0f, 2f, 4f, 5f, 4f),
        bassBoostStrength = 300,
        loudnessGainDb = 2f,
        preampDb = -6f,
        createdAtEpochMs = 1_700_000_000_000,
        updatedAtEpochMs = 1_700_000_000_000
    )

    @Test
    fun `export then import round-trips every field`() {
        val exported = repository.exportToJson(preset)
        val parsed = repository.parseImportedJson(exported)

        assertTrue(parsed is PresetOperationResult.Success)
        val roundTripped = (parsed as PresetOperationResult.Success).preset
        assertEquals(preset, roundTripped)
    }

    @Test
    fun `export document carries format marker and version`() {
        val exported = repository.exportToJson(preset)
        assertTrue(exported.contains("wra1th-eq-preset"))
        assertTrue(exported.contains("\"version\""))
    }

    @Test
    fun `user preset survives direct kotlinx serialization`() {
        val json = Json { encodeDefaults = true }
        val encoded = json.encodeToString(UserEqPreset.serializer(), preset)
        val decoded = json.decodeFromString(UserEqPreset.serializer(), encoded)
        assertEquals(preset, decoded)
    }

    @Test
    fun `persisted eq state is versioned and round-trips`() {
        val json = Json { encodeDefaults = true; ignoreUnknownKeys = true }
        val state = PersistedEqState(
            selectedPresetId = "custom",
            selectedPresetName = "Custom",
            referenceGainsDb = List(10) { it.toFloat() },
            bassBoostStrength = 450,
            loudnessGainDb = 3f,
            preampDb = -7.5f,
            manualSessionId = 1234,
            isDirty = true
        )
        val encoded = json.encodeToString(PersistedEqState.serializer(), state)
        assertTrue(encoded.contains("\"version\":${PersistedEqState.PERSISTED_STATE_VERSION}"))
        assertEquals(state, json.decodeFromString(PersistedEqState.serializer(), encoded))
    }

    @Test
    fun `unknown fields are tolerated for forward migration`() {
        val json = """
            {"version":1,"enabled":true,"selectedPresetId":"flat","selectedPresetName":"Flat",
             "referenceGainsDb":[0,0,0,0,0,0,0,0,0,0],"bassBoostStrength":0,
             "loudnessGainDb":0,"preampDb":0,"autoHeadroomEnabled":true,
             "mediaVolumePercent":50,"manualSessionId":null,"isDirty":false,
             "someFutureField":"whatever"}
        """.trimIndent()
        val decoded = Json { ignoreUnknownKeys = true }
            .decodeFromString(PersistedEqState.serializer(), json)
        assertEquals("flat", decoded.selectedPresetId)
    }
}
