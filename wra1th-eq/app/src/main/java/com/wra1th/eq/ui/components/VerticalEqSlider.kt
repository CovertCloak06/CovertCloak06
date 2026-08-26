package com.wra1th.eq.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.wra1th.eq.ui.theme.MonoValueSmallStyle
import com.wra1th.eq.ui.theme.WraithTextDisabled
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Custom vertical fader for one reference EQ band. Drag or tap to set the gain.
 * Snaps to 0.5 dB steps; the value readout and frequency label are monospaced.
 */
@Composable
fun VerticalEqSlider(
    gainDb: Float,
    minDb: Float,
    maxDb: Float,
    frequencyLabel: String,
    onGainChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    showValue: Boolean = true,
    compact: Boolean = false,
    hapticsEnabled: Boolean = true,
    testTag: String = ""
) {
    val haptics = LocalHapticFeedback.current
    val accent = MaterialTheme.colorScheme.primary
    val trackColor = MaterialTheme.colorScheme.surfaceVariant
    val zeroLineColor = MaterialTheme.colorScheme.outline
    val thumbColor = if (enabled) MaterialTheme.colorScheme.onSurface else WraithTextDisabled

    val trackHeight = if (compact) 132.dp else 188.dp
    val range = maxDb - minDb

    fun gainForY(y: Float, heightPx: Float): Float {
        if (heightPx <= 0f) return 0f
        val fraction = (1f - (y / heightPx)).coerceIn(0f, 1f)
        val raw = minDb + fraction * range
        // Snap to 0.5 dB steps.
        return (raw * 2).roundToInt() / 2f
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = modifier.width(40.dp)
    ) {
        if (showValue) {
            Text(
                text = formatGain(gainDb),
                style = MonoValueSmallStyle,
                color = if (enabled) {
                    if (abs(gainDb) > 0.01f) accent else MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    WraithTextDisabled
                },
                textAlign = TextAlign.Center
            )
        }

        Box(
            modifier = Modifier
                .width(36.dp)
                .height(trackHeight)
                .then(if (testTag.isNotEmpty()) Modifier.testTag(testTag) else Modifier)
                .pointerInput(enabled, minDb, maxDb) {
                    if (!enabled) return@pointerInput
                    detectDragGestures(
                        onDragStart = {
                            if (hapticsEnabled) {
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                            }
                        },
                        onDrag = { change, _ ->
                            change.consume()
                            onGainChange(gainForY(change.position.y, size.height.toFloat()))
                        }
                    )
                }
                .pointerInput(enabled, minDb, maxDb) {
                    if (!enabled) return@pointerInput
                    detectTapGestures { offset ->
                        onGainChange(gainForY(offset.y, size.height.toFloat()))
                    }
                }
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val width = size.width
                val height = size.height
                val centerX = width / 2f
                val fraction = if (range > 0f) ((gainDb - minDb) / range).coerceIn(0f, 1f) else 0.5f
                val thumbY = (1f - fraction) * height
                val zeroFraction = if (range > 0f) ((0f - minDb) / range).coerceIn(0f, 1f) else 0.5f
                val zeroY = (1f - zeroFraction) * height

                // Track
                drawRoundRect(
                    color = trackColor,
                    topLeft = Offset(centerX - 2.dp.toPx(), 0f),
                    size = Size(4.dp.toPx(), height),
                    cornerRadius = CornerRadius(1.dp.toPx())
                )

                // Tick marks every 3 dB
                var tick = minDb
                while (tick <= maxDb + 0.01f) {
                    val tickFraction = ((tick - minDb) / range).coerceIn(0f, 1f)
                    val y = (1f - tickFraction) * height
                    drawLine(
                        color = zeroLineColor,
                        start = Offset(centerX - 7.dp.toPx(), y),
                        end = Offset(centerX + 7.dp.toPx(), y),
                        strokeWidth = if (abs(tick) < 0.01f) 2.dp.toPx() else 1.dp.toPx()
                    )
                    tick += 3f
                }

                // Fill from 0 dB to the current value
                if (enabled) {
                    val top = minOf(thumbY, zeroY)
                    val fillHeight = abs(zeroY - thumbY)
                    if (fillHeight > 0f) {
                        drawRoundRect(
                            color = accent,
                            topLeft = Offset(centerX - 2.dp.toPx(), top),
                            size = Size(4.dp.toPx(), fillHeight),
                            cornerRadius = CornerRadius(1.dp.toPx())
                        )
                    }
                }

                // Thumb
                drawRoundRect(
                    color = thumbColor,
                    topLeft = Offset(centerX - 9.dp.toPx(), thumbY - 3.dp.toPx()),
                    size = Size(18.dp.toPx(), 6.dp.toPx()),
                    cornerRadius = CornerRadius(1.5f.dp.toPx())
                )
                if (enabled) {
                    drawRoundRect(
                        color = accent,
                        topLeft = Offset(centerX - 9.dp.toPx(), thumbY - 0.5f.dp.toPx()),
                        size = Size(18.dp.toPx(), 1.dp.toPx()),
                        cornerRadius = CornerRadius(0.5f.dp.toPx())
                    )
                }
            }
        }

        Text(
            text = frequencyLabel,
            style = MonoValueSmallStyle,
            color = if (enabled) MaterialTheme.colorScheme.onSurfaceVariant else WraithTextDisabled,
            textAlign = TextAlign.Center
        )
    }
}

private fun formatGain(gainDb: Float): String {
    val value = String.format(Locale.US, "%+.1f", gainDb)
    return if (value == "+0.0" || value == "-0.0") "0.0" else value
}
