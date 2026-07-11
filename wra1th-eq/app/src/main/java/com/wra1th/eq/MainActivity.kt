package com.wra1th.eq

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.wra1th.eq.ui.Wra1thEqApp

class MainActivity : ComponentActivity() {

    private val container get() = (application as Wra1thEqApplication).container

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Wra1thEqApp()
        }
    }

    override fun onStart() {
        super.onStart()
        // Re-attach if effects were released when the app last fully closed.
        container.sessionManager.ensureAttached()
    }

    override fun onDestroy() {
        super.onDestroy()
        // Configuration changes keep the chain alive; a real exit releases every effect.
        if (isFinishing) {
            container.sessionManager.release()
        }
    }
}
