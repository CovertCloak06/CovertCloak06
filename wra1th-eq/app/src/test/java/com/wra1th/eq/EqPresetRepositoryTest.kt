package com.wra1th.eq

import com.wra1th.eq.data.EqPresetRepository
import com.wra1th.eq.data.InMemoryUserPresetStorage
import com.wra1th.eq.data.PresetOperationResult
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EqPresetRepositoryTest {

    private val storage = InMemoryUserPresetStorage()
    private var idCounter = 0
    private val repository = EqPresetRepository(
        storage = storage,
        nowEpochMs = { 1_000_000L },
        newId = { "id-${idCounter++}" }
    )

    private val gains = listOf(1f, 2f, 3f, 4f, 5f, 5f, 4f, 3f, 2f, 1f)

    @Test
    fun `create stores a preset with fresh identity`() = runTest {
        val result = repository.createPreset("My Curve", gains, 250, 1f, -5f)
        assertTrue(result is PresetOperationResult.Success)
        val stored = repository.currentUserPresets().single()
        assertEquals("My Curve", stored.name)
        assertEquals(gains, stored.gainsDb)
        assertEquals(1_000_000L, stored.createdAtEpochMs)
    }

    @Test
    fun `create with existing name overwrites in place`() = runTest {
        repository.createPreset("Same", gains, 0, 0f, 0f)
        val originalId = repository.currentUserPresets().single().id

        repository.createPreset("same", gains.map { it + 1f }, 100, 2f, -3f)
        val presets = repository.currentUserPresets()
        assertEquals(1, presets.size)
        assertEquals(originalId, presets.single().id) // overwrite keeps identity
        assertEquals(100, presets.single().bassBoostStrength)
    }

    @Test
    fun `create rejects invalid preset`() = runTest {
        val result = repository.createPreset("", gains, 0, 0f, 0f)
        assertTrue(result is PresetOperationResult.Failure)
        assertTrue(repository.currentUserPresets().isEmpty())
    }

    @Test
    fun `duplicate user preset appends copy suffix and new id`() = runTest {
        repository.createPreset("Base", gains, 0, 0f, 0f)
        val baseId = repository.currentUserPresets().single().id

        val duplicated = repository.duplicatePreset(baseId)
        assertTrue(duplicated is PresetOperationResult.Success)
        val copy = (duplicated as PresetOperationResult.Success).preset
        assertEquals("Base (copy)", copy.name)
        assertNotEquals(baseId, copy.id)
        assertEquals(2, repository.currentUserPresets().size)
    }

    @Test
    fun `duplicating twice picks a distinct name`() = runTest {
        repository.createPreset("Base", gains, 0, 0f, 0f)
        val baseId = repository.currentUserPresets().single().id
        repository.duplicatePreset(baseId)
        val second = repository.duplicatePreset(baseId) as PresetOperationResult.Success
        assertEquals("Base (copy 2)", second.preset.name)
    }

    @Test
    fun `duplicating a built-in creates an editable user preset`() = runTest {
        val result = repository.duplicatePreset("rock")
        assertTrue(result is PresetOperationResult.Success)
        val copy = (result as PresetOperationResult.Success).preset
        assertEquals("Rock (copy)", copy.name)
        assertEquals(250, copy.bassBoostStrength)
        assertEquals(1, repository.currentUserPresets().size)
    }

    @Test
    fun `built-in presets cannot be deleted`() = runTest {
        val result = repository.deletePreset("flat")
        assertTrue(result is PresetOperationResult.Failure)
        assertTrue((result as PresetOperationResult.Failure).reason.contains("Built-in"))
        assertEquals(10, repository.builtInPresets.size)
    }

    @Test
    fun `user presets can be deleted`() = runTest {
        repository.createPreset("Doomed", gains, 0, 0f, 0f)
        val id = repository.currentUserPresets().single().id
        val result = repository.deletePreset(id)
        assertTrue(result is PresetOperationResult.Success)
        assertTrue(repository.currentUserPresets().isEmpty())
    }

    @Test
    fun `deleting a missing preset fails gracefully`() = runTest {
        val result = repository.deletePreset("nope")
        assertTrue(result is PresetOperationResult.Failure)
    }

    @Test
    fun `rename validates target and name`() = runTest {
        repository.createPreset("One", gains, 0, 0f, 0f)
        repository.createPreset("Two", gains, 0, 0f, 0f)
        val oneId = repository.currentUserPresets().first { it.name == "One" }.id

        assertTrue(repository.renamePreset(oneId, "") is PresetOperationResult.Failure)
        assertTrue(repository.renamePreset(oneId, "two") is PresetOperationResult.Failure)
        assertTrue(repository.renamePreset("rock", "Rocked") is PresetOperationResult.Failure)

        val renamed = repository.renamePreset(oneId, "Uno")
        assertTrue(renamed is PresetOperationResult.Success)
        assertEquals("Uno", repository.currentUserPresets().first { it.id == oneId }.name)
    }

    @Test
    fun `import assigns a fresh identity`() = runTest {
        repository.createPreset("Export Me", gains, 300, 2f, -4f)
        val original = repository.currentUserPresets().single()
        val exported = repository.exportToJson(original)
        repository.resetToFactory()

        val imported = repository.importPreset(exported)
        assertTrue(imported is PresetOperationResult.Success)
        val restored = repository.currentUserPresets().single()
        assertNotEquals(original.id, restored.id)
        assertEquals(original.gainsDb, restored.gainsDb)
    }

    @Test
    fun `reset to factory removes all user presets`() = runTest {
        repository.createPreset("A", gains, 0, 0f, 0f)
        repository.createPreset("B", gains, 0, 0f, 0f)
        repository.resetToFactory()
        assertTrue(repository.currentUserPresets().isEmpty())
        assertEquals(10, repository.builtInPresets.size)
    }

    @Test
    fun `built-in list contains the ten required presets`() {
        assertEquals(
            listOf(
                "flat", "rock", "rap", "classical", "electronic",
                "vocal", "bass", "podcast", "car_audio", "night"
            ),
            repository.builtInPresets.map { it.id }
        )
        repository.builtInPresets.forEach { assertEquals(10, it.gainsDb.size) }
    }
}
