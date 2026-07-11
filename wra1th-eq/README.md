# Wra1th EQ

A dark, technical Android equalizer and audio-tuning application built with Kotlin,
Jetpack Compose, and Material 3.

Wra1th EQ exposes the audio effects that Android actually provides — `Equalizer`,
`BassBoost`, `LoudnessEnhancer`, and `AudioManager` media-volume control — behind a
device-independent 10-band reference curve, honest processing-state reporting, and a
full preset system.

> **Honesty first:** Android audio effects depend on the device, vendor audio stack,
> playback application, and active audio session. Wra1th EQ cannot guarantee
> unrestricted processing of every application without a different system-level or
> root-level DSP implementation. The active processing state is always displayed in
> the UI, and unsupported effects are shown as unsupported — never silently faked.

---

## Supported Android versions

| | |
|---|---|
| Minimum SDK | 26 (Android 8.0 Oreo) |
| Target / compile SDK | 35 (Android 15) |

## Features

- **10-band reference equalizer** (31 Hz – 16 kHz, −12…+12 dB) mapped onto the
  device's real bands via logarithmic-frequency interpolation
- **Bass boost** (0–100 %, device strength 0–1000) with strength-support detection
- **Loudness enhancement** (0 to +12 dB, converted to millibels)
- **Media-volume control** (STREAM_MUSIC only, mapped to the device's real step count)
- **Preamp / automatic headroom** with estimated headroom, clipping risk, and a
  recommended preamp value
- **10 built-in presets** (Flat, Rock, Rap, Classical, Electronic, Vocal, Bass,
  Podcast, Car Audio, Night)
- **Custom presets**: create, overwrite, duplicate, rename, delete, JSON
  import/export via the Storage Access Framework, factory reset
- **Automatic Custom mode**: any manual edit forks the state into "Custom" without
  touching the built-in definitions
- **Diagnostics screen** with device/effect capabilities, session state, mapped
  device-band gains, and a copy-to-clipboard report
- **Persistent, versioned state** in Preferences DataStore

## Architecture

MVVM with a repository layer, unidirectional data flow, and manual dependency
construction (no DI framework):

```
Compose UI  ──events──▶  ViewModels  ──updates──▶  EqPreferencesRepository (StateFlow, source of truth)
    ▲                                                       │
    └──────────── StateFlow<EqualizerState> ◀───────────────┤
                                                            ▼
                                     AudioEffectSessionManager (application-scoped)
                                                            │ serialized effect thread
                                                            ▼
                                 AudioEffectController (Equalizer / BassBoost / LoudnessEnhancer)
```

- `EqPreferencesRepository` holds the canonical `PersistedEqState` in memory
  (StateFlow) and mirrors it to DataStore as versioned JSON with a debounce.
- `AudioEffectSessionManager` (application-scoped) observes that state and applies it
  to the hardware chain, so audio processing survives screen navigation and rotation.
- ViewModels (`Equalizer`, `Presets`, `Diagnostics`, `Settings`) are thin adapters
  built with factories from the `AppContainer` in `Wra1thEqApplication`.
- All state mutations are pure functions (`EqStateTransforms`) so the custom-mode
  rules are unit-testable.

### Module layout

```
app/src/main/java/com/wra1th/eq/
├── MainActivity.kt / Wra1thEqApplication.kt
├── audio/        effect controller, session manager, capability detection,
│                 volume controller, log-frequency band mapper
├── data/         DataStore, EQ-state repository, preset storage + repository
├── model/        EqBand, EqPreset, UserEqPreset, EqualizerState, ProcessingStatus, …
├── presets/      built-in presets, reference-curve interpolation
├── ui/           Compose screens, components, navigation, dark technical theme
├── util/         dB/millibel math, headroom, volume mapping, formatting
└── viewmodel/    Equalizer / Presets / Diagnostics / Settings ViewModels
```

## Build instructions

Requirements: JDK 17+, Android SDK with platform 35 (Android Studio installs this
automatically), internet access to Google Maven and Maven Central.

```bash
cd wra1th-eq
./gradlew :app:assembleDebug          # build the debug APK
./gradlew :app:testDebugUnitTest      # run unit tests
./gradlew :app:connectedDebugAndroidTest  # Compose UI tests (device/emulator required)
```

APK output: `app/build/outputs/apk/debug/app-debug.apk`

CI: `.github/workflows/wra1th-eq-android.yml` builds the APK, runs unit tests, and
compiles the instrumentation tests on every push.

## Installation

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

Or open the `wra1th-eq` folder in Android Studio and press Run.

## Audio-effect limitations (please read)

- **Session 0 (global output mix)** is the default attachment target. It is
  deprecated by Android and honored inconsistently: many devices apply it to most
  media playback, some vendors restrict it, and apps that opt out of global effects
  (or use their own decoders/offload paths) bypass it entirely.
- **Per-app sessions**: a specific player's audio session ID (usually obtained from
  that app or a broadcast) can be entered under *Settings → Audio session* for
  diagnostics and direct attachment.
- **Effect ownership**: only one app can control an effect engine per session. If
  another equalizer holds control, Wra1th EQ reports that it does not have control
  rather than pretending to work.
- **Preamp** is a headroom-management calculation. The public effect chain has no
  guaranteed independent digital pre-gain stage, so the preamp value drives the
  recommended-headroom display and is never misrepresented as actual attenuation.
- **Band counts differ per device** (commonly 5). The 10-band reference curve is
  interpolated onto the real bands logarithmically; the Diagnostics screen shows the
  actual mapped device-band gains.

## Audio-session behavior

| State | Meaning |
|---|---|
| `ACTIVE (session N)` | Effects constructed and attached to session N |
| `WAITING FOR SESSION` | No session attached yet |
| `UNSUPPORTED` | The device/vendor stack rejected the effect classes |
| `FAILED` | Construction/attachment threw — see Diagnostics for the reason |
| `DETACHED` | Effects were explicitly released (e.g. app fully closed) |

Effects are re-initialized automatically when the target session changes, and every
previous effect instance is released before a new one is created.

## Preset format (import/export)

Presets are exchanged as standalone JSON documents:

```json
{
  "format": "wra1th-eq-preset",
  "version": 1,
  "preset": {
    "id": "…",
    "name": "Night Drive",
    "gainsDb": [4.0, 3.0, 1.0, -1.0, -2.0, 0.0, 2.0, 4.0, 5.0, 4.0],
    "bassBoostStrength": 300,
    "loudnessGainDb": 2.0,
    "preampDb": -6.0,
    "createdAtEpochMs": 1700000000000,
    "updatedAtEpochMs": 1700000000000
  }
}
```

Validation on import rejects: blank names, gain lists that are not exactly 10 values,
gains outside −24…+24 dB, bass boost outside 0…1000, loudness outside 0…24 dB, and
malformed JSON. Import/export uses the Storage Access Framework — no storage
permission is requested.

## Troubleshooting

- **"UNSUPPORTED" status** — the vendor audio stack rejected the effect classes.
  Check Diagnostics for the exact error; some devices only allow effects on real
  playback sessions, so try a manual session ID.
- **Sliders move but nothing changes** — verify the status card shows ACTIVE and
  that "effect control" is held (Diagnostics). Another EQ app (including the
  vendor's built-in one) may own the engine; disable it and use *Retry
  audio-effect attachment* in Settings.
- **No effect in a specific player** — that player likely opts out of global
  effects or uses offload/cast paths. Attach to its session ID if you can obtain
  one.
- **Bass boost greyed out** — the device reports `strengthSupported == false`; the
  control is disabled honestly instead of pretending.
- **Volume slider jumps back** — some devices restrict programmatic volume changes
  in Do Not Disturb mode.

## Known device-compatibility issues

- Some Samsung/OnePlus builds route media through SoundAlive/Dolby chains that
  ignore session-0 effects.
- Bluetooth absolute-volume devices report a non-zero minimum volume index; the
  0–100 % mapping accounts for this.
- Offloaded playback (some FLAC/hi-res paths) can bypass the effect bus entirely.
- A few vendor stacks throw `RuntimeException` from the effect constructors under
  memory pressure; Wra1th EQ catches this and reports FAILED instead of crashing.

## Future roadmap

- Playback-session discovery via `MediaSessionManager`/notification-listener opt-in
- Per-output-device preset auto-switching (wired / Bluetooth / speaker)
- Optional RMS/peak analyzer (would require microphone or Visualizer permission)
- Widget / quick-settings tile for preset switching
- Proto DataStore migration (schema v2) if the persisted state grows

## License / attribution

First release scaffolded for the CovertCloak06 repository. All code is original to
this project.
