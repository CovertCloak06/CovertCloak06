package com.wra1th.eq

import com.wra1th.eq.data.EqPresetRepository
import com.wra1th.eq.data.InMemoryUserPresetStorage
import com.wra1th.eq.data.PresetOperationResult
import com.wra1th.eq.data.PresetValidator
import org.junit.Assert.assertTrue
import org.junit.Test

class PresetValidationTest {

    private val repository = EqPresetRepository(InMemoryUserPresetStorage())

    private val validGains = List(10) { 0f }

    private fun importDocument(
        name: String = "Valid",
        gains: String = "[0,0,0,0,0,0,0,0,0,0]",
        bassBoost: Int = 0,
        loudness: Float = 0f
    ): String = """
        {"format":"wra1th-eq-preset","version":1,"preset":{
          "id":"x","name":"$name","gainsDb":$gains,
          "bassBoostStrength":$bassBoost,"loudnessGainDb":$loudness,
          "preampDb":0.0,"createdAtEpochMs":0,"updatedAtEpochMs":0}}
    """.trimIndent()

    private fun assertRejected(raw: String, fragment: String) {
        val result = repository.parseImportedJson(raw)
        assertTrue("expected failure containing '$fragment', got $result",
            result is PresetOperationResult.Failure &&
                result.reason.contains(fragment, ignoreCase = true))
    }

    @Test
    fun `valid document is accepted`() {
        val result = repository.parseImportedJson(importDocument())
        assertTrue(result is PresetOperationResult.Success)
    }

    @Test
    fun `blank name is rejected`() {
        assertRejected(importDocument(name = "   "), "blank")
    }

    @Test
    fun `wrong band count is rejected`() {
        assertRejected(importDocument(gains = "[0,0,0]"), "exactly 10")
        assertRejected(importDocument(gains = "[0,0,0,0,0,0,0,0,0,0,0]"), "exactly 10")
    }

    @Test
    fun `gain outside plus minus 24 dB is rejected`() {
        assertRejected(importDocument(gains = "[25,0,0,0,0,0,0,0,0,0]"), "outside")
        assertRejected(importDocument(gains = "[-25,0,0,0,0,0,0,0,0,0]"), "outside")
    }

    @Test
    fun `bass boost outside 0-1000 is rejected`() {
        assertRejected(importDocument(bassBoost = 1001), "bass boost")
        assertRejected(importDocument(bassBoost = -1), "bass boost")
    }

    @Test
    fun `loudness outside 0-24 dB is rejected`() {
        assertRejected(importDocument(loudness = 25f), "loudness")
        assertRejected(importDocument(loudness = -1f), "loudness")
    }

    @Test
    fun `malformed json is rejected`() {
        assertRejected("{not json at all", "invalid preset json")
        assertRejected("""{"format":"other","preset":{}}""", "invalid preset json")
    }

    @Test
    fun `validator reports every violation at once`() {
        val errors = PresetValidator.validate(
            name = "",
            gainsDb = listOf(99f),
            bassBoostStrength = 5000,
            loudnessGainDb = -3f
        )
        assertTrue(errors.size >= 4)
    }

    @Test
    fun `validator passes clean input`() {
        assertTrue(PresetValidator.validate("Fine", validGains, 500, 6f).isEmpty())
    }
}
