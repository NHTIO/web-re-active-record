import { test as base, expect, vi } from 'vitest'
import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import type {
  InferredReactiveModelConstructor,
  ReactiveDatabaseOptions,
} from '@nhtio/web-re-active-record/types'

type Test = { id: number; name: string; age: number }

const test = base.extend<{
  db: ReactiveDatabase<{ test: Test }>
  TestModel: InferredReactiveModelConstructor<
    { test: Test },
    ReactiveDatabaseOptions<{ test: Test }>,
    'test'
  >
}>({
  async db({}, use) {
    const db = new ReactiveDatabase<{ test: Test }>({
      initial: {
        loggers: {
          emerg: [],
          alert: [],
          crit: [],
          error: [],
          warning: [],
          notice: [],
          info: [],
          debug: [],
        },
        subscriptions: [],
      },
      namespace: 'testdb_reactivity',
      version: 1,
      models: {
        test: {
          schema: '++id,name,age',
          properties: ['id', 'name', 'age'],
          primaryKey: 'id',
          relationships: {},
        },
      },
      psk: '1234567890abcdef',
    })
    await db.promise
    await use(db)
    await db.shutdown()
  },
  async TestModel({ db }, use) {
    const TestModel = db.model('test')
    await use(TestModel)
    await TestModel.truncate()
  },
})

test('should call onChange when any property changes', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const spy = vi.fn()
  model.onChange(spy)
  model.name = 'B'
  await model.save()
  expect(spy).toHaveBeenCalled()
})

test('should call onPropertyChange for a specific property', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const spy = vi.fn()
  model.onPropertyChange('age', spy)
  model.age = 2
  await model.save()
  expect(spy).toHaveBeenCalledWith(2, 1)
})

test('should call onDelta when any property changes', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const spy = vi.fn()
  model.onDelta(spy)
  model.name = 'C'
  await model.save()
  expect(spy).toHaveBeenCalled()
})

test('should not call onChange after model is deleted', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const spy = vi.fn()
  model.onChange(spy)
  await model.delete()
  // Try to update after deletion and expect an error
  await expect(async () => {
    model.name = 'Z'
    await model.save()
  }).rejects.toThrow()
  // The spy should not have been called at all
  expect(spy).not.toHaveBeenCalled()
})

test('should call all listeners when multiple onChange are registered', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const spy1 = vi.fn()
  const spy2 = vi.fn()
  model.onChange(spy1)
  model.onChange(spy2)
  model.name = 'B'
  await model.save()
  expect(spy1).toHaveBeenCalled()
  expect(spy2).toHaveBeenCalled()
})

test('should not call removed listener after offChange', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const spy = vi.fn()
  model.onChange(spy)
  model.offChange(spy)
  model.name = 'B'
  await model.save()
  expect(spy).not.toHaveBeenCalled()
})

test('should not emit change if value is unchanged', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const spy = vi.fn()
  model.onChange(spy)
  model.name = 'A' // same as before
  await model.save()
  expect(spy).not.toHaveBeenCalled()
})

test('should emit one event for batch changes', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const spy = vi.fn()
  model.onChange(spy)
  model.name = 'B'
  model.age = 2
  await model.save()
  expect(spy).toHaveBeenCalledTimes(1)
})

test('should only call onceChange once', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const spy = vi.fn()
  model.onceChange(spy)
  model.name = 'B'
  await model.save()
  model.name = 'C'
  await model.save()
  expect(spy).toHaveBeenCalledTimes(1)
})

test('should not call onChange until save is called', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const spy = vi.fn()
  model.onChange(spy)
  model.name = 'B'
  expect(spy).not.toHaveBeenCalled()
  await model.save()
  expect(spy).toHaveBeenCalled()
})

test('should call onChange for initial save of new instance', async ({ TestModel }) => {
  const model = new TestModel({ name: 'A', age: 1 })
  const spy = vi.fn()
  model.onChange(spy)
  await model.save()
  expect(spy).toHaveBeenCalled()
})

test('should not call onChange after truncate', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const spy = vi.fn()
  model.onChange(spy)
  await TestModel.truncate()
  // Expect exception when setting property after truncate
  await expect(async () => {
    model.name = 'B'
    await model.save()
  }).rejects.toThrow()
  expect(spy).not.toHaveBeenCalled()
})

test('should not call old listeners after delete and recreate', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const spy = vi.fn()
  model.onChange(spy)
  await model.delete()
  const model2 = await TestModel.create({ name: 'A', age: 1 })
  const spy2 = vi.fn()
  model2.onChange(spy2)
  model2.name = 'B'
  await model2.save()
  expect(spy).not.toHaveBeenCalled()
  expect(spy2).toHaveBeenCalled()
})

test('should not prevent other listeners if one throws', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const spy1 = vi.fn(() => {
    throw new Error('fail')
  })
  const spy2 = vi.fn()
  model.onChange(spy1)
  model.onChange(spy2)
  model.name = 'B'
  await model.save()
  expect(spy2).toHaveBeenCalled()
})

test('should mark all instances as deleted and remove listeners after truncate', async ({
  TestModel,
}) => {
  const model1 = await TestModel.create({ name: 'A', age: 1 })
  const model2 = await TestModel.create({ name: 'B', age: 2 })
  const spy1 = vi.fn()
  const spy2 = vi.fn()
  model1.onChange(spy1)
  model2.onChange(spy2)
  await TestModel.truncate()
  // Both models should be marked as deleted and not emit changes
  await expect(async () => {
    model1.name = 'C'
    await model1.save()
  }).rejects.toThrow()
  await expect(async () => {
    model2.age = 3
    await model2.save()
  }).rejects.toThrow()
  expect(spy1).not.toHaveBeenCalled()
  expect(spy2).not.toHaveBeenCalled()
})

test('should allow new instances after truncate and not call old listeners', async ({
  TestModel,
}) => {
  const model1 = await TestModel.create({ name: 'A', age: 1 })
  const spy1 = vi.fn()
  model1.onChange(spy1)
  await TestModel.truncate()
  const model2 = await TestModel.create({ name: 'B', age: 2 })
  const spy2 = vi.fn()
  model2.onChange(spy2)
  model2.name = 'C'
  await model2.save()
  expect(spy1).not.toHaveBeenCalled()
  expect(spy2).toHaveBeenCalled()
})

test('should not call onDelta or onPropertyChange after truncate', async ({ TestModel }) => {
  const model = await TestModel.create({ name: 'A', age: 1 })
  const deltaSpy = vi.fn()
  const propSpy = vi.fn()
  model.onDelta(deltaSpy)
  model.onPropertyChange('name', propSpy)
  await TestModel.truncate()
  await expect(async () => {
    model.name = 'Z'
    await model.save()
  }).rejects.toThrow()
  expect(deltaSpy).not.toHaveBeenCalled()
  expect(propSpy).not.toHaveBeenCalled()
})
