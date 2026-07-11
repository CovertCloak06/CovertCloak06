package com.wra1th.eq.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kotlin.math.roundToInt

/** System media volume (STREAM_MUSIC only), 0–100% mapped onto the device's real step count. */
@Composable
fun MasterVolumeControl(
    volumePercent: Int,
    onVolumeChange: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    LabeledSliderRow(
        label = "MEDIA VOLUME",
        valueText = "$volumePercent%",
        value = volumePercent.toFloat(),
        valueRange = 0f..100f,
        onValueChange = { onVolumeChange(it.roundToInt()) },
        modifier = modifier,
        testTag = "volume_slider"
    )
}
