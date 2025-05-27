// @ts-nocheck
import { string } from '../src/lib/utils'
import { describe, test as baseTest, expect } from 'vitest'
import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import { makeModelConstraints, joi } from '@nhtio/web-re-active-record/constraints'
import { ReactiveQueryBuilderIntrospector } from '@nhtio/web-re-active-record/testing'
import type { PlainObject } from '../src/lib/types'
import type { ReactiveModelConstructor } from '../src/lib/factory_reactive_model'
import type { RelationshipConfiguration } from '@nhtio/web-re-active-record/relationships'

interface TestModel extends PlainObject {
  id: number
  name: string
  score: number
  createdAt?: Date
  tags?: string[]
  meta?: Record<string, unknown>
}

type Constructor = ReactiveModelConstructor<
  TestModel,
  'id',
  Record<string, RelationshipConfiguration>
>

const test = baseTest.extend<{ db: ReactiveDatabase<{ test: TestModel }>; TestModel: Constructor }>(
  {
    db: [
      async ({}, use) => {
        const db = new ReactiveDatabase({
          namespace: `test-db-${string.random(16)}`,
          version: 1,
          models: {
            test: {
              schema: '++id, name, score, createdAt, *tags, meta',
              properties: ['id', 'name', 'score', 'createdAt', 'tags', 'meta'],
              primaryKey: 'id',
              relationships: {},
              constraints: makeModelConstraints<TestModel>({
                id: joi.number().integer().positive(),
                name: joi.string().required(),
                score: joi.alt(joi.number(), joi.string().allow(null)).required(),
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
      { auto: true },
    ],
    TestModel: [
      async ({ db }, use) => {
        const m = db.model('test') as Constructor
        await use(m)
        await m.truncate()
      },
      { auto: true },
    ],
  }
)

describe('ReactiveQueryBuilder Full Coverage', () => {
  test('where overloads and basic filters', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({ name: 'A', score: 1 }),
      TestModel.create({ name: 'B', score: 2 }),
      TestModel.create({ name: 'C', score: 3 }),
    ])
    const a = await TestModel.query().where('name', 'B').fetch()
    expect(a[0].name).toBe('B')
    const op = await TestModel.query().where('score', '>', 1).fetch()
    expect(op.map((r) => r.score).sort()).toEqual(expect.arrayContaining([2, 3]))
    const obj = await TestModel.query().where({ score: 3 }).fetch()
    expect(obj[0].score).toBe(3)
    const cb = await TestModel.query()
      .where((q) => q.where('score', '>=', 2))
      .fetch()
    expect(cb.map((r) => r.score).sort()).toEqual(expect.arrayContaining([2, 3]))
    const all = await TestModel.query().where(true).fetch()
    expect(all.length).toBe(3)
    const none = await TestModel.query().where(false).fetch()
    expect(none.length).toBe(0)
  })

  test('andWhere/orWhere variants', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({ name: 'X', score: 10 }),
      TestModel.create({ name: 'Y', score: 20 }),
    ])
    const andRes = await TestModel.query().where('score', 10).andWhere('name', 'X').fetch()
    expect(andRes.length).toBe(1)
    const orRes = await TestModel.query().where('score', 10).orWhere('score', 20).fetch()
    expect(orRes.map((r) => r.score).sort()).toEqual(expect.arrayContaining([10, 20]))
    const orObj = await TestModel.query().where('score', 10).orWhere({ score: 20 }).fetch()
    expect(orObj.map((r) => r.score).sort()).toEqual(expect.arrayContaining([10, 20]))
    const andBool = await TestModel.query().andWhere(true).fetch()
    expect(andBool.length).toBe(2)
    const orBool = await TestModel.query().where('score', 10).orWhere(false).fetch()
    expect(orBool.length).toBe(1)
  })

  test('whereNot and orWhereNot', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({ name: 'M', score: 5 }),
      TestModel.create({ name: 'N', score: 10 }),
      TestModel.create({ name: 'O', score: 15 }),
    ])
    const wNot = await TestModel.query().whereNot('score', 10).fetch()
    expect(wNot.map((r) => r.score).sort()).toEqual(expect.arrayContaining([5, 15]))
    const wNotCb = await TestModel.query()
      .whereNot((q) => q.where('score', '>', 10))
      .fetch()
    expect(wNotCb.map((r) => r.score).sort()).toEqual(expect.arrayContaining([5, 10]))
    const orNot = await TestModel.query().where('score', 5).orWhereNot('score', 10).fetch()
    expect(orNot.map((r) => r.score).sort()).toEqual(expect.arrayContaining([5, 15]))
  })

  test('in, between, null, like helpers', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({ name: 'I', score: null as any }),
      TestModel.create({ name: 'J', score: 10 }),
      TestModel.create({ name: 'K', score: 20 }),
      TestModel.create({ name: 'L', score: 30 }),
    ])
    const ins = await TestModel.query().whereIn('score', [10, 30]).fetch()
    expect(ins.map((r) => r.score).sort()).toEqual(expect.arrayContaining([10, 30]))
    const notIns = await TestModel.query().whereNotIn('score', [10, 30]).fetch()
    expect(notIns.map((r) => r.score).sort()).toEqual(expect.arrayContaining([20]))
    const btw = await TestModel.query().whereBetween('score', [10, 20]).fetch()
    expect(btw.map((r) => r.score).sort()).toEqual(expect.arrayContaining([10, 20]))
    const nbtw = await TestModel.query().whereNotBetween('score', [10, 20]).fetch()
    expect(nbtw.map((r) => r.score).sort()).toEqual(expect.arrayContaining([null, 30]))
    const nulls = await TestModel.query().whereNull('score').fetch()
    expect(nulls.length).toBe(1)
    const nn = await TestModel.query().whereNotNull('score').fetch()
    expect(nn.length).toBe(3)
    const like = await TestModel.query().whereLike('name', '%J').fetch()
    expect(like[0].name).toBe('J')
    const ilike = await TestModel.query().whereILike('name', '%k').fetch()
    expect(ilike[0].name).toBe('K')
    const orLike = await TestModel.query().where('score', 20).orWhereLike('name', '%I').fetch()
    expect(orLike.map((r) => r.score).sort()).toEqual(expect.arrayContaining([null, 20]))
  })

  test('andWhere variants', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({ name: 'P', score: 5 }),
      TestModel.create({ name: 'Q', score: 10 }),
      TestModel.create({ name: 'R', score: 15 }),
    ])
    const aNull = await TestModel.query().where('score', 5).andWhereNull('name').fetch()
    expect(aNull.length).toBe(0)
    const aIn = await TestModel.query().where('score', '>', 5).andWhereIn('score', [10, 15]).fetch()
    expect(aIn.map((r) => r.score).sort()).toEqual(expect.arrayContaining([10, 15]))
    const aBtw = await TestModel.query()
      .where('score', '>', 5)
      .andWhereBetween('score', [10, 15])
      .fetch()
    expect(aBtw.map((r) => r.score).sort()).toEqual(expect.arrayContaining([10, 15]))
    const aLike = await TestModel.query().where('score', '>', 5).andWhereLike('name', '%Q').fetch()
    expect(aLike[0].name).toBe('Q')
  })

  test('pagination & ordering & fetch', async ({ TestModel }) => {
    await Promise.all([
      TestModel.create({ name: 'U', score: 1 }),
      TestModel.create({ name: 'V', score: 2 }),
      TestModel.create({ name: 'W', score: 3 }),
      TestModel.create({ name: 'X', score: 4 }),
    ])
    const lim = await TestModel.query().orderBy('score').limit(2).fetch()
    expect(lim.map((r) => r.score)).toEqual(expect.arrayContaining([1, 2]))
    const off = await TestModel.query().orderBy('score').offset(2).limit(2).fetch()
    expect(off.map((r) => r.score)).toEqual(expect.arrayContaining([3, 4]))
    const f = await TestModel.query().orderBy('score').first()
    expect(f.score).toBe(1)
    const l = await TestModel.query().orderBy('score').last()
    expect(l.score).toBe(4)
    const pg = await TestModel.query().orderBy('score').forPage(2, 1)
    expect(pg[0].score).toBe(2)
  })

  test('data modifiers & utilities', async ({ TestModel }) => {
    const rc = await TestModel.create({ name: 'Z', score: 0 })
    await TestModel.query().where('id', rc.id).increment('score', 10)
    // eslint-disable-next-line @unicorn/no-await-expression-member
    expect((await TestModel.query().where('id', rc.id).first()).score).toBe(10)
    await TestModel.query().where('id', rc.id).decrement('score', 5)
    // eslint-disable-next-line @unicorn/no-await-expression-member
    expect((await TestModel.query().where('id', rc.id).first()).score).toBe(5)
    await TestModel.query().where('id', rc.id).update({ score: 20 })
    // eslint-disable-next-line @unicorn/no-await-expression-member
    expect((await TestModel.query().where('id', rc.id).first()).score).toBe(20)
    await TestModel.query().where('id', rc.id).delete()
    expect(await TestModel.query().where('id', rc.id).first()).toBeUndefined()

    await Promise.all([
      TestModel.create({ name: 'AA', score: 30 }),
      TestModel.create({ name: 'BB', score: 40 }),
    ])
    const intros = new ReactiveQueryBuilderIntrospector()
    const q = TestModel.query(intros).where('score', '>', 0)
    expect(intros.whereConditions.length).toBe(1)
    q.clear()
    expect(intros.whereConditions.length).toBe(0)
    expect(await q.count()).toBe(2)

    const intros2 = new ReactiveQueryBuilderIntrospector()
    await TestModel.query().where('score', '>', 0).clone(intros2).fetch()
    expect(intros2.whereConditions.length).toBeGreaterThan(0)

    const total = await TestModel.query().count()
    expect(total).toBeGreaterThanOrEqual(2)
  })
})
