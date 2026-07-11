package com.wra1th.eq.ui

import androidx.compose.runtime.Composable
import com.wra1th.eq.ui.navigation.AppNavigation
import com.wra1th.eq.ui.theme.Wra1thEqTheme

/** Root composable: theme + navigation shell. */
@Composable
fun Wra1thEqApp() {
    Wra1thEqTheme {
        AppNavigation()
    }
}
