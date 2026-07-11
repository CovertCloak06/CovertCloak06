package com.wra1th.eq.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.wra1th.eq.model.EqPreset
import com.wra1th.eq.model.UserEqPreset
import com.wra1th.eq.ui.theme.MonoValueSmallStyle
import com.wra1th.eq.ui.theme.WraithSuccess
import com.wra1th.eq.viewmodel.PresetsViewModel
import java.util.Locale

@Composable
fun PresetsScreen(
    viewModel: PresetsViewModel = viewModel(factory = PresetsViewModel.Factory)
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

    // SAF launchers — file IO happens in the ViewModel, only Uris flow through here.
    var exportTarget by remember { mutableStateOf<UserEqPreset?>(null) }
    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        val preset = exportTarget
        if (uri != null && preset != null) viewModel.exportPreset(preset, uri)
        exportTarget = null
    }
    val importLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) viewModel.importPreset(uri)
    }

    var renameTarget by remember { mutableStateOf<UserEqPreset?>(null) }
    var deleteTarget by remember { mutableStateOf<UserEqPreset?>(null) }
    var showFactoryResetDialog by rememberSaveable { mutableStateOf(false) }

    renameTarget?.let { preset ->
        RenameDialog(
            currentName = preset.name,
            onRename = { newName ->
                viewModel.renamePreset(preset.id, newName)
                renameTarget = null
            },
            onDismiss = { renameTarget = null }
        )
    }

    deleteTarget?.let { preset ->
        ConfirmDialog(
            title = "DELETE PRESET",
            text = "Delete \"${preset.name}\"? This cannot be undone.",
            confirmLabel = "DELETE",
            onConfirm = {
                viewModel.deletePreset(preset.id)
                deleteTarget = null
            },
            onDismiss = { deleteTarget = null }
        )
    }

    if (showFactoryResetDialog) {
        ConfirmDialog(
            title = "RESET PRESETS",
            text = "Remove every custom preset and keep only the factory presets?",
            confirmLabel = "RESET",
            onConfirm = {
                viewModel.resetToFactory()
                showFactoryResetDialog = false
            },
            onDismiss = { showFactoryResetDialog = false }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "PRESETS",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedButton(
                            onClick = { importLauncher.launch(arrayOf("application/json", "text/*")) },
                            modifier = Modifier.testTag("import_button")
                        ) {
                            Text("IMPORT", style = MaterialTheme.typography.labelMedium)
                        }
                        OutlinedButton(
                            onClick = { showFactoryResetDialog = true },
                            enabled = state.userPresets.isNotEmpty(),
                            modifier = Modifier.testTag("factory_reset_button")
                        ) {
                            Text("RESET", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            }

            item {
                SectionHeader("BUILT-IN")
            }
            items(state.builtInPresets, key = { it.id }) { preset ->
                BuiltInPresetRow(
                    preset = preset,
                    active = preset.id == state.activePresetId,
                    onApply = { viewModel.applyPreset(preset) },
                    onDuplicate = { viewModel.duplicatePreset(preset.id) }
                )
            }

            item {
                SectionHeader("USER  (${state.userPresets.size})")
            }
            if (state.userPresets.isEmpty()) {
                item {
                    Text(
                        text = "No custom presets yet. Edit the curve and use SAVE PRESET, " +
                            "duplicate a built-in, or import a JSON preset.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 4.dp)
                    )
                }
            }
            items(state.userPresets, key = { it.id }) { preset ->
                UserPresetRow(
                    preset = preset,
                    active = preset.id == state.activePresetId,
                    onApply = { viewModel.applyUserPreset(preset) },
                    onDuplicate = { viewModel.duplicatePreset(preset.id) },
                    onRename = { renameTarget = preset },
                    onDelete = {
                        if (state.confirmDeletion) deleteTarget = preset
                        else viewModel.deletePreset(preset.id)
                    },
                    onExport = {
                        exportTarget = preset
                        exportLauncher.launch("${preset.name.replace(' ', '_')}.wra1th.json")
                    }
                )
            }
        }
        SnackbarHost(hostState = snackbarHostState)
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 6.dp)
    )
}

@Composable
private fun PresetCard(
    name: String,
    meta: String,
    active: Boolean,
    actions: @Composable () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = MaterialTheme.shapes.small,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = name,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (active) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurface
                    )
                    if (active) {
                        Text(
                            text = "  ● ACTIVE",
                            style = MonoValueSmallStyle,
                            color = WraithSuccess
                        )
                    }
                }
            }
            Text(
                text = meta,
                style = MonoValueSmallStyle,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.padding(top = 4.dp)
            ) {
                actions()
            }
        }
    }
}

@Composable
private fun RowAction(label: String, onClick: () -> Unit, tag: String) {
    TextButton(onClick = onClick, modifier = Modifier.testTag(tag)) {
        Text(label, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun BuiltInPresetRow(
    preset: EqPreset,
    active: Boolean,
    onApply: () -> Unit,
    onDuplicate: () -> Unit
) {
    PresetCard(
        name = preset.name,
        meta = presetMeta(preset.gainsDb, preset.bassBoostStrength, preset.loudnessGainDb),
        active = active
    ) {
        RowAction("APPLY", onApply, "apply_${preset.id}")
        RowAction("DUPLICATE", onDuplicate, "duplicate_${preset.id}")
        // Built-in presets cannot be renamed or deleted.
    }
}

@Composable
private fun UserPresetRow(
    preset: UserEqPreset,
    active: Boolean,
    onApply: () -> Unit,
    onDuplicate: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
    onExport: () -> Unit
) {
    PresetCard(
        name = preset.name,
        meta = presetMeta(preset.gainsDb, preset.bassBoostStrength, preset.loudnessGainDb),
        active = active
    ) {
        RowAction("APPLY", onApply, "apply_${preset.id}")
        RowAction("DUPLICATE", onDuplicate, "duplicate_${preset.id}")
        RowAction("RENAME", onRename, "rename_${preset.id}")
        RowAction("EXPORT", onExport, "export_${preset.id}")
        RowAction("DELETE", onDelete, "delete_${preset.id}")
    }
}

private fun presetMeta(gains: List<Float>, bassBoost: Int, loudnessDb: Float): String {
    val maxGain = gains.maxOrNull() ?: 0f
    val minGain = gains.minOrNull() ?: 0f
    return String.format(
        Locale.US,
        "eq %+.0f..%+.0f dB · bass %d%% · loud +%.0f dB",
        minGain, maxGain, bassBoost / 10, loudnessDb
    )
}

@Composable
private fun RenameDialog(
    currentName: String,
    onRename: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var name by rememberSaveable { mutableStateOf(currentName) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
        title = { Text("RENAME PRESET", style = MaterialTheme.typography.titleSmall) },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                singleLine = true,
                label = { Text("New name") }
            )
        },
        confirmButton = {
            TextButton(onClick = { onRename(name) }, enabled = name.isNotBlank()) {
                Text("RENAME")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("CANCEL") }
        }
    )
}

@Composable
private fun ConfirmDialog(
    title: String,
    text: String,
    confirmLabel: String,
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
                Text(confirmLabel, color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("CANCEL") }
        }
    )
}
