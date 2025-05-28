import { string } from '../src/lib/utils'
import { expect, describe, test as baseTest } from 'vitest'
import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import { makeModelConstraints, joi } from '@nhtio/web-re-active-record/constraints'
import type { PlainObject } from '../src/lib/types'
import type { ReactiveModel } from '../src/lib/factory_reactive_model'
import type { RelationshipConfiguration } from '@nhtio/web-re-active-record/relationships'
import type {
  InferredReactiveModelConstructor,
  ReactiveDatabaseOptions,
} from '@nhtio/web-re-active-record/types'

interface TestModel extends PlainObject {
  id: number
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

const records = [{ active: true }, { active: false }, { active: true }]

const test = baseTest.extend<TestFixtures>({
  db: [
    async ({}, use) => {
      const db = new ReactiveDatabase<{ test: TestModel }>({
        namespace: `test-db-${string.random(16)}`,
        version: 1,
        models: {
          test: {
            schema: '++id, active',
            properties: ['id', 'active'],
            primaryKey: 'id',
            relationships: {},
            constraints: makeModelConstraints<TestModel>({
              id: joi.number().integer().positive(),
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
    { auto: true },
  ],
  TestModel: [
    async ({ db }, use) => {
      const Model = db.model('test') as any
      await Promise.all(records.map((r) => Model.create(r)))
      await use(Model)
      await Model.truncate()
    },
    { auto: true },
  ],
})

describe('ReactiveQueryBuilder boolean column operations', () => {
  test('where active true', async ({ TestModel }) => {
    const res = (await TestModel.query().where('active', true).fetch()) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >[]
    expect(res.map((r) => r.active).sort()).toEqual([true, true])
  })

  test('whereNot active true', async ({ TestModel }) => {
    const res = (await TestModel.query().whereNot('active', true).fetch()) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >[]
    expect(res.map((r) => r.active)).toEqual([false])
  })

  test('andWhere active true AND active true', async ({ TestModel }) => {
    const res = (await TestModel.query()
      .where('active', true)
      .andWhere('active', true)
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(res.map((r) => r.active)).toEqual([true, true])
  })

  test('orWhere active false OR active true', async ({ TestModel }) => {
    const res = (await TestModel.query()
      .where('active', false)
      .orWhere('active', true)
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(res.map((r) => r.active).sort()).toEqual([false, true, true])
  })

  test('andWhereNot active true', async ({ TestModel }) => {
    const res = (await TestModel.query()
      .where('active', false)
      .andWhereNot('active', true)
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(res.map((r) => r.active)).toEqual([false])
  })

  test('orWhereNot active true', async ({ TestModel }) => {
    const res = (await TestModel.query()
      .where('active', true)
      .orWhereNot('active', true)
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(res.map((r) => r.active).sort()).toEqual([false, true, true])
  })
})
