package com.wra1th.eq.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.wra1th.eq.model.CUSTOM_PRESET_ID
import com.wra1th.eq.model.CUSTOM_PRESET_NAME
import com.wra1th.eq.model.EqPreset

/**
 * Horizontal preset chips. A synthetic "Custom" chip appears (selected) whenever the
 * user has manually edited the curve, without overwriting any built-in preset.
 */
@Composable
fun PresetChipRow(
    presets: List<EqPreset>,
    selectedPresetId: String,
    onPresetSelected: (EqPreset) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    val showCustomChip = selectedPresetId == CUSTOM_PRESET_ID
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(horizontal = 2.dp),
        modifier = modifier
    ) {
        if (showCustomChip) {
            item(key = CUSTOM_PRESET_ID) {
                PresetChip(
                    label = CUSTOM_PRESET_NAME,
                    selected = true,
                    enabled = enabled,
                    onClick = {},
                    tag = "preset_chip_custom"
                )
            }
        }
        items(presets, key = { it.id }) { preset ->
            PresetChip(
                label = preset.name,
                selected = preset.id == selectedPresetId,
                enabled = enabled,
                onClick = { onPresetSelected(preset) },
                tag = "preset_chip_${preset.id}"
            )
        }
    }
}

@Composable
private fun PresetChip(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    tag: String
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        enabled = enabled,
        label = { Text(label, style = MaterialTheme.typography.labelMedium) },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
            selectedLabelColor = MaterialTheme.colorScheme.primary,
            containerColor = MaterialTheme.colorScheme.surface,
            labelColor = MaterialTheme.colorScheme.onSurfaceVariant
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = enabled,
            selected = selected,
            borderColor = MaterialTheme.colorScheme.outline,
            selectedBorderColor = MaterialTheme.colorScheme.primary,
            selectedBorderWidth = 1.dp
        ),
        modifier = Modifier.testTag(tag)
    )
}
