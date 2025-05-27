import { string } from '../src/lib/utils'
import { describe, test as baseTest, expect } from 'vitest'
import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import { makeModelConstraints, joi } from '@nhtio/web-re-active-record/constraints'
import { ReactiveQueryBuilderIntrospector } from '@nhtio/web-re-active-record/testing'
import type { PlainObject } from '../src/lib/types'
import type { RelationshipConfiguration } from '@nhtio/web-re-active-record/relationships'
import type { ReactiveModel, ReactiveModelConstructor } from '../src/lib/factory_reactive_model'

// Test model interface
interface TestModel extends PlainObject {
  id: number
  name: string
  score: number
}

// Test fixtures interface
interface TestFixtures {
  db: ReactiveDatabase<{ test: TestModel }>
  TestModel: ReactiveModelConstructor<TestModel, 'id', Record<string, RelationshipConfiguration>>
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
            schema: '++id, name, score',
            properties: ['id', 'name', 'score'],
            primaryKey: 'id',
            relationships: {},
            constraints: makeModelConstraints<TestModel>({
              id: joi.number().integer().positive(),
              name: joi.string().min(1).max(255).required(),
              score: joi.alt(joi.number(), joi.string().allow(null)).required(),
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
      await use(
        TestModel as ReactiveModelConstructor<
          TestModel,
          'id',
          Record<string, RelationshipConfiguration>
        >
      )
      await TestModel.truncate()
    },
    {
      auto: true,
    },
  ],
})

describe('ReactiveQueryBuilder Additional Methods', () => {
  test('should handle andWhere string matching variants', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({ name: 'Test Smith', score: 10 }),
      TestModel.create({ name: 'Test SMITH', score: 20 }),
      TestModel.create({ name: 'Test Jones', score: 30 }),
      TestModel.create({ name: 'Test smith', score: 40 }),
    ])

    // Test andWhereLike
    const likeResult = (await TestModel.query()
      .where('score', '>', 15)
      .andWhereLike('name', '%Jones')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(likeResult.map((r) => r.name)).toEqual(['Test Jones'])

    // Test andWhereILike
    const iLikeResult = (await TestModel.query()
      .where('score', '>', 15)
      .andWhereILike('name', '%smith')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(iLikeResult.map((r) => r.name).sort()).toEqual(['Test SMITH', 'Test smith'])
  })

  test('should handle andWhere null variants', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({ name: 'Test1', score: null as any }),
      TestModel.create({ name: 'Test2', score: 20 }),
      TestModel.create({ name: 'Test3', score: null as any }),
      TestModel.create({ name: 'Test4', score: 40 }),
    ])

    // Test andWhereNull
    const nullResult = (await TestModel.query()
      .where('name', 'like', 'Test%')
      .andWhereNull('score')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(nullResult.map((r) => r.name).sort()).toEqual(['Test1', 'Test3'])

    // Test andWhereNotNull
    const notNullResult = (await TestModel.query()
      .where('name', 'like', 'Test%')
      .andWhereNotNull('score')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(notNullResult.map((r) => r.name).sort()).toEqual(['Test2', 'Test4'])
  })

  test('should handle andWhere variants', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({ name: 'Test1', score: 10 }),
      TestModel.create({ name: 'Test2', score: 20 }),
      TestModel.create({ name: 'Test3', score: 30 }),
      TestModel.create({ name: 'Test4', score: 40 }),
    ])

    // Test andWhereBetween
    const betweenResult = (await TestModel.query()
      .where('score', '>', 15)
      .andWhereBetween('score', [20, 35])
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(betweenResult.map((r) => r.name).sort()).toEqual(['Test2', 'Test3'])

    // Test andWhereIn
    const inResult = (await TestModel.query()
      .where('score', '>', 15)
      .andWhereIn('name', ['Test2', 'Test4'])
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(inResult.map((r) => r.name).sort()).toEqual(['Test2', 'Test4'])

    // Test andWhereNotIn
    const notInResult = (await TestModel.query()
      .where('score', '>', 15)
      .andWhereNotIn('name', ['Test2', 'Test4'])
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(notInResult.map((r) => r.name)).toEqual(['Test3'])

    // Test andWhereNotBetween
    const notBetweenResult = (await TestModel.query()
      .where('score', '>', 15)
      .andWhereNotBetween('score', [20, 35])
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(notBetweenResult.map((r) => r.name)).toEqual(['Test4'])
  })

  test('should handle orWhere variants', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({ name: 'Test1', score: 10 }),
      TestModel.create({ name: 'Test2', score: 20 }),
      TestModel.create({ name: 'Test3', score: 30 }),
      TestModel.create({ name: 'Test4', score: 40 }),
    ])

    // Test orWhereILike
    const iLikeResult = (await TestModel.query()
      .where('score', '=', 10)
      .orWhereILike('name', '%3')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(iLikeResult.map((r) => r.name).sort()).toEqual(['Test1', 'Test3'])

    // Test orWhereNotIn
    const notInResult = (await TestModel.query()
      .where('score', '=', 10)
      .orWhereNotIn('name', ['Test2', 'Test3'])
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(notInResult.map((r) => r.name).sort()).toEqual(['Test1', 'Test4'])

    // Test orWhereNotNull
    const notNullResult = (await TestModel.query()
      .whereNull('score')
      .orWhereNotNull('name')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(notNullResult.map((r) => r.name).sort()).toEqual(['Test1', 'Test2', 'Test3', 'Test4'])
  })

  test('should handle pagination and ordering', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({ name: 'Test1', score: 10 }),
      TestModel.create({ name: 'Test2', score: 20 }),
      TestModel.create({ name: 'Test3', score: 30 }),
      TestModel.create({ name: 'Test4', score: 40 }),
    ])

    // Test limit and offset
    const limitResult = (await TestModel.query()
      .orderBy('score')
      .limit(2)
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(limitResult.map((r) => r.name)).toEqual(['Test1', 'Test2'])

    const offsetResult = (await TestModel.query()
      .orderBy('score')
      .offset(2)
      .limit(2)
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(offsetResult.map((r) => r.name)).toEqual(['Test3', 'Test4'])

    // Test first and last
    const firstResult = (await TestModel.query().orderBy('score').first()) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >
    expect(firstResult?.name).toBe('Test1')

    const lastResult = (await TestModel.query().orderBy('score').last()) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >
    expect(lastResult?.name).toBe('Test4')

    // Test forPage
    const page = (await TestModel.query().orderBy('score').forPage(2, 1)) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >[]
    expect(page.map((r) => r.name)).toEqual(['Test2'])
  })

  test('should handle data modifications', async ({ TestModel }) => {
    const record = await TestModel.create({ name: 'Test1', score: 10 })
    const introspector = new ReactiveQueryBuilderIntrospector<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >()
    // Test increment
    await TestModel.query().where('id', record.id).increment('score', 5)
    let updated = await TestModel.query().where('id', record.id).first()
    expect(updated?.score).toBe(15)

    // Test decrement
    await TestModel.query().where('id', record.id).decrement('score', 3)
    updated = await TestModel.query().where('id', record.id).first()
    expect(updated?.score).toBe(12)

    // Test update
    await TestModel.query().where('id', record.id).update({ score: 20 })
    updated = await TestModel.query().where('id', record.id).first()
    expect(updated?.score).toBe(20)

    // Test delete
    await TestModel.query().where('id', record.id).delete()
    const deleted = await TestModel.query().where('id', record.id).first()
    expect(deleted).toBeUndefined()

    // Test clear
    await Promise.all([
      TestModel.create({ name: 'Test2', score: 20 }),
      TestModel.create({ name: 'Test3', score: 30 }),
    ])
    const query = TestModel.query(introspector)
    query.where('score', '>', 15).orWhere('name', 'like', 'Test%')
    expect(introspector.whereConditions.length).toBe(2)
    query.clear()
    expect(introspector.whereConditions.length).toBe(0)
    const count = await query.count()
    expect(count).toBe(2)
  })
})
