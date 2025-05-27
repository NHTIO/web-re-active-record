import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import type { InferredReactiveModelConstructor } from '../src/types'

// --- Test Model Setup ---
type User = { id: number; name?: string }

let db: ReactiveDatabase<{ users: User }>
let UserModel: InferredReactiveModelConstructor<{ users: User }, any, 'users'>

beforeEach(async () => {
  db = new ReactiveDatabase({
    namespace: 'testdb',
    version: 1,
    psk: '1234567890abcdef',
    models: {
      users: {
        schema: '++id,name',
        properties: ['id', 'name'],
        primaryKey: 'id',
        relationships: {},
      },
    },
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
  })
  await db.promise
  UserModel = db.model('users')
  await UserModel.query().delete()
})

describe('ReactiveQueryCollection (integration)', () => {
  it('returns initial value and emits next on insert', async () => {
    const usersQuery = UserModel.query().where('id', '>=', 1)
    const reactiveApi = await usersQuery.reactive()
    const response = await reactiveApi.fetch()
    expect(response.value).toEqual([])
    const onNext = vi.fn()
    const onError = vi.fn()
    const onComplete = vi.fn()
    response.on('next', onNext)
    response.on('error', onError)
    response.on('complete', onComplete)
    const user = new UserModel({ id: 1, name: 'A' })
    await user.save()
    await new Promise((r) => setTimeout(r, 500))
    expect(onNext).toHaveBeenCalledWith([{ id: 1, name: 'A' }])
    expect(onError).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('emits next on delete and handles error/complete events, but not on update', async () => {
    const user = new UserModel({ id: 1, name: 'A' })
    await user.save()
    const usersQuery = UserModel.query().where('id', '>=', 1)
    const reactiveApi = await usersQuery.reactive()
    const response = await reactiveApi.fetch()
    expect(response.value).toEqual([{ id: 1, name: 'A' }])
    const onNext = vi.fn()
    const onError = vi.fn()
    const onComplete = vi.fn()
    response.on('next', onNext)
    response.on('error', onError)
    response.on('complete', onComplete)
    user.name = 'B'
    await user.save()
    await new Promise((r) => setTimeout(r, 500))
    expect(onNext).not.toHaveBeenCalled()
    await user.delete()
    await new Promise((r) => setTimeout(r, 500))
    expect(onNext).toHaveBeenCalledWith([])
    expect(onError).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('does not emit after unmount and emits complete', async () => {
    const usersQuery = UserModel.query().where('id', '>=', 1)
    const reactiveApi = await usersQuery.reactive()
    const response = await reactiveApi.fetch()
    const onNext = vi.fn()
    const onError = vi.fn()
    const onComplete = vi.fn()
    response.on('next', onNext)
    response.on('error', onError)
    response.on('complete', onComplete)
    response.unmount()
    const user = new UserModel({ id: 2, name: 'C' })
    await user.save()
    await new Promise((r) => setTimeout(r, 500))
    expect(onNext).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(onComplete).toHaveBeenCalled()
  })
})

describe('ReactiveQueryResult (integration)', () => {
  it('returns initial value and does not emit next on update', async () => {
    const user = new UserModel({ id: 1, name: 'A' })
    await user.save()
    const userQuery = UserModel.query().where('id', '=', 1)
    const reactiveApi = await userQuery.reactive()
    const response = await reactiveApi.first()
    expect(response.value).toEqual({ id: 1, name: 'A' })
    const onNext = vi.fn()
    const onError = vi.fn()
    const onComplete = vi.fn()
    response.on('next', onNext)
    response.on('error', onError)
    response.on('complete', onComplete)
    user.name = 'B'
    await user.save()
    await new Promise((r) => setTimeout(r, 500))
    expect(onNext).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('emits next as undefined on delete and does not emit error/complete', async () => {
    const user = new UserModel({ id: 1, name: 'A' })
    await user.save()
    const userQuery = UserModel.query().where('id', '=', 1)
    const reactiveApi = await userQuery.reactive()
    const response = await reactiveApi.first()
    expect(response.value).toEqual({ id: 1, name: 'A' })
    const onNext = vi.fn()
    const onError = vi.fn()
    const onComplete = vi.fn()
    response.on('next', onNext)
    response.on('error', onError)
    response.on('complete', onComplete)
    await user.delete()
    await new Promise((r) => setTimeout(r, 500))
    expect(onNext).toHaveBeenCalledWith(undefined)
    expect(onError).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('does not emit after unmount and emits complete', async () => {
    const user = new UserModel({ id: 1, name: 'A' })
    await user.save()
    const userQuery = UserModel.query().where('id', '=', 1)
    const reactiveApi = await userQuery.reactive()
    const response = await reactiveApi.first()
    const onNext = vi.fn()
    const onError = vi.fn()
    const onComplete = vi.fn()
    response.on('next', onNext)
    response.on('error', onError)
    response.on('complete', onComplete)
    response.unmount()
    user.name = 'C'
    await user.save()
    await new Promise((r) => setTimeout(r, 500))
    expect(onNext).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(onComplete).toHaveBeenCalled()
  })
})
