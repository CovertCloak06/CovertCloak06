package com.wra1th.eq

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AppNavigationTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun navigatesBetweenAllScreens() {
        composeRule.onNodeWithTag("nav_presets").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("BUILT-IN").assertExists()

        composeRule.onNodeWithTag("nav_diagnostics").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("copy_diagnostics_button").assertExists()

        composeRule.onNodeWithTag("nav_settings").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("retry_attachment_button").assertExists()

        composeRule.onNodeWithTag("nav_equalizer").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("app_title").assertExists()
    }

    @Test
    fun presetsScreenAppliesPreset() {
        composeRule.onNodeWithTag("nav_presets").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("apply_vocal").performClick()
        composeRule.waitForIdle()

        composeRule.onNodeWithTag("nav_equalizer").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("+5.0").assertExists()
    }
}
