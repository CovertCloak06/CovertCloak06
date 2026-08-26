package com.wra1th.eq.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.wra1th.eq.model.ProcessingStatus
import com.wra1th.eq.ui.components.CapabilityCard
import com.wra1th.eq.ui.theme.MonoValueSmallStyle
import com.wra1th.eq.ui.theme.MonoValueStyle
import com.wra1th.eq.ui.theme.WraithError
import com.wra1th.eq.ui.theme.WraithSuccess
import com.wra1th.eq.ui.theme.WraithTextDisabled
import com.wra1th.eq.ui.theme.WraithWarning
import com.wra1th.eq.util.FrequencyFormatter
import com.wra1th.eq.viewmodel.DiagnosticsViewModel
import java.util.Locale

@Composable
fun DiagnosticsScreen(
    viewModel: DiagnosticsViewModel = viewModel(factory = DiagnosticsViewModel.Factory)
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val clipboard = LocalClipboardManager.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "DIAGNOSTICS",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary
            )
            OutlinedButton(
                onClick = {
                    clipboard.setText(AnnotatedString(viewModel.buildDiagnosticsReport(state)))
                },
                modifier = Modifier.testTag("copy_diagnostics_button")
            ) {
                Text("COPY", style = MaterialTheme.typography.labelMedium)
            }
        }

        DiagnosticsPanel("DEVICE") {
            DiagRow("Manufacturer", state.manufacturer)
            DiagRow("Model", state.model)
            DiagRow("Android", state.androidVersion)
            DiagRow("App version", state.appVersion)
        }

        DiagnosticsPanel("PROCESSING") {
            val (color, text) = when (val status = state.processing.status) {
                is ProcessingStatus.Active -> WraithSuccess to "ACTIVE (session ${status.sessionId})"
                is ProcessingStatus.Failed -> WraithError to "FAILED: ${status.message}"
                is ProcessingStatus.Unsupported -> WraithTextDisabled to "UNSUPPORTED: ${status.reason}"
                ProcessingStatus.Detached -> WraithTextDisabled to "DETACHED"
                ProcessingStatus.WaitingForSession -> WraithWarning to "WAITING FOR SESSION"
            }
            DiagRow("Status", text, color)
            DiagRow("Active session ID", state.activeSessionId?.toString() ?: "none")
            DiagRow("Manual session ID", state.manualSessionId?.toString() ?: "auto (session 0)")
            DiagRow("Effect control", if (state.processing.hasEffectControl) "held" else "not held")
            DiagRow("Last init error", state.lastError ?: "none")
            DiagRow(
                "Media volume index",
                "${state.mediaVolumeIndex} / ${state.mediaVolumeMaxIndex}"
            )
        }

        CapabilityCard(capabilities = state.capabilities)

        DiagnosticsPanel("MAPPED DEVICE BANDS") {
            if (state.deviceBands.isEmpty()) {
                Text(
                    text = "No equalizer bands available (effects not attached).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                state.deviceBands.forEachIndexed { index, band ->
                    val mapped = state.mappedDeviceGainsDb.getOrNull(index)
                    DiagRow(
                        "Band $index · ${FrequencyFormatter.formatWithUnit(band.frequencyHz)}",
                        if (mapped != null) {
                            String.format(Locale.US, "%+.1f dB (applied %+.1f)", mapped, band.gainDb)
                        } else {
                            String.format(Locale.US, "%+.1f dB", band.gainDb)
                        }
                    )
                }
                DiagRow(
                    "Band gain range",
                    String.format(
                        Locale.US, "%.1f .. %+.1f dB",
                        state.deviceBands.first().minimumDb,
                        state.deviceBands.first().maximumDb
                    )
                )
            }
        }
    }
}

@Composable
private fun DiagnosticsPanel(title: String, content: @Composable () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            content()
        }
    }
}

@Composable
private fun DiagRow(
    label: String,
    value: String,
    valueColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface
) {
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
            style = if (value.length > 28) MonoValueSmallStyle else MonoValueStyle,
            color = valueColor,
            modifier = Modifier.padding(start = 12.dp)
        )
    }
}
