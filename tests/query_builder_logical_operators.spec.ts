import { string } from '../src/lib/utils'
import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import { expect, describe, test, beforeAll, beforeEach, afterAll } from 'vitest'
import { makeModelConstraints, joi } from '@nhtio/web-re-active-record/constraints'
import type { PlainObject } from '../src/lib/types'
import type { RelationshipConfiguration } from '@nhtio/web-re-active-record/relationships'
import type { ReactiveModel, ReactiveModelConstructor } from '../src/lib/factory_reactive_model'

interface TestModel extends PlainObject {
  id: number
  name: string
  score: number
}

let db: ReactiveDatabase<{ test: TestModel }>
let TestModel: ReactiveModelConstructor<TestModel, 'id', Record<string, RelationshipConfiguration>>

const records = [
  { name: 'Rec1', score: 1 },
  { name: 'Rec2', score: 2 },
  { name: 'Rec3', score: 3 },
  { name: 'Rec4', score: 4 },
]

beforeAll(async () => {
  db = new ReactiveDatabase<{ test: TestModel }>({
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
          name: joi.string().required(),
          score: joi.number().required(),
        }),
      },
    },
    psk: string.random(32),
  })
  await db.promise
  TestModel = db.model('test') as any
})

beforeEach(async () => {
  await TestModel.truncate()
  await Promise.all(records.map((r) => TestModel.create(r)))
})

afterAll(async () => {
  await db.shutdown()
})

describe('ReactiveQueryBuilder raw and logical operators', () => {
  const operators: Array<[string, any, string[]]> = [
    ['=', 2, ['Rec2']],
    ['!=', 2, ['Rec1', 'Rec3', 'Rec4']],
    ['<', 3, ['Rec1', 'Rec2']],
    ['<=', 2, ['Rec1', 'Rec2']],
    ['>', 2, ['Rec3', 'Rec4']],
    ['>=', 3, ['Rec3', 'Rec4']],
    ['in', [2, 4], ['Rec2', 'Rec4']],
    ['not in', [2, 4], ['Rec1', 'Rec3']],
    ['between', [2, 3], ['Rec2', 'Rec3']],
    ['not between', [2, 3], ['Rec1', 'Rec4']],
    ['like', '%1', ['Rec1']],
    ['not like', '%1', ['Rec2', 'Rec3', 'Rec4']],
    ['ilike', '%1', ['Rec1']],
    ['not ilike', '%1', ['Rec2', 'Rec3', 'Rec4']],
    ['is', null, []],
    ['is not', null, ['Rec1', 'Rec2', 'Rec3', 'Rec4']],
  ]

  operators.forEach(([op, pivot, expected]) => {
    test(`where score ${op} ${JSON.stringify(pivot)}`, async () => {
      const res = (await TestModel.query()
        .where('score', op as any, pivot)
        .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
      expect(res.map((r) => r.name).sort()).toEqual(expected)
    })

    test(`whereNot score ${op} ${JSON.stringify(pivot)}`, async () => {
      const res = (await TestModel.query()
        .whereNot('score', op as any, pivot)
        .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
      const all = records.map((r) => r.name)
      const got = res.map((r) => r.name)
      expect(all.filter((n) => !expected.includes(n)).sort()).toEqual(got.sort())
    })

    test(`andWhere exists score AND score ${op}`, async () => {
      const res = (await TestModel.query()
        .whereExists('score')
        .andWhere('score', op as any, pivot)
        .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
      expect(res.map((r) => r.name).sort()).toEqual(expected)
    })

    test(`orWhere score =1 OR score ${op}`, async () => {
      const res = (await TestModel.query()
        .where('score', '=', 1)
        .orWhere('score', op as any, pivot)
        .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
      const union = Array.from(new Set(['Rec1', ...expected])).sort()
      expect(res.map((r) => r.name).sort()).toEqual(union)
    })

    test(`andWhereNot score ${op}`, async () => {
      const res = (await TestModel.query()
        .whereExists('score')
        .andWhereNot('score', op as any, pivot)
        .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
      const all = records.map((r) => r.name)
      const got = res.map((r) => r.name)
      expect(all.filter((n) => !expected.includes(n)).sort()).toEqual(got.sort())
    })

    test(`orWhereNot score ${op}`, async () => {
      const res = (await TestModel.query()
        .where('score', '=', 1)
        .orWhereNot('score', op as any, pivot)
        .fetch()) as ReactiveModel<TestModel, 'id', Record<string, RelationshipConfiguration>>[]
      const notMatch = records.map((r) => r.name).filter((n) => !expected.includes(n))
      const union = Array.from(new Set(['Rec1', ...notMatch])).sort()
      expect(res.map((r) => r.name).sort()).toEqual(union)
    })
  })
})
