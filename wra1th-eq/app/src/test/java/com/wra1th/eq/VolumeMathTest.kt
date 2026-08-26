package com.wra1th.eq

import com.wra1th.eq.util.VolumeMath
import org.junit.Assert.assertEquals
import org.junit.Test

class VolumeMathTest {

    @Test
    fun `percent maps onto a 15-step device`() {
        assertEquals(0, VolumeMath.percentToIndex(0, 0, 15))
        assertEquals(8, VolumeMath.percentToIndex(50, 0, 15))
        assertEquals(15, VolumeMath.percentToIndex(100, 0, 15))
    }

    @Test
    fun `percent maps onto a 25-step device`() {
        assertEquals(0, VolumeMath.percentToIndex(0, 0, 25))
        assertEquals(13, VolumeMath.percentToIndex(50, 0, 25))
        assertEquals(25, VolumeMath.percentToIndex(100, 0, 25))
    }

    @Test
    fun `nonzero minimum index is respected`() {
        // Bluetooth absolute volume devices can report min > 0.
        assertEquals(1, VolumeMath.percentToIndex(0, 1, 16))
        assertEquals(16, VolumeMath.percentToIndex(100, 1, 16))
        assertEquals(0, VolumeMath.indexToPercent(1, 1, 16))
        assertEquals(100, VolumeMath.indexToPercent(16, 1, 16))
    }

    @Test
    fun `out-of-range inputs are clamped`() {
        assertEquals(15, VolumeMath.percentToIndex(250, 0, 15))
        assertEquals(0, VolumeMath.percentToIndex(-10, 0, 15))
        assertEquals(100, VolumeMath.indexToPercent(99, 0, 15))
        assertEquals(0, VolumeMath.indexToPercent(-3, 0, 15))
    }

    @Test
    fun `degenerate ranges do not divide by zero`() {
        assertEquals(0, VolumeMath.percentToIndex(50, 0, 0))
        assertEquals(0, VolumeMath.indexToPercent(5, 5, 5))
    }

    @Test
    fun `round trip is stable at every index`() {
        val min = 0
        val max = 30
        for (index in min..max) {
            val percent = VolumeMath.indexToPercent(index, min, max)
            assertEquals(index, VolumeMath.percentToIndex(percent, min, max))
        }
    }
}
