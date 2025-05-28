import { string } from '../src/lib/utils'
import { test as baseTest } from 'vitest'
import { ReactiveDatabase } from '@nhtio/web-re-active-record'
import { makeModelConstraints, joi } from '@nhtio/web-re-active-record/constraints'
import type {
  PlainObject,
  InferredReactiveModelConstructor,
  ReactiveDatabaseOptions,
} from '@nhtio/web-re-active-record/types'

export interface QueryBuilderAdditionalSpectTestModel extends PlainObject {
  id: number
  name: string
  score: number
  createdAt?: Date
  tags?: string[]
  meta?: Record<string, unknown>
}

export interface QueryBuilderAdditionalSpectTestFixtures {
  db: ReactiveDatabase<{ test: QueryBuilderAdditionalSpectTestModel }>
  TestModel: InferredReactiveModelConstructor<
    { test: QueryBuilderAdditionalSpectTestModel },
    ReactiveDatabaseOptions<{
      test: QueryBuilderAdditionalSpectTestModel
    }>,
    'test'
  >
}

// Create database model test with fixtures
export const queryBuilderAdditionalSpecTest =
  baseTest.extend<QueryBuilderAdditionalSpectTestFixtures>({
    db: [
      async ({}, use) => {
        const db = new ReactiveDatabase<{ test: QueryBuilderAdditionalSpectTestModel }>({
          namespace: `test-db-${string.random(16)}`,
          version: 1,
          models: {
            test: {
              schema: '++id, name, score, createdAt, *tags, meta',
              properties: ['id', 'name', 'score', 'createdAt', 'tags', 'meta'],
              primaryKey: 'id',
              relationships: {},
              constraints: makeModelConstraints<QueryBuilderAdditionalSpectTestModel>({
                id: joi.number().integer().positive(),
                name: joi.string().min(1).max(255).required(),
                score: joi.number().required(),
                createdAt: joi.date().optional(),
                tags: joi.array().items(joi.string()).optional(),
                meta: joi.object().optional(),
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

export interface QueryBuilderBooleanColumnSpecTestModel extends PlainObject {
  id: number
  active: boolean
}

export interface QueryBuilderBooleanColumnSpecTestFixtures {
  db: ReactiveDatabase<{ test: QueryBuilderBooleanColumnSpecTestModel }>
  TestModel: InferredReactiveModelConstructor<
    { test: QueryBuilderBooleanColumnSpecTestModel },
    ReactiveDatabaseOptions<{
      test: QueryBuilderBooleanColumnSpecTestModel
    }>,
    'test'
  >
}

export const queryBuilderBooleanColumnSpecTestTest =
  baseTest.extend<QueryBuilderBooleanColumnSpecTestFixtures>({
    db: [
      async ({}, use) => {
        const db = new ReactiveDatabase<{ test: QueryBuilderBooleanColumnSpecTestModel }>({
          namespace: `test-db-${string.random(16)}`,
          version: 1,
          models: {
            test: {
              schema: '++id, name, score, createdAt, *tags, meta',
              properties: ['id', 'name', 'score', 'createdAt', 'tags', 'meta'],
              primaryKey: 'id',
              relationships: {},
              constraints: makeModelConstraints<QueryBuilderBooleanColumnSpecTestModel>({
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
