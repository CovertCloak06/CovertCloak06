package com.wra1th.eq.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kotlin.math.roundToInt

/**
 * Bass boost shown as 0–100%, mapped internally to the platform strength range 0–1000.
 * Disabled with an explanation when the device lacks the effect or variable strength.
 */
@Composable
fun BassBoostControl(
    strength: Int,
    supported: Boolean,
    strengthSupported: Boolean,
    onStrengthPercentChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
    chainEnabled: Boolean = true
) {
    val percent = (strength / 10f).roundToInt().coerceIn(0, 100)
    val enabled = supported && strengthSupported && chainEnabled
    LabeledSliderRow(
        label = "BASS BOOST",
        valueText = "$percent%",
        value = percent.toFloat(),
        valueRange = 0f..100f,
        onValueChange = { onStrengthPercentChange(it.roundToInt()) },
        enabled = enabled,
        disabledReason = when {
            !supported -> "BassBoost is not supported on this device"
            !strengthSupported -> "This device does not support variable bass-boost strength"
            else -> null
        },
        modifier = modifier,
        testTag = "bass_slider"
    )
}
