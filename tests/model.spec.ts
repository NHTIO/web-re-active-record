import { string } from '../src/lib/utils'
import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import { describe, test as baseTest, expect, expectTypeOf, vi } from 'vitest'
import { makeModelConstraints, joi } from '@nhtio/web-re-active-record/constraints'
import {
  MissingReactiveModelRecordError,
  ReactiveModelNoSuchPropertyException,
  ReactiveModelDeletedException,
  ReactiveModelUnsubscribableException,
} from '@nhtio/web-re-active-record/errors'
import type { PlainObject } from '../src/lib/types'
import type {
  InferredReactiveModelConstructor,
  ReactiveDatabaseOptions,
} from '@nhtio/web-re-active-record/types'

// Simple test model
interface TestModel extends PlainObject {
  id: number
  name: string
  active: boolean
}

interface TestFixtures {
  db: ReactiveDatabase<{ test: TestModel }>
  TestModel: InferredReactiveModelConstructor<
    { test: TestModel },
    ReactiveDatabaseOptions<{ test: TestModel }>,
    'test'
  >
}

// Create database model test with fixtures
const test = baseTest.extend<TestFixtures>({
  db: [
    async ({}, use) => {
      const db = new ReactiveDatabase<{ test: TestModel }>({
        namespace: `test-db-${string.random(16)}`,
        version: 1,
        models: {
          test: {
            schema: '++id, name, active',
            properties: ['id', 'name', 'active'],
            primaryKey: 'id',
            relationships: {},
            constraints: makeModelConstraints<TestModel>({
              id: joi.number().integer().positive(),
              name: joi.string().min(1).max(255).required(),
              active: joi.boolean().required(),
            }),
          },
        },
        psk: string.random(32),
      })

      await db.promise
      await use(db)
      await db.shutdown()
    },
    {
      auto: true,
    },
  ],
  TestModel: [
    async ({ db }, use) => {
      const TestModel = db.model('test')
      await use(TestModel)
      await TestModel.truncate()
    },
    {
      auto: true,
    },
  ],
})

describe('ReactiveModel', () => {
  test('should instantiate a model with constructor', ({ TestModel }) => {
    const model = new TestModel({
      name: 'Test Model',
      active: true,
    })

    // Type checks
    expectTypeOf(model.id).toBeNumber()
    expectTypeOf(model.name).toBeString()
    expectTypeOf(model.active).toBeBoolean()

    // Runtime checks
    expect(model.id).toBeUndefined() // id is undefined before save
    expect(model.name).toBe('Test Model')
    expect(model.active).toBe(true)
    expect(model.$dirty).toBe(true) // Initial values are considered dirty until saved
  })

  test('should create a model using static create method', async ({ TestModel }) => {
    // Create and wait for the model to be saved
    const model = await TestModel.create({
      name: 'Test Model',
      active: true,
    })

    // Runtime checks
    expect(typeof model.id).toBe('number')
    expect(model.id).toBeGreaterThan(0)
    expect(model.name).toBe('Test Model')
    expect(model.active).toBe(true)
    expect(model.$dirty).toBe(false) // No pending changes after create

    // Verify the model exists in the database
    const allModels = await TestModel.all()
    expect(allModels).toHaveLength(1)
    expect(allModels[0].id).toBe(model.id)
  })

  test('should create multiple models using static createMany method', async ({ TestModel }) => {
    const modelsToCreate = [
      { name: 'Test Model 1', active: true },
      { name: 'Test Model 2', active: false },
      { name: 'Test Model 3', active: true },
    ]

    // Create multiple models
    const models = await TestModel.createMany(modelsToCreate)

    // Verify the models were created
    const allModels = await TestModel.all()
    expect(allModels).toHaveLength(modelsToCreate.length)

    // Verify each model has correct properties
    for (const [i, model] of models.entries()) {
      expect(typeof model.id).toBe('number')
      expect(model.id).toBeGreaterThan(0)
      expect(model.name).toBe(modelsToCreate[i].name)
      expect(model.active).toBe(modelsToCreate[i].active)
      expect(model.$dirty).toBe(false)
    }

    // Verify IDs are unique
    const ids = models.map((m) => m.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(models.length)
  })

  test('should find a model by id using static find method', async ({ TestModel }) => {
    // Create a model to find
    const created = await TestModel.create({
      name: 'Test Model',
      active: true,
    })

    // Find the model by id
    const found = await TestModel.find(created.id)
    expect(found).toBeDefined()
    expect(found?.id).toBe(created.id)
    expect(found?.name).toBe(created.name)
    expect(found?.active).toBe(created.active)

    // Try to find a non-existent model
    const notFound = await TestModel.find(999999)
    expect(notFound).toBeUndefined()
  })

  test('should find multiple models by ids using static findMany method', async ({ TestModel }) => {
    // Create models to find
    const created = await TestModel.createMany([
      { name: 'Test Model 1', active: true },
      { name: 'Test Model 2', active: false },
      { name: 'Test Model 3', active: true },
    ])

    // Get a subset of ids to find
    const idsToFind = [created[0].id, created[2].id]

    // Find the models by ids
    const found = await TestModel.findMany(idsToFind)
    expect(found).toHaveLength(2)

    // Verify each found model
    expect(found[0].id).toBe(created[0].id)
    expect(found[0].name).toBe(created[0].name)
    expect(found[0].active).toBe(created[0].active)

    expect(found[1].id).toBe(created[2].id)
    expect(found[1].name).toBe(created[2].name)
    expect(found[1].active).toBe(created[2].active)

    // Try to find non-existent models
    const notFound = await TestModel.findMany([999999, 888888])
    expect(notFound).toHaveLength(0)
  })

  test('should find or fail when finding a model by id', async ({ TestModel }) => {
    // Create a model to find
    const created = await TestModel.create({
      name: 'Test Model',
      active: true,
    })

    // Find the model by id
    const found = await TestModel.findOrFail(created.id)
    expect(found.id).toBe(created.id)
    expect(found.name).toBe(created.name)
    expect(found.active).toBe(created.active)

    // Try to find a non-existent model
    await expect(TestModel.findOrFail(999999)).rejects.toThrow(MissingReactiveModelRecordError)
  })

  test('should find a model by property using static findBy method', async ({ TestModel }) => {
    // Create models to find
    await TestModel.createMany([
      { name: 'Test Model 1', active: true },
      { name: 'Test Model 2', active: false },
      { name: 'Test Model 3', active: true },
    ])

    // Find by name
    const foundByName = await TestModel.findBy('name', 'Test Model 2')
    expect(foundByName).toBeDefined()
    expect(foundByName?.name).toBe('Test Model 2')
    expect(foundByName?.active).toBe(false)

    // Find by active status
    const foundByActive = await TestModel.findBy('active', true)
    expect(foundByActive).toBeDefined()
    expect(foundByActive?.active).toBe(true)
    // Should return the first matching model
    expect(foundByActive?.name).toBe('Test Model 1')

    // Try to find by non-existent value
    const notFound = await TestModel.findBy('name', 'Non-existent Model')
    expect(notFound).toBeUndefined()
  })

  test('should find or fail when finding a model by property', async ({ TestModel }) => {
    // Create models to find
    await TestModel.createMany([
      { name: 'Test Model 1', active: true },
      { name: 'Test Model 2', active: false },
      { name: 'Test Model 3', active: true },
    ])

    // Find by name
    const foundByName = await TestModel.findByOrFail('name', 'Test Model 2')
    expect(foundByName.name).toBe('Test Model 2')
    expect(foundByName.active).toBe(false)

    // Find by active status
    const foundByActive = await TestModel.findByOrFail('active', true)
    expect(foundByActive.active).toBe(true)
    // Should return the first matching model
    expect(foundByActive.name).toBe('Test Model 1')

    // Try to find by non-existent value
    await expect(TestModel.findByOrFail('name', 'Non-existent Model')).rejects.toThrow(
      MissingReactiveModelRecordError
    )
  })

  test('should find multiple models by property using static findManyBy method', async ({
    TestModel,
  }) => {
    // Create models to find
    await TestModel.createMany([
      { name: 'Test Model 1', active: true },
      { name: 'Test Model 2', active: false },
      { name: 'Test Model 3', active: true },
    ])

    // Find by active status
    const foundByActive = await TestModel.findManyBy('active', [true])
    expect(foundByActive).toHaveLength(2)
    expect(foundByActive[0].name).toBe('Test Model 1')
    expect(foundByActive[0].active).toBe(true)
    expect(foundByActive[1].name).toBe('Test Model 3')
    expect(foundByActive[1].active).toBe(true)

    // Find by name (should return single result)
    const foundByName = await TestModel.findManyBy('name', ['Test Model 2'])
    expect(foundByName).toHaveLength(1)
    expect(foundByName[0].name).toBe('Test Model 2')
    expect(foundByName[0].active).toBe(false)

    // Try to find by non-existent value
    const notFound = await TestModel.findManyBy('name', ['Non-existent Model'])
    expect(notFound).toHaveLength(0)
  })

  test('should get first model using static first method', async ({ TestModel }) => {
    // Create models
    await TestModel.createMany([
      { name: 'Test Model 1', active: true },
      { name: 'Test Model 2', active: false },
      { name: 'Test Model 3', active: true },
    ])

    // Get first model
    const first = await TestModel.first()
    expect(first).toBeDefined()
    expect(first?.name).toBe('Test Model 1')
    expect(first?.active).toBe(true)

    // Clear database and verify first() returns undefined
    await TestModel.truncate()
    const empty = await TestModel.first()
    expect(empty).toBeUndefined()
  })

  test('should get all models using static all method', async ({ TestModel }) => {
    // Create models
    const created = await TestModel.createMany([
      { name: 'Test Model 1', active: true },
      { name: 'Test Model 2', active: false },
      { name: 'Test Model 3', active: true },
    ])

    // Get all models
    const all = await TestModel.all()
    expect(all).toHaveLength(created.length)

    // Verify models are in creation order
    for (const [i, model] of all.entries()) {
      expect(model.id).toBe(created[i].id)
      expect(model.name).toBe(created[i].name)
      expect(model.active).toBe(created[i].active)
    }

    // Clear database and verify all() returns empty array
    await TestModel.truncate()
    const empty = await TestModel.all()
    expect(empty).toHaveLength(0)
  })

  test('should get first or new model using static firstOrNew method', async ({ TestModel }) => {
    // Create a model
    await TestModel.create({
      name: 'Test Model',
      active: true,
    })

    // Get existing model
    const existing = await TestModel.firstOrNew({ name: 'Test Model' })
    expect(existing.id).toBeDefined()
    expect(existing.name).toBe('Test Model')
    expect(existing.active).toBe(true)
    expect(existing.$dirty).toBe(false)

    // Get new model
    const newModel = await TestModel.firstOrNew(
      { name: 'New Model' },
      { name: 'New Model', active: false }
    )
    expect(newModel.id).toBeUndefined()
    expect(newModel.name).toBe('New Model')
    expect(newModel.active).toBe(false)
    expect(newModel.$dirty).toBe(true) // New models are dirty until saved

    // Verify new model wasn't saved
    const all = await TestModel.all()
    expect(all).toHaveLength(1)
  })

  test('should get first or create model using static firstOrCreate method', async ({
    TestModel,
  }) => {
    // Create a model
    await TestModel.create({
      name: 'Test Model',
      active: true,
    })

    // Get existing model
    const existing = await TestModel.firstOrCreate({ name: 'Test Model' })
    expect(existing.id).toBeDefined()
    expect(existing.name).toBe('Test Model')
    expect(existing.active).toBe(true)
    expect(existing.$dirty).toBe(false)

    // Create new model
    const newModel = await TestModel.firstOrCreate(
      { name: 'New Model' },
      { name: 'New Model', active: false }
    )
    expect(newModel.id).toBeDefined()
    expect(newModel.name).toBe('New Model')
    expect(newModel.active).toBe(false)
    expect(newModel.$dirty).toBe(false)

    // Verify new model was saved
    const all = await TestModel.all()
    expect(all).toHaveLength(2)
  })

  test('should update or create model using static updateOrCreate method', async ({
    TestModel,
  }) => {
    // Create a model
    await TestModel.create({
      name: 'Test Model',
      active: true,
    })
    const allAfterCreate = await TestModel.all()
    expect(allAfterCreate).toHaveLength(1)

    // Update existing model
    const updated = await TestModel.updateOrCreate({ name: 'Test Model' }, { active: false })
    expect(updated.id).toBeDefined()
    expect(updated.name).toBe('Test Model')
    expect(updated.active).toBe(false)
    expect(updated.$dirty).toBe(false)
    const allAfterUpdate = await TestModel.all()
    expect(allAfterUpdate).toHaveLength(1)

    // Create new model
    const created = await TestModel.updateOrCreate({ name: 'New Model' }, { active: true })
    expect(created.id).toBeDefined()
    expect(created.name).toBe('New Model')
    expect(created.active).toBe(true)
    expect(created.$dirty).toBe(false)
    const allAfterCreateNew = await TestModel.all()
    expect(allAfterCreateNew).toHaveLength(2)

    // Verify database state
    const all = await TestModel.all()
    expect(all).toHaveLength(2)
    expect(all.find((m) => m.name === 'Test Model')?.active).toBe(false)
    expect(all.find((m) => m.name === 'New Model')?.active).toBe(true)
  })

  test('should truncate all models using static truncate method', async ({ TestModel }) => {
    // Create some models
    await TestModel.createMany([
      { name: 'Test Model 1', active: true },
      { name: 'Test Model 2', active: false },
      { name: 'Test Model 3', active: true },
    ])

    // Verify models exist
    const before = await TestModel.all()
    expect(before).toHaveLength(3)

    // Truncate table
    await TestModel.truncate()

    // Verify models were deleted
    const after = await TestModel.all()
    expect(after).toHaveLength(0)
  })

  test('should fill undefined model properties', async ({ TestModel }) => {
    // Create a model with only name property
    const model = new TestModel({
      name: 'Test Model',
    })

    // Fill missing active property
    model.fill({
      name: 'Should Not Change',
      active: true,
    })

    // Verify only undefined properties were filled
    expect(model.name).toBe('Test Model') // Should not change existing property
    expect(model.active).toBe(true) // Should fill undefined property
    expect(model.$dirty).toBe(true)

    // Save changes
    await model.save()
    expect(model.$dirty).toBe(false)

    // Verify changes were saved
    const found = await TestModel.find(model.id)
    expect(found?.name).toBe('Test Model')
    expect(found?.active).toBe(true)
  })

  test('should handle related models correctly', async ({ TestModel }) => {
    // Create a model
    const model = await TestModel.create({
      name: 'Test Model',
      active: true,
    })

    // Verify relationships property exists
    expect(model.hasOwnProperty('relationships')).toBe(false)

    // Attempting to access non-existent relationship should throw
    await expect(model.related('nonexistent')).rejects.toThrow(ReactiveModelNoSuchPropertyException)
  })

  test('should convert model to string format', async ({ TestModel }) => {
    // Create a model
    const model = await TestModel.create({
      name: 'Test Model',
      active: true,
    })

    // Convert to string
    const str = model.toString()

    // Verify string format starts with model name
    expect(str.startsWith('ReactiveTest')).toBe(true)
    // Rest of string should be encrypted data
    expect(str.length).toBeGreaterThan('ReactiveTest'.length)
  })

  test('should track dirty state when using merge', async ({ TestModel }) => {
    // Create a new model
    const model = new TestModel({
      name: 'Test Model',
      active: true,
    })

    // Initial state should be dirty
    expect(model.$dirty).toBe(true)

    await model.save() // Save initial state, which should clear dirty state
    expect(model.$dirty).toBe(false)
    expect(model.id).toBeDefined()

    // Modify properties using merge
    model.merge({
      name: 'Updated Model',
    })
    expect(model.$dirty).toBe(true)

    // Save changes
    await model.save()
    expect(model.$dirty).toBe(false)

    // Modify multiple properties
    model.merge({
      name: 'Modified Model',
      active: false,
    })
    expect(model.$dirty).toBe(true)

    // Reset changes
    model.reset()
    expect(model.$dirty).toBe(false)
    expect(model.name).toBe('Updated Model')
    expect(model.active).toBe(true)
  })

  test('should track pending state during async operations', async ({ TestModel }) => {
    // Create a new model
    const model = new TestModel({
      name: 'Test Model',
      active: true,
    })

    // Initial state should be dirty
    expect(model.$dirty).toBe(true)
    expect(Object.keys(model.$pending)).toHaveLength(2)

    // Save initial state, which should clear dirty state
    await model.save()
    expect(model.$dirty).toBe(false)
    expect(Object.keys(model.$pending)).toHaveLength(0)

    // Modify property to create pending change
    model.merge({
      name: 'Updated Model',
    })
    expect(Object.keys(model.$pending)).toHaveLength(1)

    // Save should clear pending changes
    await model.save()
    expect(Object.keys(model.$pending)).toHaveLength(0)
  })

  test('should provide primary key through key property', async ({ TestModel }) => {
    // Create a new model
    const model = await TestModel.create({
      name: 'Test Model',
      active: true,
    })

    // Key should match id for this model
    expect(model.$key).toBe(model.id)
    expect(typeof model.$key).toBe('number')
    expect(model.$key).toBeGreaterThan(0)
  })

  test('should handle once listeners correctly', async ({ TestModel }) => {
    const model = await TestModel.create({
      name: 'Test Model',
      active: true,
    })

    // Mock event listeners
    const onceChangeMock = vi.fn()
    const oncePropertyChangeMock = vi.fn()
    const onceDeltaMock = vi.fn()

    // Set up once listeners
    model.onceChange(onceChangeMock)
    model.oncePropertyChange('name', oncePropertyChangeMock)
    model.onceDelta(onceDeltaMock)

    // Make multiple changes
    model.name = 'First Update'
    await model.save()
    model.name = 'Second Update'
    await model.save()
    model.active = false
    await model.save()

    // Verify listeners were only called once
    expect(onceChangeMock).toHaveBeenCalledTimes(1)
    expect(oncePropertyChangeMock).toHaveBeenCalledTimes(1)
    expect(onceDeltaMock).toHaveBeenCalledTimes(1)

    // Verify onceChange was called with correct values (new state, old state)
    expect(onceChangeMock).toHaveBeenCalledWith(
      {
        id: model.id,
        name: 'First Update',
        active: true,
      },
      {
        id: undefined, // old state should not have id yet
        name: 'Test Model',
        active: undefined, // old state should not have active yet
      }
    )

    // Verify oncePropertyChange was called with correct arguments
    expect(oncePropertyChangeMock).toHaveBeenCalledWith(
      'First Update', // is - new value
      'Test Model' // was - previous value
    )

    // Verify onceDelta was called with correct value
    expect(onceDeltaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: {
          was: 'Test Model',
          is: 'First Update',
        },
      })
    )

    // Verify subsequent changes didn't trigger listeners
    expect(onceChangeMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Second Update',
      })
    )
    expect(oncePropertyChangeMock).not.toHaveBeenCalledWith('Second Update', 'First Update')
    expect(onceDeltaMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        name: {
          was: 'First Update',
          is: 'Second Update',
        },
      })
    )
  })

  test('should handle unsubscribing from events correctly', async ({ TestModel }) => {
    const model = await TestModel.create({
      name: 'Test Model',
      active: true,
    })

    // Mock event listeners
    const onChangeMock = vi.fn()
    const onPropertyChangeMock = vi.fn()
    const onDeltaMock = vi.fn()

    // Set up listeners
    model.onChange(onChangeMock)
    model.onPropertyChange('name', onPropertyChangeMock)
    model.onDelta(onDeltaMock)

    // Make initial changes - listeners should be called
    model.name = 'First Update'
    await model.save()

    // Verify initial calls with both new and old states
    expect(onChangeMock).toHaveBeenCalledWith(
      {
        id: model.id,
        name: 'First Update',
        active: true,
      },
      {
        id: undefined, // old state should not have id yet
        name: 'Test Model',
        active: undefined, // old state should not have active yet
      }
    )
    expect(onPropertyChangeMock).toHaveBeenCalledWith(
      'First Update', // is - new value
      'Test Model' // was - previous value
    )
    expect(onDeltaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: {
          was: 'Test Model',
          is: 'First Update',
        },
      })
    )

    // Clear mock call counts
    onChangeMock.mockClear()
    onPropertyChangeMock.mockClear()
    onDeltaMock.mockClear()

    // Unsubscribe from events
    model.offChange(onChangeMock)
    model.offPropertyChange('name', onPropertyChangeMock)
    model.offDelta(onDeltaMock)

    // Make more changes - listeners should not be called
    model.name = 'Second Update'
    await model.save()
    model.active = false
    await model.save()

    // Verify no calls after unsubscribing
    expect(onChangeMock).not.toHaveBeenCalled()
    expect(onPropertyChangeMock).not.toHaveBeenCalled()
    expect(onDeltaMock).not.toHaveBeenCalled()
  })

  test('should handle deleted model state correctly', async ({ TestModel }) => {
    // Create a model to delete
    const model = await TestModel.create({
      name: 'Test Model',
      active: true,
    })
    const originalId = model.id
    const originalName = model.name
    const originalActive = model.active

    // Verify model exists in database
    const beforeDelete = await TestModel.find(model.id)
    expect(beforeDelete).toBeDefined()

    // Delete the model
    await model.delete()

    // Verify model was deleted from database
    const afterDelete = await TestModel.find(model.id)
    expect(afterDelete).toBeUndefined()

    // Verify properties are still readable
    expect(model.id).toBe(originalId)
    expect(model.name).toBe(originalName)
    expect(model.active).toBe(originalActive)

    // Verify property writes throw ReactiveModelDeletedException
    expect(() => {
      model.name = 'New Name'
    }).toThrow(ReactiveModelDeletedException)
    expect(() => {
      model.active = false
    }).toThrow(ReactiveModelDeletedException)

    // Verify model operations throw ReactiveModelDeletedException
    await expect(model.save()).rejects.toThrow(ReactiveModelDeletedException)
    expect(() => model.merge({ name: 'New Name' })).toThrow(ReactiveModelDeletedException)
    expect(() => model.fill({ active: false })).toThrow(ReactiveModelDeletedException)
    expect(() => model.reset()).toThrow(ReactiveModelDeletedException)

    // Verify event subscriptions throw ReactiveModelUnsubscribableException
    expect(() => model.onChange(() => {})).toThrow(ReactiveModelUnsubscribableException)
    expect(() => model.onDelta(() => {})).toThrow(ReactiveModelUnsubscribableException)
    expect(() => model.onPropertyChange('name', () => {})).toThrow(
      ReactiveModelUnsubscribableException
    )

    // Verify read-only operations still work
    expect(model.toObject()).toEqual({
      id: originalId,
      name: originalName,
      active: originalActive,
    })
    expect(model.toJSON()).toEqual({
      id: originalId,
      name: originalName,
      active: originalActive,
    })
    expect(model.$key).toBe(originalId)
  })
})
