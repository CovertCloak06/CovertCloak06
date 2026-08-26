package com.wra1th.eq.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Monitor
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tune
import androidx.compose.ui.graphics.vector.ImageVector

enum class AppDestination(
    val route: String,
    val label: String,
    val icon: ImageVector
) {
    Equalizer("equalizer", "Equalizer", Icons.Filled.GraphicEq),
    Presets("presets", "Presets", Icons.Filled.Tune),
    Diagnostics("diagnostics", "Diagnostics", Icons.Filled.Monitor),
    Settings("settings", "Settings", Icons.Filled.Settings)
}
