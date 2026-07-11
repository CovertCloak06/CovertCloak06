package com.wra1th.eq.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.wra1th.eq.audio.AudioProcessingState
import com.wra1th.eq.model.ProcessingStatus
import com.wra1th.eq.ui.theme.MonoValueSmallStyle
import com.wra1th.eq.ui.theme.WraithError
import com.wra1th.eq.ui.theme.WraithSuccess
import com.wra1th.eq.ui.theme.WraithTextDisabled
import com.wra1th.eq.ui.theme.WraithWarning

/**
 * Prominent processing-state indicator plus the conceptual pipeline
 * (Input → Preamp/Headroom → EQ → Bass → Loudness → Output), with the stages that are
 * genuinely active on this device highlighted. No fake system-wide DSP claims.
 */
@Composable
fun EffectStatusCard(
    processing: AudioProcessingState,
    chainEnabled: Boolean,
    preampIsConceptual: Boolean,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    val (statusColor, statusText) = when (val status = processing.status) {
        is ProcessingStatus.Active ->
            if (chainEnabled) {
                WraithSuccess to "ACTIVE — session ${status.sessionId}" +
                    if (status.sessionId == 0) " (global mix)" else ""
            } else {
                WraithWarning to "BYPASSED — session ${status.sessionId}"
            }
        is ProcessingStatus.Unsupported -> WraithTextDisabled to "UNSUPPORTED — ${status.reason}"
        is ProcessingStatus.Failed -> WraithError to "FAILED — ${status.message}"
        ProcessingStatus.Detached -> WraithTextDisabled to "DETACHED"
        ProcessingStatus.WaitingForSession -> WraithWarning to "WAITING FOR SESSION"
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = MaterialTheme.shapes.medium
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .background(statusColor, CircleShape)
                    )
                    Text(
                        text = statusText,
                        style = MaterialTheme.typography.labelMedium,
                        color = statusColor,
                        modifier = Modifier
                            .padding(start = 8.dp)
                            .testTag("processing_status_text")
                    )
                }
                val showRetry = processing.status is ProcessingStatus.Failed ||
                    processing.status is ProcessingStatus.Detached
                if (showRetry) {
                    TextButton(onClick = onRetry, modifier = Modifier.testTag("retry_button")) {
                        Text("RETRY", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }

            if (!processing.hasEffectControl && processing.status is ProcessingStatus.Active) {
                Text(
                    text = "Another app currently controls the effect engine — settings may not take effect.",
                    style = MaterialTheme.typography.bodySmall,
                    color = WraithWarning,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }

            // Conceptual processing chain with real per-stage activity.
            val active = processing.status is ProcessingStatus.Active && chainEnabled
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .padding(top = 8.dp)
                    .horizontalScroll(rememberScrollState())
            ) {
                PipelineStage("IN", true)
                PipelineArrow()
                PipelineStage(
                    label = if (preampIsConceptual) "PREAMP*" else "PREAMP",
                    active = false
                )
                PipelineArrow()
                PipelineStage("EQ", active && processing.equalizerActive)
                PipelineArrow()
                PipelineStage("BASS", active && processing.bassBoostActive)
                PipelineArrow()
                PipelineStage("LOUD", active && processing.loudnessActive)
                PipelineArrow()
                PipelineStage("VOL", true)
            }
            if (preampIsConceptual) {
                Text(
                    text = "* preamp is a headroom calculation on this device, not a native gain stage",
                    style = MonoValueSmallStyle,
                    color = WraithTextDisabled,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}

@Composable
private fun PipelineStage(label: String, active: Boolean) {
    val color = if (active) MaterialTheme.colorScheme.primary else WraithTextDisabled
    Box(
        modifier = Modifier
            .background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.extraSmall)
            .padding(horizontal = 6.dp, vertical = 3.dp)
    ) {
        Text(text = label, style = MonoValueSmallStyle, color = color)
    }
}

@Composable
private fun PipelineArrow() {
    Text(
        text = "→",
        style = MonoValueSmallStyle,
        color = WraithTextDisabled,
        modifier = Modifier.padding(horizontal = 3.dp)
    )
}
