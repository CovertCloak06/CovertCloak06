package com.wra1th.eq.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.wra1th.eq.model.AudioCapabilities
import com.wra1th.eq.ui.theme.MonoValueStyle
import com.wra1th.eq.ui.theme.WraithError
import com.wra1th.eq.ui.theme.WraithSuccess
import com.wra1th.eq.util.FrequencyFormatter
import java.util.Locale

/** Device audio-effect capability summary for the diagnostics screen. */
@Composable
fun CapabilityCard(
    capabilities: AudioCapabilities,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = MaterialTheme.shapes.medium
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = "EFFECT CAPABILITIES",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            SupportRow("Equalizer", capabilities.equalizerSupported)
            SupportRow("BassBoost", capabilities.bassBoostSupported)
            SupportRow("BassBoost strength", capabilities.bassBoostStrengthSupported)
            SupportRow("LoudnessEnhancer", capabilities.loudnessEnhancerSupported)
            if (capabilities.equalizerSupported) {
                ValueRow("EQ bands", capabilities.bandCount.toString())
                ValueRow(
                    "Band centers",
                    capabilities.bandFrequenciesHz.joinToString(" ") { FrequencyFormatter.format(it) }
                )
                ValueRow(
                    "Gain range",
                    String.format(
                        Locale.US, "%.1f .. %+.1f dB",
                        capabilities.minGainDb, capabilities.maxGainDb
                    )
                )
            }
            capabilities.detectionError?.let { error ->
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = WraithError
                )
            }
        }
    }
}

@Composable
private fun SupportRow(label: String, supported: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = if (supported) "SUPPORTED" else "UNSUPPORTED",
            style = MonoValueStyle,
            color = if (supported) WraithSuccess else WraithError
        )
    }
}

@Composable
private fun ValueRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MonoValueStyle,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
