package com.wra1th.eq.data

import com.wra1th.eq.model.EqPreset
import com.wra1th.eq.model.UserEqPreset
import com.wra1th.eq.presets.BuiltInPresets
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.UUID

/** Result of a preset operation, with a human-readable reason on failure. */
sealed class PresetOperationResult {
    data class Success(val preset: UserEqPreset) : PresetOperationResult()
    data class Failure(val reason: String) : PresetOperationResult()
}

/** Import/export document format. Versioned so the schema can evolve. */
@Serializable
data class PresetExportDocument(
    val format: String = FORMAT,
    val version: Int = VERSION,
    val preset: UserEqPreset
) {
    companion object {
        const val FORMAT = "wra1th-eq-preset"
        const val VERSION = 1
    }
}

/** Validation rules for user presets (UI edits are clamped; imports are rejected). */
object PresetValidator {
    const val REQUIRED_BAND_COUNT = 10
    const val MIN_GAIN_DB = -24f
    const val MAX_GAIN_DB = 24f
    const val MIN_BASS_BOOST = 0
    const val MAX_BASS_BOOST = 1000
    const val MIN_LOUDNESS_DB = 0f
    const val MAX_LOUDNESS_DB = 24f

    fun validate(
        name: String,
        gainsDb: List<Float>,
        bassBoostStrength: Int,
        loudnessGainDb: Float
    ): List<String> {
        val errors = mutableListOf<String>()
        if (name.isBlank()) {
            errors += "Preset name must not be blank"
        }
        if (gainsDb.size != REQUIRED_BAND_COUNT) {
            errors += "Preset must contain exactly $REQUIRED_BAND_COUNT gain values (found ${gainsDb.size})"
        }
        gainsDb.forEachIndexed { index, gain ->
            if (gain < MIN_GAIN_DB || gain > MAX_GAIN_DB || gain.isNaN()) {
                errors += "Gain for band $index is outside $MIN_GAIN_DB..$MAX_GAIN_DB dB ($gain)"
            }
        }
        if (bassBoostStrength < MIN_BASS_BOOST || bassBoostStrength > MAX_BASS_BOOST) {
            errors += "Bass boost must be within $MIN_BASS_BOOST..$MAX_BASS_BOOST ($bassBoostStrength)"
        }
        if (loudnessGainDb < MIN_LOUDNESS_DB || loudnessGainDb > MAX_LOUDNESS_DB || loudnessGainDb.isNaN()) {
            errors += "Loudness must be within $MIN_LOUDNESS_DB..$MAX_LOUDNESS_DB dB ($loudnessGainDb)"
        }
        return errors
    }
}

/**
 * All preset operations: built-ins (immutable), user CRUD, duplication, rename,
 * JSON import/export, and factory reset. Pure Kotlin — fully unit-testable with
 * [InMemoryUserPresetStorage].
 */
class EqPresetRepository(
    private val storage: UserPresetStorage,
    private val nowEpochMs: () -> Long = System::currentTimeMillis,
    private val newId: () -> String = { UUID.randomUUID().toString() }
) {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        prettyPrint = true
    }

    val builtInPresets: List<EqPreset> = BuiltInPresets.all

    val userPresets: Flow<List<UserEqPreset>> = storage.presets

    suspend fun currentUserPresets(): List<UserEqPreset> = storage.presets.first()

    fun isBuiltIn(id: String): Boolean = BuiltInPresets.isBuiltInId(id)

    suspend fun findPreset(id: String): EqPreset? =
        BuiltInPresets.byId(id) ?: currentUserPresets().firstOrNull { it.id == id }?.toEqPreset()

    suspend fun createPreset(
        name: String,
        gainsDb: List<Float>,
        bassBoostStrength: Int,
        loudnessGainDb: Float,
        preampDb: Float
    ): PresetOperationResult {
        val errors = PresetValidator.validate(name, gainsDb, bassBoostStrength, loudnessGainDb)
        if (errors.isNotEmpty()) {
            return PresetOperationResult.Failure(errors.joinToString("; "))
        }
        val now = nowEpochMs()
        val existing = currentUserPresets()
        val trimmedName = name.trim()

        val overwriteTarget = existing.firstOrNull { it.name.equals(trimmedName, ignoreCase = true) }
        val preset = if (overwriteTarget != null) {
            overwriteTarget.copy(
                gainsDb = gainsDb,
                bassBoostStrength = bassBoostStrength,
                loudnessGainDb = loudnessGainDb,
                preampDb = preampDb,
                updatedAtEpochMs = now
            )
        } else {
            UserEqPreset(
                id = newId(),
                name = trimmedName,
                gainsDb = gainsDb,
                bassBoostStrength = bassBoostStrength,
                loudnessGainDb = loudnessGainDb,
                preampDb = preampDb,
                createdAtEpochMs = now,
                updatedAtEpochMs = now
            )
        }
        val updated = existing.filterNot { it.id == preset.id } + preset
        storage.save(updated.sortedBy { it.name.lowercase() })
        return PresetOperationResult.Success(preset)
    }

    /** Duplicate a built-in or user preset into a new user preset named "... (copy)". */
    suspend fun duplicatePreset(id: String): PresetOperationResult {
        val source = findPreset(id)
            ?: return PresetOperationResult.Failure("Preset not found")
        val existing = currentUserPresets()
        var candidate = "${source.name} (copy)"
        var suffix = 2
        while (existing.any { it.name.equals(candidate, ignoreCase = true) }) {
            candidate = "${source.name} (copy $suffix)"
            suffix++
        }
        val now = nowEpochMs()
        val copy = UserEqPreset(
            id = newId(),
            name = candidate,
            gainsDb = source.gainsDb,
            bassBoostStrength = source.bassBoostStrength,
            loudnessGainDb = source.loudnessGainDb,
            preampDb = source.preampDb ?: 0f,
            createdAtEpochMs = now,
            updatedAtEpochMs = now
        )
        storage.save((existing + copy).sortedBy { it.name.lowercase() })
        return PresetOperationResult.Success(copy)
    }

    suspend fun renamePreset(id: String, newName: String): PresetOperationResult {
        if (isBuiltIn(id)) {
            return PresetOperationResult.Failure("Built-in presets cannot be renamed")
        }
        if (newName.isBlank()) {
            return PresetOperationResult.Failure("Preset name must not be blank")
        }
        val existing = currentUserPresets()
        val target = existing.firstOrNull { it.id == id }
            ?: return PresetOperationResult.Failure("Preset not found")
        val trimmed = newName.trim()
        if (existing.any { it.id != id && it.name.equals(trimmed, ignoreCase = true) }) {
            return PresetOperationResult.Failure("A preset named \"$trimmed\" already exists")
        }
        val renamed = target.copy(name = trimmed, updatedAtEpochMs = nowEpochMs())
        storage.save(
            (existing.filterNot { it.id == id } + renamed).sortedBy { it.name.lowercase() }
        )
        return PresetOperationResult.Success(renamed)
    }

    /** Built-in presets can never be deleted. */
    suspend fun deletePreset(id: String): PresetOperationResult {
        if (isBuiltIn(id)) {
            return PresetOperationResult.Failure("Built-in presets cannot be deleted")
        }
        val existing = currentUserPresets()
        val target = existing.firstOrNull { it.id == id }
            ?: return PresetOperationResult.Failure("Preset not found")
        storage.save(existing.filterNot { it.id == id })
        return PresetOperationResult.Success(target)
    }

    fun exportToJson(preset: UserEqPreset): String =
        json.encodeToString(PresetExportDocument.serializer(), PresetExportDocument(preset = preset))

    /**
     * Parse and validate an imported preset document. Rejects blank names, wrong band
     * counts, out-of-range gains/boost/loudness, and malformed JSON.
     */
    fun parseImportedJson(raw: String): PresetOperationResult {
        val document = try {
            json.decodeFromString(PresetExportDocument.serializer(), raw)
        } catch (t: Throwable) {
            return PresetOperationResult.Failure("Invalid preset JSON: ${t.message ?: "unparseable document"}")
        }
        val preset = document.preset
        val errors = PresetValidator.validate(
            preset.name, preset.gainsDb, preset.bassBoostStrength, preset.loudnessGainDb
        )
        if (errors.isNotEmpty()) {
            return PresetOperationResult.Failure(errors.joinToString("; "))
        }
        return PresetOperationResult.Success(preset)
    }

    /** Import a validated preset under a fresh identity (new id, current timestamps). */
    suspend fun importPreset(raw: String): PresetOperationResult {
        val parsed = parseImportedJson(raw)
        if (parsed !is PresetOperationResult.Success) return parsed
        return createPreset(
            name = parsed.preset.name,
            gainsDb = parsed.preset.gainsDb,
            bassBoostStrength = parsed.preset.bassBoostStrength,
            loudnessGainDb = parsed.preset.loudnessGainDb,
            preampDb = parsed.preset.preampDb
        )
    }

    /** Remove every user preset, restoring the factory preset list. */
    suspend fun resetToFactory() {
        storage.save(emptyList())
    }
}
