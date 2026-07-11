package com.wra1th.eq.ui.screens

import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.wra1th.eq.data.PresetOperationResult
import com.wra1th.eq.model.ProcessingStatus
import com.wra1th.eq.presets.BuiltInPresets
import com.wra1th.eq.ui.components.BassBoostControl
import com.wra1th.eq.ui.components.EffectStatusCard
import com.wra1th.eq.ui.components.LoudnessControl
import com.wra1th.eq.ui.components.MasterVolumeControl
import com.wra1th.eq.ui.components.PreampControl
import com.wra1th.eq.ui.components.PresetChipRow
import com.wra1th.eq.ui.components.SavePresetDialog
import com.wra1th.eq.ui.components.VerticalEqSlider
import com.wra1th.eq.ui.theme.MonoValueSmallStyle
import com.wra1th.eq.ui.theme.MonoValueStyle
import com.wra1th.eq.ui.theme.WraithError
import com.wra1th.eq.ui.theme.WraithSuccess
import com.wra1th.eq.ui.theme.WraithTextDisabled
import com.wra1th.eq.ui.theme.WraithWarning
import com.wra1th.eq.util.ClippingRisk
import com.wra1th.eq.util.DbMath
import com.wra1th.eq.util.FrequencyFormatter
import com.wra1th.eq.viewmodel.EqualizerViewModel
import java.util.Locale

@Composable
fun EqualizerScreen(
    viewModel: EqualizerViewModel = viewModel(factory = EqualizerViewModel.Factory)
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val settings by viewModel.appSettings.collectAsStateWithLifecycle()
    val saveResult by viewModel.saveResult.collectAsStateWithLifecycle()
    val processing by viewModel.processing.collectAsStateWithLifecycle()
    val capabilities by viewModel.capabilities.collectAsStateWithLifecycle()

    var showSaveDialog by rememberSaveable { mutableStateOf(false) }

    // Close the dialog once a save has succeeded.
    LaunchedEffect(saveResult) {
        if (saveResult is PresetOperationResult.Success) {
            showSaveDialog = false
            viewModel.consumeSaveResult()
        }
    }

    if (showSaveDialog) {
        SavePresetDialog(
            onSave = { name -> viewModel.saveCurrentAsPreset(name) },
            onDismiss = {
                showSaveDialog = false
                viewModel.consumeSaveResult()
            },
            errorMessage = (saveResult as? PresetOperationResult.Failure)?.reason
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // Title + master enable
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "WRA1TH EQ",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.testTag("app_title")
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = if (state.enabled) "ON" else "OFF",
                    style = MonoValueStyle,
                    color = if (state.enabled) WraithSuccess else WraithTextDisabled,
                    modifier = Modifier.padding(end = 8.dp)
                )
                Switch(
                    checked = state.enabled,
                    onCheckedChange = viewModel::setMasterEnabled,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = MaterialTheme.colorScheme.primary,
                        checkedTrackColor = MaterialTheme.colorScheme.surfaceVariant
                    ),
                    modifier = Modifier.testTag("master_enable_switch")
                )
            }
        }

        EffectStatusCard(
            processing = processing,
            chainEnabled = state.enabled,
            preampIsConceptual = true,
            onRetry = viewModel::retryAttachment
        )

        PresetChipRow(
            presets = viewModel.builtInPresets,
            selectedPresetId = state.selectedPresetId,
            onPresetSelected = viewModel::applyPreset,
            enabled = state.enabled
        )

        // EQ sliders on the 10-band reference curve
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = MaterialTheme.shapes.medium,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "REFERENCE CURVE  −12…+12 dB",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedButton(
                        onClick = viewModel::resetCurve,
                        enabled = state.enabled,
                        modifier = Modifier.testTag("reset_button")
                    ) {
                        Text("RESET", style = MaterialTheme.typography.labelMedium)
                    }
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    BuiltInPresets.REFERENCE_FREQUENCIES_HZ.forEachIndexed { index, frequency ->
                        VerticalEqSlider(
                            gainDb = state.referenceGainsDb.getOrElse(index) { 0f },
                            minDb = -12f,
                            maxDb = 12f,
                            frequencyLabel = FrequencyFormatter.format(frequency),
                            onGainChange = { viewModel.setBandGain(index, it) },
                            enabled = state.enabled,
                            showValue = settings.showGainValues,
                            compact = settings.compactSliders,
                            hapticsEnabled = settings.hapticFeedback,
                            testTag = "eq_slider_$index"
                        )
                    }
                }
            }
        }

        // Output & dynamics controls
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = MaterialTheme.shapes.medium,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                MasterVolumeControl(
                    volumePercent = state.mediaVolumePercent,
                    onVolumeChange = viewModel::setMediaVolumePercent
                )
                BassBoostControl(
                    strength = state.bassBoostStrength,
                    supported = capabilities.bassBoostSupported,
                    strengthSupported = capabilities.bassBoostStrengthSupported,
                    onStrengthPercentChange = viewModel::setBassBoostPercent,
                    chainEnabled = state.enabled
                )
                LoudnessControl(
                    gainDb = state.loudnessGainDb,
                    supported = capabilities.loudnessEnhancerSupported,
                    onGainChange = viewModel::setLoudnessGainDb,
                    chainEnabled = state.enabled
                )
                PreampControl(
                    preampDb = state.preampDb,
                    autoHeadroomEnabled = state.autoHeadroomEnabled,
                    onPreampChange = viewModel::setPreampDb,
                    onAutoHeadroomChange = viewModel::setAutoHeadroom,
                    chainEnabled = state.enabled
                )
            }
        }

        HeadroomSummary(
            headroomDb = viewModel.estimatedHeadroomDb(state),
            recommendedPreampDb = viewModel.recommendedPreampDb(state),
            risk = DbMath.clippingRisk(
                state.referenceGainsDb, state.loudnessGainDb,
                state.bassBoostStrength, state.preampDb
            )
        )

        // Save preset + session info footer
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedButton(
                onClick = { showSaveDialog = true },
                modifier = Modifier.testTag("save_preset_button")
            ) {
                Text("SAVE PRESET", style = MaterialTheme.typography.labelMedium)
            }
            Text(
                text = sessionFooter(state.processingStatus, state.deviceBands.size),
                style = MonoValueSmallStyle,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun HeadroomSummary(
    headroomDb: Float,
    recommendedPreampDb: Float,
    risk: ClippingRisk
) {
    val riskColor = when (risk) {
        ClippingRisk.Low -> WraithSuccess
        ClippingRisk.Moderate -> WraithWarning
        ClippingRisk.High -> WraithError
    }
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(
                    text = "HEADROOM",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = String.format(Locale.US, "%+.1f dB", headroomDb),
                    style = MonoValueStyle,
                    color = riskColor
                )
            }
            Column {
                Text(
                    text = "CLIP RISK",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = risk.name.uppercase(Locale.US),
                    style = MonoValueStyle,
                    color = riskColor
                )
            }
            Column {
                Text(
                    text = "REC. PREAMP",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = String.format(Locale.US, "%.1f dB", recommendedPreampDb),
                    style = MonoValueStyle,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

private fun sessionFooter(status: ProcessingStatus, deviceBandCount: Int): String = when (status) {
    is ProcessingStatus.Active ->
        "session ${status.sessionId} · $deviceBandCount device bands"
    ProcessingStatus.WaitingForSession -> "no session attached"
    ProcessingStatus.Detached -> "effects detached"
    is ProcessingStatus.Failed -> "attachment failed"
    is ProcessingStatus.Unsupported -> "effects unsupported"
}
