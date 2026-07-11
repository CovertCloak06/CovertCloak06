package com.wra1th.eq.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Loudness enhancement, 0 to +12 dB (converted to millibels for the platform effect).
 * Setting 0 dB disables loudness processing independently of the rest of the chain.
 */
@Composable
fun LoudnessControl(
    gainDb: Float,
    supported: Boolean,
    onGainChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    chainEnabled: Boolean = true
) {
    LabeledSliderRow(
        label = "LOUDNESS",
        valueText = String.format(Locale.US, "+%.1f dB", gainDb),
        value = gainDb,
        valueRange = 0f..12f,
        onValueChange = { onGainChange((it * 2).roundToInt() / 2f) },
        enabled = supported && chainEnabled,
        disabledReason = if (!supported) "LoudnessEnhancer is not supported on this device" else null,
        modifier = modifier,
        testTag = "loudness_slider"
    )
}
