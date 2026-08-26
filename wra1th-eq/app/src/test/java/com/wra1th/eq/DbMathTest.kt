package com.wra1th.eq

import com.wra1th.eq.util.ClippingRisk
import com.wra1th.eq.util.DbMath
import org.junit.Assert.assertEquals
import org.junit.Test

class DbMathTest {

    @Test
    fun `db to millibel conversion`() {
        assertEquals(600, DbMath.dbToMillibels(6f))
        assertEquals(-150, DbMath.dbToMillibels(-1.5f))
        assertEquals(0, DbMath.dbToMillibels(0f))
        assertEquals(2.5f, DbMath.millibelsToDb(250), 1e-4f)
    }

    @Test
    fun `recommended preamp compensates max gain plus loudness plus bass estimate`() {
        // max EQ gain 5, loudness 2, bass 500/1000 * 4 = 2 -> total 9 -> preamp -9
        val recommended = DbMath.calculateRecommendedPreampDb(
            gainsDb = listOf(0f, 5f, 3f, -2f),
            loudnessGainDb = 2f,
            bassBoostStrength = 500
        )
        assertEquals(-9f, recommended, 1e-4f)
    }

    @Test
    fun `recommended preamp clamps to minus 18`() {
        val recommended = DbMath.calculateRecommendedPreampDb(
            gainsDb = listOf(24f),
            loudnessGainDb = 12f,
            bassBoostStrength = 1000
        )
        assertEquals(-18f, recommended, 1e-4f)
    }

    @Test
    fun `flat curve needs no preamp`() {
        val recommended = DbMath.calculateRecommendedPreampDb(
            gainsDb = List(10) { 0f },
            loudnessGainDb = 0f,
            bassBoostStrength = 0
        )
        assertEquals(0f, recommended, 1e-4f)
    }

    @Test
    fun `negative-only curves never produce positive preamp`() {
        val recommended = DbMath.calculateRecommendedPreampDb(
            gainsDb = listOf(-5f, -3f),
            loudnessGainDb = 0f,
            bassBoostStrength = 0
        )
        assertEquals(0f, recommended, 1e-4f)
    }

    @Test
    fun `headroom is zero when preamp fully compensates`() {
        val gains = listOf(4f, 2f)
        val headroom = DbMath.estimateHeadroomDb(gains, 1f, 250, preampDb = -6f)
        assertEquals(0f, headroom, 1e-4f)
    }

    @Test
    fun `clipping risk thresholds`() {
        val flat = List(10) { 0f }
        assertEquals(
            ClippingRisk.Low,
            DbMath.clippingRisk(flat, 0f, 0, 0f)
        )
        // 3 dB residual boost -> Moderate
        assertEquals(
            ClippingRisk.Moderate,
            DbMath.clippingRisk(listOf(3f), 0f, 0, 0f)
        )
        // 12 dB residual -> High
        assertEquals(
            ClippingRisk.High,
            DbMath.clippingRisk(listOf(8f), 4f, 0, 0f)
        )
        // High boost fully compensated -> Low again
        assertEquals(
            ClippingRisk.Low,
            DbMath.clippingRisk(listOf(8f), 4f, 0, -12f)
        )
    }

    @Test
    fun `bass boost estimate scales linearly to 4 dB`() {
        assertEquals(0f, DbMath.estimateBassBoostDb(0), 1e-4f)
        assertEquals(2f, DbMath.estimateBassBoostDb(500), 1e-4f)
        assertEquals(4f, DbMath.estimateBassBoostDb(1000), 1e-4f)
        assertEquals(4f, DbMath.estimateBassBoostDb(5000), 1e-4f) // clamped input
    }
}
