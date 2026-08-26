package com.wra1th.eq

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainScreenTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun mainScreenLoads() {
        composeRule.onNodeWithTag("app_title").assertIsDisplayed()
        composeRule.onNodeWithTag("master_enable_switch").assertExists()
        composeRule.onNodeWithTag("processing_status_text").assertExists()
        composeRule.onNodeWithTag("eq_slider_0").assertExists()
        composeRule.onNodeWithTag("reset_button").assertExists()
        composeRule.onNodeWithTag("save_preset_button").assertExists()
    }

    @Test
    fun selectingAPresetHighlightsIt() {
        composeRule.onNodeWithTag("preset_chip_rock").performClick()
        composeRule.waitForIdle()
        // Rock defines band 0 at +4 dB; the slider column shows the value readout.
        composeRule.onNodeWithTag("preset_chip_rock").assertExists()
        composeRule.onNodeWithText("+4.0").assertExists()
    }

    @Test
    fun movingASliderSwitchesToCustom() {
        composeRule.onNodeWithTag("preset_chip_flat").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("eq_slider_0").performTouchInput { swipeDown() }
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("preset_chip_custom").assertExists()
    }

    @Test
    fun savePresetDialogOpensAndSaves() {
        composeRule.onNodeWithTag("save_preset_button").performClick()
        composeRule.onNodeWithTag("save_preset_dialog_title").assertIsDisplayed()

        composeRule.onNodeWithTag("save_preset_name_field").performTextClearance()
        composeRule.onNodeWithTag("save_preset_name_field").performTextInput("UI Test Preset")
        composeRule.onNodeWithTag("save_preset_confirm").performClick()
        composeRule.waitForIdle()

        // Saved preset becomes the selected one.
        composeRule.onNodeWithText("UI Test Preset").assertExists()
    }
}
