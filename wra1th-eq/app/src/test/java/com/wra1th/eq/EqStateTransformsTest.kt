package com.wra1th.eq

import com.wra1th.eq.model.CUSTOM_PRESET_ID
import com.wra1th.eq.model.EqStateTransforms
import com.wra1th.eq.model.PersistedEqState
import com.wra1th.eq.presets.BuiltInPresets
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EqStateTransformsTest {

    private val rockApplied = EqStateTransforms.withPresetApplied(PersistedEqState(), BuiltInPresets.rock)

    @Test
    fun `editing a band switches to custom without touching the built-in preset`() {
        val edited = EqStateTransforms.withBandGain(rockApplied, 0, 9f)

        assertEquals(CUSTOM_PRESET_ID, edited.selectedPresetId)
        assertEquals("Custom", edited.selectedPresetName)
        assertTrue(edited.isDirty)
        assertEquals(9f, edited.referenceGainsDb[0])
        // The built-in definition itself is untouched.
        assertEquals(4f, BuiltInPresets.rock.gainsDb[0])
    }

    @Test
    fun `changing bass boost switches to custom`() {
        val edited = EqStateTransforms.withBassBoost(rockApplied, 700)
        assertEquals(CUSTOM_PRESET_ID, edited.selectedPresetId)
        assertEquals(700, edited.bassBoostStrength)
    }

    @Test
    fun `changing loudness switches to custom and clamps`() {
        val edited = EqStateTransforms.withLoudnessGain(rockApplied, 99f)
        assertEquals(CUSTOM_PRESET_ID, edited.selectedPresetId)
        assertEquals(12f, edited.loudnessGainDb)
    }

    @Test
    fun `changing preamp switches to custom and clamps`() {
        val edited = EqStateTransforms.withPreamp(rockApplied, -40f)
        assertEquals(CUSTOM_PRESET_ID, edited.selectedPresetId)
        assertEquals(-18f, edited.preampDb)
    }

    @Test
    fun `auto-headroom toggle switches to custom`() {
        val edited = EqStateTransforms.withAutoHeadroom(rockApplied, false)
        assertEquals(CUSTOM_PRESET_ID, edited.selectedPresetId)
        assertFalse(edited.autoHeadroomEnabled)
    }

    @Test
    fun `master enable is a bypass and does not switch to custom`() {
        val edited = EqStateTransforms.withMasterEnabled(rockApplied, false)
        assertEquals("rock", edited.selectedPresetId)
        assertFalse(edited.enabled)
    }

    @Test
    fun `applying a preset clears the dirty state`() {
        val custom = EqStateTransforms.withBandGain(rockApplied, 3, -4f)
        val reapplied = EqStateTransforms.withPresetApplied(custom, BuiltInPresets.vocal)

        assertEquals("vocal", reapplied.selectedPresetId)
        assertEquals("Vocal", reapplied.selectedPresetName)
        assertFalse(reapplied.isDirty)
        assertEquals(BuiltInPresets.vocal.gainsDb, reapplied.referenceGainsDb)
    }

    @Test
    fun `reset curve zeroes gains and switches to custom`() {
        val reset = EqStateTransforms.withCurveReset(rockApplied)
        assertEquals(List(10) { 0f }, reset.referenceGainsDb)
        assertEquals(CUSTOM_PRESET_ID, reset.selectedPresetId)
    }

    @Test
    fun `out-of-range band index is ignored`() {
        val edited = EqStateTransforms.withBandGain(rockApplied, 42, 5f)
        assertEquals(rockApplied, edited)
    }
}
