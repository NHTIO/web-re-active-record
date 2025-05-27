import { describe, expect } from 'vitest'
import { queryBuilderAdditionalSpecTest as test } from './utils'
import { ReactiveQueryBuilderIntrospector } from '@nhtio/web-re-active-record/testing'
import type { ReactiveModel } from '../src/lib/factory_reactive_model'
import type { ReactiveQueryBuilder } from '@nhtio/web-re-active-record/types'
import type { QueryBuilderAdditionalSpectTestModel as TestModel } from './utils'
import type { RelationshipConfiguration } from '@nhtio/web-re-active-record/relationships'

describe('ReactiveQueryBuilder Additional Tests', () => {
  test('should handle edge cases with dates, arrays, and objects', async ({ TestModel }) => {
    const date1 = new Date('2023-01-01')
    const date2 = new Date('2023-01-02')
    const date3 = new Date('2023-01-03')

    await Promise.all([
      TestModel.create({
        name: 'Date1',
        score: 10,
        createdAt: date1,
        tags: ['a', 'b'],
        meta: { active: true },
      }),
      TestModel.create({
        name: 'Date2',
        score: 20,
        createdAt: date2,
        tags: ['b', 'c'],
        meta: { active: false },
      }),
      TestModel.create({
        name: 'Date3',
        score: 30,
        createdAt: date3,
        tags: ['c', 'd'],
        meta: { active: true },
      }),
    ])

    // where with date comparison
    const dateResult = (await TestModel.query()
      .where('createdAt', '>=', date2)
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(dateResult.map((r) => r.name).sort()).toEqual(['Date2', 'Date3'])

    // where with array includes
    const arrayResult = (await TestModel.query()
      .where('score', 'in', [10])
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(arrayResult.map((r) => r.name)).toContain('Date1')

    // where with object equality (should match exact object)
    const objectResult = (await TestModel.query()
      .where('meta', '=', { active: true })
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(objectResult).toHaveLength(0) // Because object equality is by reference, no match expected
  })

  test('should handle complex nested conditions using callbacks', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({
        name: 'Nested1',
        score: 10,
        createdAt: new Date(),
        tags: [],
        meta: {},
      }),
      TestModel.create({
        name: 'Nested2',
        score: 20,
        createdAt: new Date(),
        tags: [],
        meta: {},
      }),
      TestModel.create({
        name: 'Nested3',
        score: 30,
        createdAt: new Date(),
        tags: [],
        meta: {},
      }),
    ])

    const nestedResult = (await TestModel.query()
      .where(
        (q: ReactiveQueryBuilder<TestModel, 'id', Record<string, RelationshipConfiguration>>) => {
          q.where('score', '>=', 10).andWhere('score', '<=', 20)
        }
      )
      .orWhere((q) => {
        q.where('name', '=', 'Nested3')
      })
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]

    expect(nestedResult.map((r) => r.name).sort()).toEqual(['Nested1', 'Nested2', 'Nested3'])
  })

  test('should handle error cases for invalid inputs', async ({ TestModel }) => {
    let errorCaught = false
    try {
      await TestModel.query()
        .where('score', 'invalid_operator' as any, 10)
        .fetch()
    } catch (e) {
      errorCaught = true
    }
    expect(errorCaught).toBe(true)
  })

  test('should use introspector to gain insight into query builder internals', async ({
    TestModel,
  }) => {
    const introspector = new ReactiveQueryBuilderIntrospector<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >()
    const query = TestModel.query().where('score', '>=', 10).clone(introspector)
    await query.fetch()
    expect(introspector.whereConditions.length).toBeGreaterThan(0)
  })

  // individual tests for existence methods
  test('should handle whereExists', async ({ TestModel }) => {
    const date = new Date()
    await Promise.all([
      TestModel.create({
        name: 'Exists1',
        score: 1,
        createdAt: date,
        tags: ['a'],
        meta: { key: true },
      }),
      TestModel.create({ name: 'Exists2', score: 2, tags: ['b'] }),
      TestModel.create({ name: 'Exists3', score: 3 }),
    ])
    const result = (await TestModel.query().whereExists('createdAt').fetch()) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >[]
    expect(result.map((r) => r.name).sort()).toEqual(['Exists1'])
  })

  test('should handle whereNotExists', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({
        name: 'Exists1',
        score: 1,
        createdAt: new Date(),
        tags: ['a'],
        meta: { key: true },
      }),
      TestModel.create({ name: 'Exists2', score: 2, tags: ['b'] }),
      TestModel.create({ name: 'Exists3', score: 3 }),
    ])
    const result = (await TestModel.query().whereNotExists('meta').fetch()) as ReactiveModel<
      TestModel,
      'id',
      Record<string, RelationshipConfiguration>
    >[]
    expect(result.map((r) => r.name).sort()).toEqual(['Exists2', 'Exists3'])
  })

  test('should handle andWhereExists', async ({ TestModel }) => {
    const date = new Date()
    await Promise.all([
      TestModel.create({
        name: 'Exists1',
        score: 1,
        createdAt: date,
        tags: ['a'],
        meta: { key: true },
      }),
      TestModel.create({ name: 'Exists2', score: 2, createdAt: date }),
      TestModel.create({ name: 'Exists3', score: 3 }),
    ])
    const result = (await TestModel.query()
      .where('score', '>=', 2)
      .andWhereExists('tags')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(result.map((r) => r.name).sort()).toEqual([])
  })

  test('should handle andWhereNotExists', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({
        name: 'Exists1',
        score: 1,
        createdAt: new Date(),
        tags: ['a'],
        meta: { key: true },
      }),
      TestModel.create({ name: 'Exists2', score: 2, tags: ['b'] }),
      TestModel.create({ name: 'Exists3', score: 3 }),
    ])
    const result = (await TestModel.query()
      .where('score', '>=', 2)
      .andWhereNotExists('meta')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(result.map((r) => r.name).sort()).toEqual(['Exists2', 'Exists3'])
  })

  test('should handle orWhereExists', async ({ TestModel }) => {
    const date = new Date()
    await Promise.all([
      TestModel.create({
        name: 'Exists1',
        score: 1,
        createdAt: date,
        tags: ['a'],
        meta: { key: true },
      }),
      TestModel.create({ name: 'Exists2', score: 2 }),
      TestModel.create({ name: 'Exists3', score: 3 }),
    ])
    const result = (await TestModel.query()
      .where('score', '=', 3)
      .orWhereExists('createdAt')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(result.map((r) => r.name).sort()).toEqual(['Exists1', 'Exists3'])
  })

  test('should handle orWhereNotExists', async ({ TestModel }) => {
    const date = new Date()
    await Promise.all([
      TestModel.create({
        name: 'Exists1',
        score: 1,
        createdAt: date,
        tags: ['a'],
        meta: { key: true },
      }),
      TestModel.create({ name: 'Exists2', score: 2 }),
      TestModel.create({ name: 'Exists3', score: 3 }),
    ])
    const result = (await TestModel.query()
      .where('score', '=', 1)
      .orWhereNotExists('tags')
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(result.map((r) => r.name).sort()).toEqual(['Exists1', 'Exists2', 'Exists3'])
  })

  test('should handle orWhereNotBetween', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({ name: 'One', score: 10 }),
      TestModel.create({ name: 'Two', score: 20 }),
      TestModel.create({ name: 'Three', score: 30 }),
      TestModel.create({ name: 'Four', score: 40 }),
    ])
    const result = (await TestModel.query()
      .where('score', '=', 10)
      .orWhereNotBetween('score', [15, 35])
      .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
    expect(result.map((r) => r.name).sort()).toEqual(['Four', 'One'])
  })

  test('should support Promise.then', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({ name: 'AAA', score: 5 }),
      TestModel.create({ name: 'BBB', score: 15 }),
    ])
    const thenResult = await TestModel.query()
      .where('score', '>', 10)
      .then(
        (records) =>
          records as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
      )
    expect(thenResult.map((r) => r.name)).toEqual(['BBB'])
  })
})
