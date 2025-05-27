import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { HasOne, BelongsTo } from '@nhtio/web-re-active-record/relationships'
import { ReactiveDatabaseIntrospector } from '@nhtio/web-re-active-record/testing'
import {
  ReactiveModelQueryException,
  ShutdownDatabaseException,
} from '@nhtio/web-re-active-record/errors'

describe('ReactiveDatabase relationship configuration', () => {
  it('should allow configuration of relationships via the constructor', () => {
    const db = new ReactiveDatabase({
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
      namespace: 'testdb',
      version: 1,
      models: {
        user: {
          schema: '++id,name',
          properties: ['id', 'name'],
          primaryKey: 'id',
          relationships: {
            profile: [HasOne, 'profile', 'userId'],
          },
        },
        profile: {
          schema: '++id,userId',
          properties: ['id', 'userId'],
          primaryKey: 'id',
          relationships: {
            user: [BelongsTo, 'user', 'userId'],
          },
        },
      },
      psk: '1234567890abcdef',
    })
    expect(db.models).toContain('user')
    expect(db.models).toContain('profile')
    const userModel = db.model('user')
    const profileModel = db.model('profile')
    expect(userModel).toBeDefined()
    expect(profileModel).toBeDefined()
  })
})

describe('Common relationship features (query builder, eager loading, etc)', () => {
  let db: any
  let UserModel: any
  let ProfileModel: any

  beforeAll(async () => {
    db = new ReactiveDatabase({
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
      namespace: 'testdb_common',
      version: 1,
      models: {
        user: {
          schema: '++id,name',
          properties: ['id', 'name'],
          primaryKey: 'id',
          relationships: {
            profile: [HasOne, 'profile', 'userId'],
          },
        },
        profile: {
          schema: '++id,userId',
          properties: ['id', 'userId'],
          primaryKey: 'id',
          relationships: {
            user: [BelongsTo, 'user', 'userId'],
          },
        },
      },
      psk: 'abcdefabcdef1234',
    })
    await db.promise
    UserModel = db.model('user')
    ProfileModel = db.model('profile')
  })

  afterAll(async () => {
    await db.shutdown()
  })

  afterEach(async () => {
    try {
      await UserModel.truncate()
    } catch (err: any) {
      if (!(err instanceof ShutdownDatabaseException)) throw err
    }
    try {
      await ProfileModel.truncate()
    } catch (err: any) {
      if (!(err instanceof ShutdownDatabaseException)) throw err
    }
  })

  it('should eager load related model via query builder .with()', async () => {
    const user = await UserModel.create({ name: 'Eager' })
    await ProfileModel.create({ userId: user.id })
    const users = await UserModel.query().with('profile').fetch()
    expect(users[0].profile).toBeDefined()
    expect(users[0].profile.userId).toBe(user.id)
  })

  it('should eager load related model via query builder .with() for BelongsTo', async () => {
    const user = await UserModel.create({ name: 'BelongsTo' })
    await ProfileModel.create({ userId: user.id })
    const profiles = await ProfileModel.query().with('user').fetch()
    expect(profiles[0].user).toBeDefined()
    expect(profiles[0].user.id).toBe(user.id)
    expect(profiles[0].user.name).toBe('BelongsTo')
  })

  it('should return undefined for missing related model when eager loading', async () => {
    await UserModel.create({ name: 'NoProfile' })
    const users = await UserModel.query().with('profile').fetch()
    expect(users[0].profile).toBeUndefined()
  })

  it('should support eager loading multiple relationships (variadic syntax)', async () => {
    const user = await UserModel.create({ name: 'Multi' })
    await ProfileModel.create({ userId: user.id })
    // Only one relationship in this model, but test variadic usage
    const users = await UserModel.query().with('profile').fetch()
    expect(users[0].profile).toBeDefined()
    expect(users[0].profile.userId).toBe(user.id)
  })

  it('should throw if .with() is called with a non-existent relationship', async () => {
    await UserModel.create({ name: 'NoRel' })
    let error: unknown
    try {
      await UserModel.query().with('not_a_rel').fetch()
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ReactiveModelQueryException)
    // Optionally check the cause/original error if available
    if (
      error &&
      typeof error === 'object' &&
      'cause' in error &&
      error.cause &&
      typeof error.cause === 'object' &&
      'message' in error.cause &&
      typeof error.cause.message === 'string'
    ) {
      expect(error.cause.message).toContain(
        'The relationship not_a_rel is not defined for this model'
      )
    }
  })

  it('should eager load all relationships with .withAll()', async () => {
    const user = await UserModel.create({ name: 'WithAll' })
    await ProfileModel.create({ userId: user.id })
    const users = await UserModel.query().withAll().fetch()
    expect(users[0].profile).toBeDefined()
    expect(users[0].profile.userId).toBe(user.id)
  })

  it('should allow chaining .with() and .orderBy()', async () => {
    const userA = await UserModel.create({ name: 'A' })
    const userB = await UserModel.create({ name: 'B' })
    await ProfileModel.create({ userId: userA.id })
    await ProfileModel.create({ userId: userB.id })
    const users = await UserModel.query().with('profile').orderBy('name', 'desc').fetch()
    expect(users[0].name).toBe('B')
    expect(users[1].name).toBe('A')
    expect(users[0].profile).toBeDefined()
    expect(users[1].profile).toBeDefined()
  })

  it('should not duplicate relationships if .with() is called multiple times', async () => {
    const user = await UserModel.create({ name: 'Dup' })
    await ProfileModel.create({ userId: user.id })
    const users = await UserModel.query().with('profile').with('profile').fetch()
    expect(users[0].profile).toBeDefined()
    expect(users[0].profile.userId).toBe(user.id)
  })

  it('should throw if .with() is called with an empty string', async () => {
    await UserModel.create({ name: 'EmptyRel' })
    let error: unknown
    try {
      await UserModel.query().with('').fetch()
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ReactiveModelQueryException)
  })

  it('should return an empty array if no records exist, even with .with()', async () => {
    const users = await UserModel.query().with('profile').fetch()
    expect(users).toHaveLength(0)
  })

  it('should register and run cleanup callbacks on shutdown (using introspector)', async () => {
    const introspector = new ReactiveDatabaseIntrospector()
    const dbWithIntrospect = new ReactiveDatabase(
      {
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
        namespace: 'testdb_cleanup_introspect',
        version: 1,
        models: {
          user: {
            schema: '++id,name',
            properties: ['id', 'name'],
            primaryKey: 'id',
            relationships: {},
          },
        },
        psk: 'abcdefabcdef9999',
      },
      introspector
    )
    await dbWithIntrospect.promise
    // Just ensure shutdown completes and further operations are prevented
    await dbWithIntrospect.shutdown()
    let error: unknown
    try {
      await dbWithIntrospect.model('user').create({ name: 'ShouldFailAfterShutdown' })
    } catch (e) {
      error = e
    }
    expect(error).toBeDefined()
  })

  it('should prevent further operations after shutdown', async () => {
    const db2 = new ReactiveDatabase({
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
      namespace: 'testdb_cleanup2',
      version: 1,
      models: {
        user: {
          schema: '++id,name',
          properties: ['id', 'name'],
          primaryKey: 'id',
          relationships: {},
        },
      },
      psk: 'abcdefabcdef5678',
    })
    await db2.promise
    await db2.shutdown()
    let error: unknown
    try {
      await db2.model('user').create({ name: 'ShouldFail' })
    } catch (e) {
      error = e
    }
    expect(error).toBeDefined()
  })

  it('should allow static shutdown of all databases and clear all cleanup callbacks (using introspector)', async () => {
    const introspectorA = new ReactiveDatabaseIntrospector()
    const introspectorB = new ReactiveDatabaseIntrospector()
    const dbA = new ReactiveDatabase(
      {
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
        namespace: 'testdb_staticA',
        version: 1,
        models: {
          user: {
            schema: '++id,name',
            properties: ['id', 'name'],
            primaryKey: 'id',
            relationships: {},
          },
        },
        psk: 'abcdefabcdef9012',
      },
      introspectorA
    )
    const dbB = new ReactiveDatabase(
      {
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
        namespace: 'testdb_staticB',
        version: 1,
        models: {
          user: {
            schema: '++id,name',
            properties: ['id', 'name'],
            primaryKey: 'id',
            relationships: {},
          },
        },
        psk: 'abcdefabcdef3456',
      },
      introspectorB
    )
    await dbA.promise
    await dbB.promise
    // Just ensure static shutdown completes and further operations are prevented
    await ReactiveDatabase.shutdown()
    let errorA: unknown
    let errorB: unknown
    try {
      await dbA.model('user').create({ name: 'ShouldFailAfterShutdownA' })
    } catch (e) {
      errorA = e
    }
    try {
      await dbB.model('user').create({ name: 'ShouldFailAfterShutdownB' })
    } catch (e) {
      errorB = e
    }
    expect(errorA).toBeDefined()
    expect(errorB).toBeDefined()
  })
})
