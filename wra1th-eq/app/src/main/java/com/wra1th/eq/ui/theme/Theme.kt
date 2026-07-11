package com.wra1th.eq.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

private val WraithColorScheme = darkColorScheme(
    primary = WraithAccent,
    onPrimary = WraithOnAccent,
    primaryContainer = WraithAccentDim,
    onPrimaryContainer = WraithTextPrimary,
    secondary = WraithAccentDim,
    onSecondary = WraithTextPrimary,
    secondaryContainer = WraithPanelAlt,
    onSecondaryContainer = WraithTextPrimary,
    tertiary = WraithWarning,
    onTertiary = WraithBackground,
    background = WraithBackground,
    onBackground = WraithTextPrimary,
    surface = WraithPanel,
    onSurface = WraithTextPrimary,
    surfaceVariant = WraithPanelAlt,
    onSurfaceVariant = WraithTextSecondary,
    surfaceContainer = WraithPanel,
    surfaceContainerHigh = WraithPanelAlt,
    surfaceContainerHighest = WraithPanelAlt,
    surfaceContainerLow = WraithPanel,
    surfaceContainerLowest = WraithBackground,
    error = WraithError,
    onError = WraithBackground,
    outline = WraithBorder,
    outlineVariant = WraithBorder
)

/** Minimal rounded corners: sharp, technical panels. */
private val WraithShapes = Shapes(
    extraSmall = RoundedCornerShape(2.dp),
    small = RoundedCornerShape(3.dp),
    medium = RoundedCornerShape(4.dp),
    large = RoundedCornerShape(6.dp),
    extraLarge = RoundedCornerShape(8.dp)
)

@Composable
fun Wra1thEqTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = WraithColorScheme,
        typography = WraithTypography,
        shapes = WraithShapes,
        content = content
    )
}
