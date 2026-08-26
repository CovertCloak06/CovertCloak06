package com.wra1th.eq.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Preamp / headroom control. On the public Android effect chain this is a
 * headroom-management calculation — it is presented honestly as such, not as
 * guaranteed signal attenuation.
 */
@Composable
fun PreampControl(
    preampDb: Float,
    autoHeadroomEnabled: Boolean,
    onPreampChange: (Float) -> Unit,
    onAutoHeadroomChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    chainEnabled: Boolean = true
) {
    Column(modifier = modifier.fillMaxWidth()) {
        LabeledSliderRow(
            label = "PREAMP / HEADROOM",
            valueText = if (autoHeadroomEnabled) {
                String.format(Locale.US, "AUTO %.1f dB", preampDb)
            } else {
                String.format(Locale.US, "%.1f dB", preampDb)
            },
            value = preampDb,
            valueRange = -18f..0f,
            onValueChange = { onPreampChange((it * 2).roundToInt() / 2f) },
            enabled = chainEnabled && !autoHeadroomEnabled,
            disabledReason = if (autoHeadroomEnabled && chainEnabled) {
                "Automatic headroom is managing the preamp value"
            } else {
                null
            },
            testTag = "preamp_slider"
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "AUTO HEADROOM",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Switch(
                checked = autoHeadroomEnabled,
                onCheckedChange = onAutoHeadroomChange,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = MaterialTheme.colorScheme.primary,
                    checkedTrackColor = MaterialTheme.colorScheme.surfaceVariant
                ),
                modifier = Modifier.testTag("auto_headroom_switch")
            )
        }
    }
}
