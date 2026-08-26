package com.wra1th.eq

import com.wra1th.eq.audio.EqualizerBandMapper
import com.wra1th.eq.presets.BuiltInPresets
import com.wra1th.eq.presets.PresetInterpolator
import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.math.sqrt

class EqualizerBandMapperTest {

    private val referenceFrequencies = BuiltInPresets.REFERENCE_FREQUENCIES_HZ

    @Test
    fun `device frequency matching a reference band takes the exact gain`() {
        val gains = listOf(1f, 2f, 3f, 4f, 5f, 6f, 7f, 8f, 9f, 10f)
        val mapped = EqualizerBandMapper.mapReferenceCurveToDeviceBands(
            referenceFrequencies, gains, listOf(31f, 1000f, 16000f)
        )
        assertEquals(1f, mapped[0], 1e-4f)
        assertEquals(6f, mapped[1], 1e-4f)
        assertEquals(10f, mapped[2], 1e-4f)
    }

    @Test
    fun `interpolation is logarithmic not linear`() {
        // Geometric mean of 100 and 1000 sits exactly halfway in log space.
        val target = sqrt(100f * 1000f)
        val mapped = EqualizerBandMapper.mapReferenceCurveToDeviceBands(
            referenceFrequenciesHz = listOf(100f, 1000f),
            referenceGainsDb = listOf(0f, 10f),
            deviceFrequenciesHz = listOf(target)
        )
        assertEquals(5f, mapped[0], 1e-3f)

        // Linear interpolation would have produced ~2.4 dB at 316 Hz; assert we differ.
        val linearValue = (target - 100f) / (1000f - 100f) * 10f
        assert(kotlin.math.abs(mapped[0] - linearValue) > 1f)
    }

    @Test
    fun `frequencies below and above the reference range take edge gains`() {
        val gains = listOf(4f, 3f, 1f, -1f, -2f, 0f, 2f, 4f, 5f, 4f)
        val mapped = EqualizerBandMapper.mapReferenceCurveToDeviceBands(
            referenceFrequencies, gains, listOf(10f, 24000f)
        )
        assertEquals(4f, mapped[0], 1e-4f) // below 31 Hz -> first gain
        assertEquals(4f, mapped[1], 1e-4f) // above 16 kHz -> last gain
    }

    @Test
    fun `typical five band device mapping stays within the reference envelope`() {
        val gains = listOf(6f, 6f, 4f, 1f, -1f, 0f, 1f, 2f, 3f, 2f) // Rap preset
        val deviceFreqs = listOf(60f, 230f, 910f, 3600f, 14000f)
        val mapped = EqualizerBandMapper.mapReferenceCurveToDeviceBands(
            referenceFrequencies, gains, deviceFreqs
        )
        assertEquals(5, mapped.size)
        val minRef = gains.min()
        val maxRef = gains.max()
        mapped.forEach { gain ->
            assert(gain in minRef..maxRef) { "mapped gain $gain escaped $minRef..$maxRef" }
        }
    }

    @Test
    fun `clampGains clamps to the device range`() {
        val clamped = EqualizerBandMapper.clampGains(listOf(-30f, -5f, 0f, 5f, 30f), -15f, 15f)
        assertEquals(listOf(-15f, -5f, 0f, 5f, 15f), clamped)
    }

    @Test
    fun `interpolator clamps mapped gains to device range`() {
        val gains = listOf(24f, 24f, 24f, 24f, 24f, 24f, 24f, 24f, 24f, 24f)
        val mapped = PresetInterpolator.deviceGainsFor(
            referenceGainsDb = gains,
            deviceFrequenciesHz = listOf(60f, 1000f),
            deviceMinDb = -10f,
            deviceMaxDb = 10f
        )
        assertEquals(listOf(10f, 10f), mapped)
    }

    @Test
    fun `empty reference curve maps to zero gains`() {
        val mapped = EqualizerBandMapper.mapReferenceCurveToDeviceBands(
            emptyList(), emptyList(), listOf(100f, 1000f)
        )
        assertEquals(listOf(0f, 0f), mapped)
    }
}
