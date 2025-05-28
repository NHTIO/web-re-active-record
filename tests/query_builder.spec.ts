import { string } from '../src/lib/utils'
import { describe, test as baseTest, expect } from 'vitest'
import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import { makeModelConstraints, joi } from '@nhtio/web-re-active-record/constraints'
import type { PlainObject } from '../src/lib/types'
import type { ReactiveModel } from '../src/lib/factory_reactive_model'
import type { ReactiveQueryBuilder } from '@nhtio/web-re-active-record/types'
import type { RelationshipConfiguration } from '@nhtio/web-re-active-record/relationships'
import type {
  InferredReactiveModelConstructor,
  ReactiveDatabaseOptions,
} from '@nhtio/web-re-active-record/types'

// Test model interface
interface TestModel extends PlainObject {
  id: number
  name: string
  score: number
}

// Test fixtures interface
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
            schema: '++id, name, score',
            properties: ['id', 'name', 'score'],
            primaryKey: 'id',
            relationships: {},
            constraints: makeModelConstraints<TestModel>({
              id: joi.number().integer().positive(),
              name: joi.string().min(1).max(255).required(),
              score: joi
                .alt(joi.number().required(), joi.string().valid(null).required())
                .required(),
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

describe('ReactiveQueryBuilder', () => {
  test('should filter records using where with key-value', async ({ TestModel }) => {
    // Create test records
    await Promise.all([
      TestModel.create({ name: 'Alice', score: 85 }),
      TestModel.create({ name: 'Bob', score: 75 }),
      TestModel.create({ name: 'Charlie', score: 95 }),
    ])

    // Test simple where clause with key-value
    const result = (await TestModel.query().where('name', 'Bob').fetch()) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >[]
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Bob')
    expect(result[0].score).toBe(75)
  })

  test('should filter records using where with operator', async ({ TestModel }) => {
    // Create test records
    await Promise.all([
      TestModel.create({ name: 'Alice', score: 85 }),
      TestModel.create({ name: 'Bob', score: 75 }),
      TestModel.create({ name: 'Charlie', score: 95 }),
    ])

    // Test where clause with operator
    const highScores = (await TestModel.query().where('score', '>', 80).fetch()) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >[]
    expect(highScores).toHaveLength(2)
    expect(highScores.map((r) => r.name).sort()).toEqual(['Alice', 'Charlie'])
  })

  test('should filter records using where with object conditions', async ({ TestModel }) => {
    // Create test records
    await Promise.all([
      TestModel.create({ name: 'Alice', score: 85 }),
      TestModel.create({ name: 'Bob', score: 75 }),
      TestModel.create({ name: 'Charlie', score: 95 }),
    ])

    // Test where with object conditions
    const result = (await TestModel.query()
      .where({ name: 'Bob', score: 75 })
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Bob')
    expect(result[0].score).toBe(75)
  })

  test('should filter records using where with callback', async ({ TestModel }) => {
    // Create test records
    await Promise.all([
      TestModel.create({ name: 'Alice', score: 85 }),
      TestModel.create({ name: 'Bob', score: 75 }),
      TestModel.create({ name: 'Charlie', score: 95 }),
    ])

    // Test where with callback (grouped conditions)
    const result = (await TestModel.query()
      .where((query: ReactiveQueryBuilder<any, any, any, any, any, any>) => {
        query.where('score', '>', 80).where('score', '<', 90)
      })
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Alice')
    expect(result[0].score).toBe(85)
  })

  test('should filter records using where with boolean', async ({ TestModel }) => {
    // Create test records
    await Promise.all([
      TestModel.create({ name: 'Alice', score: 85 }),
      TestModel.create({ name: 'Bob', score: 75 }),
      TestModel.create({ name: 'Charlie', score: 95 }),
    ])

    // Test where with boolean true (should return all records)
    const allRecords = (await TestModel.query().where(true).fetch()) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >[]

    expect(allRecords).toHaveLength(3)

    // Test where with boolean false (should return no records)
    const noRecords = (await TestModel.query().where(false).fetch()) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >[]

    expect(noRecords).toHaveLength(0)
  })

  test('should filter records using andWhere and orWhere', async ({ TestModel }) => {
    // Create test records
    await Promise.all([
      TestModel.create({ name: 'Alice', score: 85 }),
      TestModel.create({ name: 'Bob', score: 75 }),
      TestModel.create({ name: 'Charlie', score: 95 }),
      TestModel.create({ name: 'David', score: 85 }),
    ])

    // Test andWhere (should find Alice with score 85)
    const andResult = (await TestModel.query()
      .where('name', 'Alice')
      .andWhere('score', 85)
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(andResult).toHaveLength(1)
    expect(andResult[0].name).toBe('Alice')
    expect(andResult[0].score).toBe(85)

    // Test orWhere (should find both Alice and David with score 85)
    const orResult = (await TestModel.query()
      .where('name', 'Alice')
      .orWhere('name', 'David')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(orResult).toHaveLength(2)
    expect(orResult.map((r) => r.name).sort()).toEqual(['Alice', 'David'])
    expect(new Set(orResult.map((r) => r.score))).toEqual(new Set([85]))
  })

  test('should filter records using whereNot variants', async ({ TestModel }) => {
    // Create test records
    await Promise.all([
      TestModel.create({ name: 'Alice', score: 85 }),
      TestModel.create({ name: 'Bob', score: 75 }),
      TestModel.create({ name: 'Charlie', score: 95 }),
      TestModel.create({ name: 'David', score: 85 }),
    ])

    // Test whereNot with key-value
    const notResult = (await TestModel.query().whereNot('score', 85).fetch()) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >[]

    expect(notResult).toHaveLength(2)
    expect(notResult.map((r) => r.name).sort()).toEqual(['Bob', 'Charlie'])

    // Test whereNot with key-value (alternative syntax)
    const notResult2 = (await TestModel.query()
      .whereNot('score', '=', 85)
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(notResult2).toHaveLength(2)
    expect(notResult2.map((r) => r.name).sort()).toEqual(['Bob', 'Charlie'])

    // Test whereNot with object conditions
    const notObjectResult = (await TestModel.query()
      .whereNot({ score: 85, name: 'Alice' })
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(notObjectResult.length).toBeGreaterThan(0)
    expect(notObjectResult.map((r) => r.name)).not.toContain('Alice')

    // Test orWhereNot
    const orNotResult = (await TestModel.query()
      .where('score', 85)
      .orWhereNot('name', 'Bob')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(orNotResult).toHaveLength(3)
    expect(orNotResult.map((r) => r.name).sort()).toEqual(['Alice', 'Charlie', 'David'])
  })

  test('should filter records using whereIn and whereNotIn', async ({ TestModel }) => {
    // Create test records
    await Promise.all([
      TestModel.create({ name: 'Alice', score: 85 }),
      TestModel.create({ name: 'Bob', score: 75 }),
      TestModel.create({ name: 'Charlie', score: 95 }),
      TestModel.create({ name: 'David', score: 85 }),
    ])

    // Test whereIn with array of values
    const inResult = (await TestModel.query()
      .whereIn('name', ['Alice', 'Bob'])
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(inResult).toHaveLength(2)
    expect(inResult.map((r) => r.name).sort()).toEqual(['Alice', 'Bob'])

    // Test whereNotIn with array of values
    const notInResult = (await TestModel.query()
      .whereNotIn('score', [75, 95])
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(notInResult).toHaveLength(2)
    expect(notInResult.map((r) => r.name).sort()).toEqual(['Alice', 'David'])

    // Test orWhereIn
    const orInResult = (await TestModel.query()
      .where('score', 85)
      .orWhereIn('name', ['Bob', 'Charlie'])
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(orInResult).toHaveLength(4)
    expect(orInResult.map((r) => r.name).sort()).toEqual(['Alice', 'Bob', 'Charlie', 'David'])
  })

  test('should filter records using whereNull and whereNotNull', async ({ TestModel }) => {
    // Create test records with null values
    await Promise.all([
      TestModel.create({ name: 'Alice', score: null }),
      TestModel.create({ name: 'Bob', score: 75 }),
      TestModel.create({ name: 'Charlie', score: null }),
      TestModel.create({ name: 'David', score: 85 }),
    ])

    // Test whereNull
    const nullResult = (await TestModel.query().whereNull('score').fetch()) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >[]

    expect(nullResult).toHaveLength(2)
    expect(nullResult.map((r) => r.name).sort()).toEqual(['Alice', 'Charlie'])

    // Test whereNotNull
    const notNullResult = (await TestModel.query().whereNotNull('score').fetch()) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >[]

    expect(notNullResult).toHaveLength(2)
    expect(notNullResult.map((r) => r.name).sort()).toEqual(['Bob', 'David'])

    // Test orWhereNull
    const orNullResult = (await TestModel.query()
      .where('name', 'Bob')
      .orWhereNull('score')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(orNullResult).toHaveLength(3)
    expect(orNullResult.map((r) => r.name).sort()).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  test('should filter records using whereBetween and whereNotBetween', async ({ TestModel }) => {
    // Create test records
    await Promise.all([
      TestModel.create({ name: 'Alice', score: 85 }),
      TestModel.create({ name: 'Bob', score: 75 }),
      TestModel.create({ name: 'Charlie', score: 95 }),
      TestModel.create({ name: 'David', score: 65 }),
    ])

    // Test whereBetween
    const betweenResult = (await TestModel.query()
      .whereBetween('score', [70, 90])
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(betweenResult).toHaveLength(2)
    expect(betweenResult.map((r) => r.name).sort()).toEqual(['Alice', 'Bob'])

    // Test whereNotBetween
    const notBetweenResult = (await TestModel.query()
      .whereNotBetween('score', [70, 90])
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(notBetweenResult).toHaveLength(2)
    expect(notBetweenResult.map((r) => r.name).sort()).toEqual(['Charlie', 'David'])

    // Test orWhereBetween
    const orBetweenResult = (await TestModel.query()
      .where('name', 'Charlie')
      .orWhereBetween('score', [70, 90])
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(orBetweenResult).toHaveLength(3)
    expect(orBetweenResult.map((r) => r.name).sort()).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  test('should filter records using whereLike and whereILike', async ({ TestModel }) => {
    // Create test records
    await Promise.all([
      TestModel.create({ name: 'Alice Smith', score: 85 }),
      TestModel.create({ name: 'Bob SMITH', score: 75 }),
      TestModel.create({ name: 'Charlie', score: 95 }),
      TestModel.create({ name: 'David smith', score: 65 }),
    ])

    // Test whereLike (case-sensitive)
    const likeResult = (await TestModel.query()
      .whereLike('name', '%Smith')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(likeResult).toHaveLength(1)
    expect(likeResult[0].name).toBe('Alice Smith')

    // Test whereILike (case-insensitive)
    const iLikeResult = (await TestModel.query()
      .whereILike('name', '%smith%')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(iLikeResult).toHaveLength(3)
    expect(iLikeResult.map((r) => r.name).sort()).toEqual([
      'Alice Smith',
      'Bob SMITH',
      'David smith',
    ])

    // Test orWhereLike
    const orLikeResult = (await TestModel.query()
      .where('score', 95)
      .orWhereLike('name', '%Smith')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(orLikeResult).toHaveLength(2)
    expect(orLikeResult.map((r) => r.name).sort()).toEqual(['Alice Smith', 'Charlie'])
  })
})
