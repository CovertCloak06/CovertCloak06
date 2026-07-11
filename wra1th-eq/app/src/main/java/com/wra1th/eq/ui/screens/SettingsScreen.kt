package com.wra1th.eq.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.wra1th.eq.viewmodel.SettingsViewModel

@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel = viewModel(factory = SettingsViewModel.Factory)
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(message) {
        message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }

    var showResetSettingsDialog by rememberSaveable { mutableStateOf(false) }
    var showResetPresetsDialog by rememberSaveable { mutableStateOf(false) }

    if (showResetSettingsDialog) {
        ConfirmActionDialog(
            title = "RESET SETTINGS",
            text = "Reset every application setting and the current EQ state to defaults?",
            onConfirm = {
                viewModel.resetApplicationSettings()
                showResetSettingsDialog = false
            },
            onDismiss = { showResetSettingsDialog = false }
        )
    }
    if (showResetPresetsDialog) {
        ConfirmActionDialog(
            title = "RESET CUSTOM PRESETS",
            text = "Remove every user-created preset? Built-in presets are unaffected.",
            onConfirm = {
                viewModel.resetCustomPresets()
                showResetPresetsDialog = false
            },
            onDismiss = { showResetPresetsDialog = false }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "SETTINGS",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary
            )

            SettingsPanel("STARTUP") {
                ToggleRow(
                    label = "Launch with EQ enabled",
                    checked = state.settings.launchWithEqEnabled,
                    onCheckedChange = viewModel::setLaunchWithEqEnabled,
                    tag = "setting_launch_enabled"
                )
                ToggleRow(
                    label = "Restore last preset",
                    checked = state.settings.restoreLastPreset,
                    onCheckedChange = viewModel::setRestoreLastPreset,
                    tag = "setting_restore_preset"
                )
            }

            SettingsPanel("PROCESSING") {
                ToggleRow(
                    label = "Automatic headroom",
                    checked = state.autoHeadroomEnabled,
                    onCheckedChange = viewModel::setAutoHeadroom,
                    tag = "setting_auto_headroom"
                )
            }

            SettingsPanel("INTERFACE") {
                ToggleRow(
                    label = "Show gain values",
                    checked = state.settings.showGainValues,
                    onCheckedChange = viewModel::setShowGainValues,
                    tag = "setting_show_gains"
                )
                ToggleRow(
                    label = "Haptic feedback",
                    checked = state.settings.hapticFeedback,
                    onCheckedChange = viewModel::setHapticFeedback,
                    tag = "setting_haptics"
                )
                ToggleRow(
                    label = "Compact EQ sliders",
                    checked = state.settings.compactSliders,
                    onCheckedChange = viewModel::setCompactSliders,
                    tag = "setting_compact"
                )
                ToggleRow(
                    label = "Confirm preset deletion",
                    checked = state.settings.confirmPresetDeletion,
                    onCheckedChange = viewModel::setConfirmPresetDeletion,
                    tag = "setting_confirm_delete"
                )
            }

            SettingsPanel("AUDIO SESSION") {
                ManualSessionEditor(
                    currentSessionId = state.manualSessionId,
                    onApply = viewModel::setManualSessionId
                )
                OutlinedButton(
                    onClick = viewModel::retryAttachment,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("retry_attachment_button")
                ) {
                    Text("RETRY AUDIO-EFFECT ATTACHMENT", style = MaterialTheme.typography.labelMedium)
                }
            }

            SettingsPanel("MAINTENANCE") {
                OutlinedButton(
                    onClick = { showResetSettingsDialog = true },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("reset_settings_button")
                ) {
                    Text("RESET APPLICATION SETTINGS", style = MaterialTheme.typography.labelMedium)
                }
                OutlinedButton(
                    onClick = { showResetPresetsDialog = true },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("reset_presets_button")
                ) {
                    Text("RESET CUSTOM PRESETS", style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        SnackbarHost(hostState = snackbarHostState)
    }
}

@Composable
private fun SettingsPanel(title: String, content: @Composable () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
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
private fun ToggleRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    tag: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = MaterialTheme.colorScheme.primary,
                checkedTrackColor = MaterialTheme.colorScheme.surfaceVariant
            ),
            modifier = Modifier.testTag(tag)
        )
    }
}

@Composable
private fun ManualSessionEditor(
    currentSessionId: Int?,
    onApply: (Int?) -> Unit
) {
    var text by rememberSaveable(currentSessionId) {
        mutableStateOf(currentSessionId?.toString() ?: "")
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = "Manual audio-session ID (diagnostics). Leave empty for the session-0 " +
                "global mix. Effects re-attach automatically.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = text,
                onValueChange = { new -> text = new.filter { it.isDigit() } },
                singleLine = true,
                label = { Text("Session ID") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier
                    .weight(1f)
                    .testTag("manual_session_field")
            )
            OutlinedButton(
                onClick = { onApply(text.toIntOrNull()) },
                modifier = Modifier.testTag("manual_session_apply")
            ) {
                Text("APPLY", style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

@Composable
private fun ConfirmActionDialog(
    title: String,
    text: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
        title = { Text(title, style = MaterialTheme.typography.titleSmall) },
        text = { Text(text, style = MaterialTheme.typography.bodyMedium) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text("CONFIRM", color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("CANCEL") }
        }
    )
}
