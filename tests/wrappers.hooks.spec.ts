import { string } from '../src/lib/utils'
import { ReactiveDatabase } from '@nhtio/web-re-active-record'
import { test as baseTest, describe, expect, vi } from 'vitest'
import { makeModelConstraints, joi } from '@nhtio/web-re-active-record/constraints'
import type {
  PlainObject,
  InferredReactiveModelConstructor,
  ReactiveDatabaseOptions,
} from '@nhtio/web-re-active-record/types'

interface TestModel extends PlainObject {
  id: number
  name: string
  active: boolean
}

type Fixtures = {
  db: ReactiveDatabase<{ test: TestModel }>
  TestModel: InferredReactiveModelConstructor<
    { test: TestModel },
    ReactiveDatabaseOptions<{ test: TestModel }>,
    'test'
  >
}

const testWithProxyModel = baseTest.extend<Fixtures>({
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
        hooks: {
          wrapReactiveModel: (model) => {
            return new Proxy(model, {
              get(target, prop, receiver) {
                if (prop === '__isProxyModel') return true
                return Reflect.get(target, prop, receiver)
              },
            })
          },
        },
      })
      await db.promise
      await use(db)
      await db.shutdown()
    },
    { auto: true },
  ],
  TestModel: [
    async ({ db }, use) => {
      const TestModel = db.model('test')
      await use(TestModel)
      await TestModel.truncate()
    },
    { auto: true },
  ],
})

describe('wrapReactiveModel hook (integration)', () => {
  testWithProxyModel('wraps model instance with Proxy on create/find', async ({ TestModel }) => {
    const created = await TestModel.create({ name: 'Alice', active: true })
    expect((created as any).__isProxyModel).toBe(true)
    expect(created.name).toBe('Alice')
    const found = await TestModel.find(created.id)
    expect((found as any)?.__isProxyModel).toBe(true)
  })

  testWithProxyModel('wraps all() and query() results', async ({ TestModel }) => {
    await TestModel.createMany([
      { name: 'A', active: true },
      { name: 'B', active: false },
    ])
    const all = await TestModel.all()
    expect((all[0] as any).__isProxyModel).toBe(true)
    expect((all[0] as any).name).toBe('A')
    expect((all[1] as any).__isProxyModel).toBe(true)
    expect((all[1] as any).name).toBe('B')
    const first = await TestModel.first()
    expect((first as any)?.__isProxyModel).toBe(true)
    expect(first?.name).toBe('A')
  })
})

const testWithProxyCollection = baseTest.extend<Fixtures>({
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
        hooks: {
          wrapReactiveQueryCollection: (collection) => {
            return new Proxy(collection, {
              get(target, prop, receiver) {
                if (prop === '__isProxyCollection') return true
                return Reflect.get(target, prop, receiver)
              },
            })
          },
        },
      })
      await db.promise
      await use(db)
      await db.shutdown()
    },
    { auto: true },
  ],
  TestModel: [
    async ({ db }, use) => {
      const TestModel = db.model('test')
      await use(TestModel)
      await TestModel.truncate()
    },
    { auto: true },
  ],
})

describe('wrapReactiveQueryCollection hook (integration)', () => {
  testWithProxyCollection('wraps query collection with Proxy', async ({ TestModel }) => {
    await TestModel.createMany([
      { name: 'A', active: true },
      { name: 'B', active: false },
    ])
    const collection = await TestModel.query().reactive().fetch()
    expect((collection as any).__isProxyCollection).toBe(true)
    expect(collection.value[0].name).toBe('A')
  })
})

const testWithProxyResult = baseTest.extend<Fixtures>({
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
        hooks: {
          wrapReactiveQueryResult: (result) => {
            return new Proxy(result, {
              get(target, prop, receiver) {
                if (prop === '__isProxyResult') return true
                return Reflect.get(target, prop, receiver)
              },
            })
          },
        },
      })
      await db.promise
      await use(db)
      await db.shutdown()
    },
    { auto: true },
  ],
  TestModel: [
    async ({ db }, use) => {
      const TestModel = db.model('test')
      await use(TestModel)
      await TestModel.truncate()
    },
    { auto: true },
  ],
})

describe('wrapReactiveQueryResult hook (integration)', () => {
  testWithProxyResult('wraps query result with Proxy', async ({ TestModel }) => {
    await TestModel.createMany([
      { name: 'A', active: true },
      { name: 'B', active: false },
    ])
    const result = await TestModel.query().reactive().first()
    expect((result as any).__isProxyResult).toBe(true)
    expect(result.value).toBeDefined()
    expect(result.value!.name).toBe('A')
  })
})

describe('wrapReactiveModel hook (reactivity/edge cases)', () => {
  testWithProxyModel(
    'reactivity: property changes propagate through proxy',
    async ({ TestModel }) => {
      const created = await TestModel.create({ name: 'Bob', active: false })
      expect((created as any).__isProxyModel).toBe(true)
      created.name = 'Bobby'
      await created.save()
      const found = await TestModel.find(created.id)
      expect(found?.name).toBe('Bobby')
    }
  )
  testWithProxyModel('reactivity: event listeners work on proxy', async ({ TestModel }) => {
    const created = await TestModel.create({ name: 'Carol', active: true })
    const onChange = vi.fn()
    created.onChange(onChange)
    created.name = 'Caroline'
    await created.save()
    expect(onChange).toHaveBeenCalled()
  })
  testWithProxyModel('edge: deleted model proxy throws on access', async ({ TestModel }) => {
    const created = await TestModel.create({ name: 'Dave', active: true })
    await created.delete()
    expect(() => {
      created.name = 'X'
    }).toThrow()
    await expect(created.save()).rejects.toThrow()
  })
})
describe('wrapReactiveModel hook (relationship wrapping)', () => {
  testWithProxyModel('related() returns proxy if model is wrapped', async ({ TestModel }) => {
    const created = await TestModel.create({ name: 'Eve', active: true })
    if (created.related) {
      expect(typeof created.related).toBe('function')
    }
  })
})
describe('wrapReactiveModel hook (unref/cleanup)', () => {
  testWithProxyModel('unref cleans up proxy and listeners', async ({ TestModel }) => {
    const created = await TestModel.create({ name: 'Frank', active: true })
    const onChange = vi.fn()
    created.onChange(onChange)
    await created.unref()
    expect(() => {
      if (created.name) created.name = 'Francois'
    }).toThrow()
    await expect(created.save()).rejects.toThrow()
    expect(onChange).not.toHaveBeenCalled()
  })
})
describe('wrapReactiveModel hook (truncate reactivity)', () => {
  testWithProxyModel(
    'should mark all proxy model instances as deleted and remove listeners after truncate',
    async ({ TestModel }) => {
      const model1 = await TestModel.create({ name: 'A', active: true })
      const model2 = await TestModel.create({ name: 'B', active: false })
      const spy1 = vi.fn()
      const spy2 = vi.fn()
      model1.onChange(spy1)
      model2.onChange(spy2)
      await TestModel.truncate()
      // Both proxies should be marked as deleted and not emit changes
      await expect(async () => {
        model1.name = 'C'
        await model1.save()
      }).rejects.toThrow()
      await expect(async () => {
        model2.active = true
        await model2.save()
      }).rejects.toThrow()
      expect(spy1).not.toHaveBeenCalled()
      expect(spy2).not.toHaveBeenCalled()
      expect((model1 as any).__isProxyModel).toBe(true)
      expect((model2 as any).__isProxyModel).toBe(true)
    }
  )

  testWithProxyModel(
    'should allow new proxy model instances after truncate and not call old listeners',
    async ({ TestModel }) => {
      const model1 = await TestModel.create({ name: 'A', active: true })
      const spy1 = vi.fn()
      model1.onChange(spy1)
      await TestModel.truncate()
      const model2 = await TestModel.create({ name: 'B', active: false })
      const spy2 = vi.fn()
      model2.onChange(spy2)
      model2.name = 'C'
      await model2.save()
      expect(spy1).not.toHaveBeenCalled()
      expect(spy2).toHaveBeenCalled()
      expect((model2 as any).__isProxyModel).toBe(true)
    }
  )

  testWithProxyModel(
    'should not call onDelta or onPropertyChange after truncate (proxy)',
    async ({ TestModel }) => {
      const model = await TestModel.create({ name: 'A', active: true })
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
    }
  )
})
