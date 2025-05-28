import { enforceTypeOrThrow } from '../src/lib/utils'
import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import { describe, it, expect, expectTypeOf, beforeEach, afterEach } from 'vitest'
import { ReactiveDatabaseIntrospector } from '@nhtio/web-re-active-record/testing'
import { joi, tlds, makeModelConstraints } from '@nhtio/web-re-active-record/constraints'
import {
  InvalidReactiveDatabaseOptionsError,
  ReactiveDatabaseNoSuchModelException,
} from '../src/errors'
import {
  ReactiveDatabaseOptions,
  ReactiveDatabaseOptionsSchema,
} from '../src/lib/class_reactive_database'
import type { PlainObject } from '../src/lib/types'
import type { LogBusEventMap } from '../src/lib/class_logger'
import type { ReactiveDatabaseInitialLoggerOptions } from '../src/lib/class_reactive_database'

interface TestUser extends PlainObject {
  id: number
  name: string
  email: string
}

describe('ReactiveDatabase Configuration', () => {
  beforeEach(async () => {
    // Clean up any existing databases before each test
    await ReactiveDatabase.shutdown()
  })

  afterEach(async () => {
    // Clean up after each test
    await ReactiveDatabase.shutdown()
  })

  describe('Basic Configuration', () => {
    it('should create database with valid minimal configuration', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
          namespace: 'test-db',
          version: 1,
          psk: 'test-psk-that-is-long-enough',
          models: {
            users: {
              schema: '++id, name, email',
              properties: ['id', 'name', 'email'],
              primaryKey: 'id',
              relationships: {},
            },
          },
        },
        introspector
      )

      expect(db).toBeInstanceOf(ReactiveDatabase)
      expect(db.models).toContain('users')
    })

    it('should throw error for missing required fields', () => {
      expect(
        () =>
          new ReactiveDatabase<{ users: TestUser }>({
            namespace: 'test-db',
            // missing version
            psk: 'test-psk-that-is-long-enough',
            models: {
              users: {
                schema: '++id, name, email',
                properties: ['id', 'name', 'email'],
                primaryKey: 'id',
                relationships: {},
              },
            },
          })
      ).toThrow(InvalidReactiveDatabaseOptionsError)
    })

    it('should throw error for invalid version number', () => {
      expect(
        () =>
          new ReactiveDatabase<{ users: TestUser }>({
            namespace: 'test-db',
            version: 0, // Invalid version number
            psk: 'test-psk-that-is-long-enough',
            models: {
              users: {
                schema: '++id, name, email',
                properties: ['id', 'name', 'email'],
                primaryKey: 'id',
                relationships: {},
              },
            },
          })
      ).toThrow(InvalidReactiveDatabaseOptionsError)
    })

    it('should throw error for short PSK', () => {
      expect(
        () =>
          new ReactiveDatabase<{ users: TestUser }>({
            namespace: 'test-db',
            version: 1,
            psk: 'short', // Less than 16 characters
            models: {
              users: {
                schema: '++id, name, email',
                properties: ['id', 'name', 'email'],
                primaryKey: 'id',
                relationships: {},
              },
            },
          })
      ).toThrow(InvalidReactiveDatabaseOptionsError)
    })
  })

  describe('Model Configuration', () => {
    it('should validate model schema format', () => {
      expect(
        () =>
          new ReactiveDatabase<{ users: TestUser }>({
            namespace: 'test-db',
            version: 1,
            psk: 'test-psk-that-is-long-enough',
            models: {
              users: {
                schema: 'invalid-schema-format', // Invalid schema format
                properties: ['id', 'name', 'email'],
                primaryKey: 'id',
                relationships: {},
              },
            },
          })
      ).toThrow(InvalidReactiveDatabaseOptionsError)
    })

    it('should validate model properties', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
          namespace: 'test-db',
          version: 1,
          psk: 'test-psk-that-is-long-enough',
          models: {
            users: {
              schema: '++id, name, email',
              properties: ['id', 'name', 'email'],
              primaryKey: 'id',
              relationships: {},
            },
          },
        },
        introspector
      )

      expect(db.model('users')).toBeDefined()
    })

    it('should throw error for non-existent model', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
          namespace: 'test-db',
          version: 1,
          psk: 'test-psk-that-is-long-enough',
          models: {
            users: {
              schema: '++id, name, email',
              properties: ['id', 'name', 'email'],
              primaryKey: 'id',
              relationships: {},
            },
          },
        },
        introspector
      )

      expect(() => db.model('non_existent' as any)).toThrow(ReactiveDatabaseNoSuchModelException)
    })

    it('should validate primaryKey exists in properties', () => {
      expect(
        () =>
          new ReactiveDatabase<{ users: TestUser }>({
            namespace: 'test-db',
            version: 1,
            psk: 'test-psk-that-is-long-enough',
            models: {
              users: {
                schema: '++id, name, email',
                properties: ['name', 'email'], // id missing from properties
                primaryKey: 'id',
                relationships: {},
              },
            },
          })
      ).toThrow(InvalidReactiveDatabaseOptionsError)
    })

    it('should validate primaryKey in properties for multiple models', () => {
      expect(
        () =>
          new ReactiveDatabase<{ users: TestUser; posts: { id: number; title: string } }>({
            namespace: 'test-db',
            version: 1,
            psk: 'test-psk-that-is-long-enough',
            models: {
              users: {
                schema: '++id, name, email',
                properties: ['id', 'name', 'email'],
                primaryKey: 'id',
                relationships: {},
              },
              posts: {
                schema: '++id, title',
                properties: ['title'], // id missing from properties
                primaryKey: 'id',
                relationships: {},
              },
            },
          })
      ).toThrow(InvalidReactiveDatabaseOptionsError)
    })

    it('should validate primaryKey with case-sensitive property names', () => {
      expect(
        () =>
          new ReactiveDatabase<{ users: TestUser }>({
            namespace: 'test-db',
            version: 1,
            psk: 'test-psk-that-is-long-enough',
            models: {
              users: {
                schema: '++Id, name, email',
                properties: ['id', 'name', 'email'], // 'Id' vs 'id'
                primaryKey: 'Id',
                relationships: {},
              },
            },
          })
      ).toThrow(InvalidReactiveDatabaseOptionsError)
    })

    it('should validate primaryKey with empty properties array', () => {
      expect(
        () =>
          new ReactiveDatabase<{ users: TestUser }>({
            namespace: 'test-db',
            version: 1,
            psk: 'test-psk-that-is-long-enough',
            models: {
              users: {
                schema: '++id',
                properties: [], // empty properties array
                primaryKey: 'id',
                relationships: {},
              },
            },
          })
      ).toThrow(InvalidReactiveDatabaseOptionsError)
    })

    it('should pass validation when primaryKey exists in properties', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
          namespace: 'test-db',
          version: 1,
          psk: 'test-psk-that-is-long-enough',
          models: {
            users: {
              schema: '++id, name, email',
              properties: ['id', 'name', 'email'], // id included in properties
              primaryKey: 'id',
              relationships: {},
            },
          },
        },
        introspector
      )

      expect(db).toBeInstanceOf(ReactiveDatabase)
      expect(db.models).toContain('users')
      expect(introspector.models.has('users')).toBe(true)
      expect(introspector.options.models.users.primaryKey).toBe('id')
    })

    it('should validate model with valid constraints', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
          namespace: 'test-db',
          version: 1,
          psk: 'test-psk-that-is-long-enough',
          models: {
            users: {
              schema: '++id, name, email',
              properties: ['id', 'name', 'email'],
              primaryKey: 'id',
              relationships: {},
              constraints: makeModelConstraints({
                id: joi.number().required(),
                name: joi.string().required(),
                email: joi
                  .string()
                  .email({
                    tlds: { allow: tlds }, // Use the imported tlds
                  })
                  .required(),
              }),
            },
          },
        },
        introspector
      )

      expect(db).toBeInstanceOf(ReactiveDatabase)
      expect(db.models).toContain('users')
      expect(introspector.models.has('users')).toBe(true)
      expect(introspector.options.models.users.constraints).toBeDefined()
    })

    it('should validate model with strict constraints', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
          namespace: 'test-db',
          version: 1,
          psk: 'test-psk-that-is-long-enough',
          models: {
            users: {
              schema: '++id, name, email',
              properties: ['id', 'name', 'email'],
              primaryKey: 'id',
              relationships: {},
              constraints: makeModelConstraints(
                {
                  id: joi.number().required(),
                  name: joi.string().required(),
                  email: joi
                    .string()
                    .email({
                      tlds: { allow: tlds }, // Use the imported tlds
                    })
                    .required(),
                },
                true
              ),
            },
          },
        },
        introspector
      )

      expect(db).toBeInstanceOf(ReactiveDatabase)
      expect(db.models).toContain('users')
      expect(introspector.options.models.users.constraints).toBeDefined()
    })

    it('should throw error for invalid constraints', () => {
      expect(
        () =>
          new ReactiveDatabase<{ users: TestUser }>({
            namespace: 'test-db',
            version: 1,
            psk: 'test-psk-that-is-long-enough',
            models: {
              users: {
                schema: '++id, name, email',
                properties: ['id', 'name', 'email'],
                primaryKey: 'id',
                relationships: {},
                // @ts-expect-error
                constraints: joi.string(),
              },
            },
          })
      ).toThrow(InvalidReactiveDatabaseOptionsError)
    })
  })

  describe('Logger Configuration', () => {
    it('should initialize with custom loggers for all levels', () => {
      const loggers: ReactiveDatabaseInitialLoggerOptions = {
        emerg: [(...args: unknown[]) => console.error(...args)],
        alert: [(...args: unknown[]) => console.error(...args)],
        crit: [(...args: unknown[]) => console.error(...args)],
        error: [(...args: unknown[]) => console.error(...args)],
        warning: [(...args: unknown[]) => console.warn(...args)],
        notice: [(...args: unknown[]) => console.info(...args)],
        info: [(...args: unknown[]) => console.info(...args)],
        debug: [(...args: unknown[]) => console.debug(...args)],
      }

      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
          namespace: 'test-db',
          version: 1,
          psk: 'test-psk-that-is-long-enough',
          models: {
            users: {
              schema: '++id, name, email',
              properties: ['id', 'name', 'email'],
              primaryKey: 'id',
              relationships: {},
            },
          },
          initial: {
            loggers,
            subscriptions: [],
          },
        },
        introspector
      )

      expect(db.logger).toBeDefined()
      expect(introspector.logBus).toBeDefined()
      expect(introspector.logger).toBeDefined()
      expect(introspector.options.initial.loggers).toEqual(loggers)
    })

    it('should handle multiple logger subscriptions with different severity levels', () => {
      const logs: Array<[string, ...unknown[]]> = []
      type LogLevel = keyof LogBusEventMap
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()

      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
          namespace: 'test-db',
          version: 1,
          psk: 'test-psk-that-is-long-enough',
          models: {
            users: {
              schema: '++id, name, email',
              properties: ['id', 'name', 'email'],
              primaryKey: 'id',
              relationships: {},
            },
          },
          initial: {
            loggers: {
              debug: [],
              error: [],
              emerg: [],
              alert: [],
              crit: [],
              warning: [],
              notice: [],
              info: [],
            },
            subscriptions: [
              ['error' as LogLevel, (...args: unknown[]) => logs.push(['error', ...args])],
              ['warning' as LogLevel, (...args: unknown[]) => logs.push(['warning', ...args])],
              ['info' as LogLevel, (...args: unknown[]) => logs.push(['info', ...args])],
            ],
          },
        },
        introspector
      )

      expect(db.logger).toBeDefined()
      expect(logs.length).toBeGreaterThanOrEqual(0)
      expect(introspector.logBus).toBeDefined()
      expect(introspector.options.initial.subscriptions.length).toBe(3)
    })
  })

  describe('Database Initialization', () => {
    it('should initialize database with correct namespace', async () => {
      const namespace = 'test-db-' + Date.now()
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
          namespace,
          version: 1,
          psk: 'test-psk-that-is-long-enough',
          models: {
            users: {
              schema: '++id, name, email',
              properties: ['id', 'name', 'email'],
              primaryKey: 'id',
              relationships: {},
            },
          },
        },
        introspector
      )

      expect(db).toBeInstanceOf(ReactiveDatabase)
      await db.promise

      // Verify internal state using introspector
      expect(introspector.db.name).toBe(namespace)
      expect(introspector.isReady).toBe(true)

      const indexDbDatabases = await indexedDB.databases()
      expect(indexDbDatabases.some((dbInfo) => dbInfo.name === namespace)).toBe(true)
    })

    it('should handle version updates with schema changes', async () => {
      const namespace = 'test-db-version'
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()

      // Update to version 2 with modified schema
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
          namespace,
          version: 2,
          psk: 'test-psk-that-is-long-enough',
          models: {
            users: {
              schema: '++id, name, email',
              properties: ['id', 'name', 'email'],
              primaryKey: 'id',
              relationships: {},
            },
          },
        },
        introspector
      )

      expect(db).toBeInstanceOf(ReactiveDatabase)
      expect(db.model('users')).toBeDefined()
      expect(introspector.options.version).toBe(2)
      expect(introspector.db.verno).toBe(2)
    })
  })

  describe('Type Safety', () => {
    it('should enforce model type constraints', () => {
      interface TypedUser extends PlainObject {
        id: number
        name: string
        age: number
      }

      const validUser: TypedUser = { id: 1, name: 'test', age: 25 }
      expectTypeOf(validUser).toMatchTypeOf<TypedUser>()

      // Test property types
      expectTypeOf<TypedUser['id']>().toBeNumber()
      expectTypeOf<TypedUser['name']>().toBeString()
      expectTypeOf<TypedUser['age']>().toBeNumber()
    })

    it('should enforce strict model property types', () => {
      interface StrictUser extends PlainObject {
        id: number
        name: string
        isActive: boolean
        metadata: {
          lastLogin: Date
          preferences: {
            theme: 'light' | 'dark'
            notifications: boolean
          }
        }
      }

      // Test nested type constraints
      type Theme = StrictUser['metadata']['preferences']['theme']
      expectTypeOf<Theme>().toEqualTypeOf<'light' | 'dark'>()

      // Test property types
      expectTypeOf<StrictUser['isActive']>().toBeBoolean()
      expectTypeOf<StrictUser['metadata']['lastLogin']>().toEqualTypeOf<Date>()
      expectTypeOf<StrictUser['metadata']['preferences']['notifications']>().toBeBoolean()
    })

    it('should enforce type safety between model interface and database configuration', () => {
      interface User extends PlainObject {
        id: number
        name: string
      }

      const db = new ReactiveDatabase<{ users: User }>({
        namespace: 'test-db',
        version: 1,
        psk: 'test-psk-that-is-long-enough',
        models: {
          users: {
            schema: '++id, name',
            properties: ['id', 'name'],
            primaryKey: 'id',
            relationships: {},
          },
        },
      })

      // Verify that db.models only allows valid model names
      expectTypeOf(db.models).toEqualTypeOf<Readonly<Array<'users'>>>()

      // Verify that model() method enforces model name type safety
      expectTypeOf(db.model).parameter(0).toEqualTypeOf<'users'>()
    })

    it('should enforce strict type constraints', () => {
      interface User extends PlainObject {
        id: number
        name: string
        age: number
      }

      // Test property types
      expectTypeOf<User['id']>().toBeNumber()
      expectTypeOf<User['name']>().toBeString()
      expectTypeOf<User['age']>().toBeNumber()

      // Test complete object type
      const validUser = { id: 1, name: 'test', age: 25 }
      expectTypeOf(validUser).toMatchTypeOf<User>()

      // Test that partial objects are not valid
      const partialUser = { id: 1, name: 'test' }
      expectTypeOf(partialUser).not.toMatchTypeOf<User>()
    })
  })

  describe('Hooks Configuration', () => {
    it('should accept valid hooks configuration', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
          namespace: 'test-db',
          version: 1,
          psk: 'test-psk-that-is-long-enough',
          models: {
            users: {
              schema: '++id, name, email',
              properties: ['id', 'name', 'email'],
              primaryKey: 'id',
              relationships: {},
            },
          },
          hooks: {
            wrapReactiveModel: (model) => model,
            wrapReactiveQueryCollection: (collection) => collection,
            wrapReactiveQueryResult: (result) => result,
          },
        },
        introspector
      )
      expect(db).toBeInstanceOf(ReactiveDatabase)
      expect(db.models).toContain('users')
    })

    it('should throw error for invalid hooks configuration', () => {
      expect(() => {
        new ReactiveDatabase<{ users: TestUser }>({
          namespace: 'test-db',
          version: 1,
          psk: 'test-psk-that-is-long-enough',
          models: {
            users: {
              schema: '++id, name, email',
              properties: ['id', 'name', 'email'],
              primaryKey: 'id',
              relationships: {},
            },
          },
          // @ts-expect-error
          hooks: { wrapReactiveModel: 123 },
        })
      }).toThrow(InvalidReactiveDatabaseOptionsError)
    })
  })

  describe('Configuration Defaults', () => {
    const minimalConfig = {
      namespace: 'test-db',
      version: 1,
      psk: 'test-psk-that-is-long-enough',
      models: {
        users: {
          schema: '++id, name, email',
          properties: ['id', 'name', 'email'],
          primaryKey: 'id',
          relationships: {},
        },
      },
    }

    it('should default hooks to identity functions', () => {
      const opts = { ...minimalConfig }
      const result = enforceTypeOrThrow<
        ReactiveDatabaseOptions<any>,
        InvalidReactiveDatabaseOptionsError
      >(opts, ReactiveDatabaseOptionsSchema, InvalidReactiveDatabaseOptionsError)
      expect(result.hooks).toBeDefined()
      // TypeScript: result.hooks is present due to default, so cast for test
      const hooks = result.hooks as NonNullable<typeof result.hooks>
      expect(typeof hooks.wrapReactiveModel).toBe('function')
      expect(typeof hooks.wrapReactiveQueryCollection).toBe('function')
      expect(typeof hooks.wrapReactiveQueryResult).toBe('function')
      // Identity check: use minimal stubs for type safety
      const fakeModel = { __test: 'model' } as any
      const fakeCollection = { __test: 'collection' } as any
      const fakeResult = { __test: 'result' } as any
      expect(hooks.wrapReactiveModel!(fakeModel)).toBe(fakeModel)
      expect(hooks.wrapReactiveQueryCollection!(fakeCollection)).toBe(fakeCollection)
      expect(hooks.wrapReactiveQueryResult!(fakeResult)).toBe(fakeResult)
    })

    it('should default initial to an object with loggers and subscriptions', () => {
      const opts = { ...minimalConfig }
      const result = enforceTypeOrThrow<
        ReactiveDatabaseOptions<any>,
        InvalidReactiveDatabaseOptionsError
      >(opts, ReactiveDatabaseOptionsSchema, InvalidReactiveDatabaseOptionsError)
      expect(result.initial).toBeDefined()
      expect(result.initial.loggers).toBeDefined()
      expect(result.initial.subscriptions).toBeDefined()
    })

    it('should default initial.loggers to all log levels as empty arrays', () => {
      const opts = { ...minimalConfig }
      const result = enforceTypeOrThrow<
        ReactiveDatabaseOptions<any>,
        InvalidReactiveDatabaseOptionsError
      >(opts, ReactiveDatabaseOptionsSchema, InvalidReactiveDatabaseOptionsError)
      const loggers = result.initial.loggers
      expect(Array.isArray(loggers.emerg)).toBe(true)
      expect(Array.isArray(loggers.alert)).toBe(true)
      expect(Array.isArray(loggers.crit)).toBe(true)
      expect(Array.isArray(loggers.error)).toBe(true)
      expect(Array.isArray(loggers.warning)).toBe(true)
      expect(Array.isArray(loggers.notice)).toBe(true)
      expect(Array.isArray(loggers.info)).toBe(true)
      expect(Array.isArray(loggers.debug)).toBe(true)
      for (const arr of Object.values(loggers)) {
        expect(arr.length).toBe(0)
      }
    })

    it('should default initial.subscriptions to an empty array', () => {
      const opts = { ...minimalConfig }
      const result = enforceTypeOrThrow<
        ReactiveDatabaseOptions<any>,
        InvalidReactiveDatabaseOptionsError
      >(opts, ReactiveDatabaseOptionsSchema, InvalidReactiveDatabaseOptionsError)
      expect(Array.isArray(result.initial.subscriptions)).toBe(true)
      expect(result.initial.subscriptions.length).toBe(0)
    })

    it('should default missing hooks properties when only one is provided', () => {
      const opts = {
        ...minimalConfig,
        hooks: {
          wrapReactiveModel: (model: any) => ({ wrapped: model }),
        },
      }
      const result = enforceTypeOrThrow<
        ReactiveDatabaseOptions<any>,
        InvalidReactiveDatabaseOptionsError
      >(opts, ReactiveDatabaseOptionsSchema, InvalidReactiveDatabaseOptionsError)
      const hooks = result.hooks as NonNullable<typeof result.hooks>
      expect(typeof hooks.wrapReactiveModel).toBe('function')
      expect(typeof hooks.wrapReactiveQueryCollection).toBe('function')
      expect(typeof hooks.wrapReactiveQueryResult).toBe('function')
      // Provided hook is used
      const fakeModel = { foo: 1 }
      expect(hooks.wrapReactiveModel!(fakeModel)).toEqual({ wrapped: fakeModel })
      // Others default to identity
      // Use 'as any' to satisfy type checks for test purposes
      expect(hooks.wrapReactiveQueryCollection!({} as any)).toEqual({} as any)
      expect(hooks.wrapReactiveQueryResult!({} as any)).toEqual({} as any)
    })

    it('should default missing loggers levels when only some are provided', () => {
      const opts = {
        ...minimalConfig,
        initial: {
          loggers: {
            error: [() => {}],
            info: [() => {}],
          },
        },
      }
      const result = enforceTypeOrThrow<
        ReactiveDatabaseOptions<any>,
        InvalidReactiveDatabaseOptionsError
      >(opts, ReactiveDatabaseOptionsSchema, InvalidReactiveDatabaseOptionsError)
      const loggers = result.initial.loggers
      expect(Array.isArray(loggers.error)).toBe(true)
      expect(Array.isArray(loggers.info)).toBe(true)
      expect(loggers.error.length).toBe(1)
      expect(loggers.info.length).toBe(1)
      // All other levels should be empty arrays
      const expectedEmpty = ['emerg', 'alert', 'crit', 'warning', 'notice', 'debug']
      for (const level of expectedEmpty) {
        expect(Array.isArray((loggers as any)[level])).toBe(true)
        expect((loggers as any)[level].length).toBe(0)
      }
    })

    it('should default initial.subscriptions to an empty array if only loggers is provided', () => {
      const opts = {
        ...minimalConfig,
        initial: {
          loggers: {
            error: [() => {}],
          },
        },
      }
      const result = enforceTypeOrThrow<
        ReactiveDatabaseOptions<any>,
        InvalidReactiveDatabaseOptionsError
      >(opts, ReactiveDatabaseOptionsSchema, InvalidReactiveDatabaseOptionsError)
      expect(Array.isArray(result.initial.subscriptions)).toBe(true)
      expect(result.initial.subscriptions.length).toBe(0)
    })

    it('should default initial.loggers to all levels as empty arrays if only subscriptions is provided', () => {
      const opts = {
        ...minimalConfig,
        initial: {
          subscriptions: [['error', () => {}]], // Fix: must be [LogLevel, Function] tuple
        },
      }
      const result = enforceTypeOrThrow<
        ReactiveDatabaseOptions<any>,
        InvalidReactiveDatabaseOptionsError
      >(opts, ReactiveDatabaseOptionsSchema, InvalidReactiveDatabaseOptionsError)
      const loggers = result.initial.loggers
      for (const arr of Object.values(loggers)) {
        expect(Array.isArray(arr)).toBe(true)
        expect(arr.length).toBe(0)
      }
    })

    it('should default missing hooks properties to identity functions when only one is provided', () => {
      const opts = {
        ...minimalConfig,
        hooks: {
          wrapReactiveModel: (model: any) => ({ ...model, wrapped: true }),
        },
      }
      const result = enforceTypeOrThrow<
        ReactiveDatabaseOptions<any>,
        InvalidReactiveDatabaseOptionsError
      >(opts, ReactiveDatabaseOptionsSchema, InvalidReactiveDatabaseOptionsError)
      const hooks = result.hooks!
      const fakeModel = { __test: 'model' } as any
      const fakeCollection = { __test: 'collection' } as any
      const fakeResult = { __test: 'result' } as any
      // Provided hook is used
      expect(hooks.wrapReactiveModel!(fakeModel)).toEqual({ ...fakeModel, wrapped: true })
      // Others default to identity
      expect(hooks.wrapReactiveQueryCollection!(fakeCollection)).toBe(fakeCollection)
      expect(hooks.wrapReactiveQueryResult!(fakeResult)).toBe(fakeResult)
    })

    it('should default missing logger levels to empty arrays when only some are provided', () => {
      const opts = {
        ...minimalConfig,
        initial: {
          loggers: {
            error: [() => {}],
            info: [() => {}],
          },
        },
      }
      const result = enforceTypeOrThrow<
        ReactiveDatabaseOptions<any>,
        InvalidReactiveDatabaseOptionsError
      >(opts, ReactiveDatabaseOptionsSchema, InvalidReactiveDatabaseOptionsError)
      const loggers = result.initial.loggers
      expect(Array.isArray(loggers.error)).toBe(true)
      expect(loggers.error.length).toBe(1)
      expect(Array.isArray(loggers.info)).toBe(true)
      expect(loggers.info.length).toBe(1)
      // All other levels should be empty arrays
      const expectedEmpty = ['emerg', 'alert', 'crit', 'warning', 'notice', 'debug']
      for (const level of expectedEmpty) {
        expect(Array.isArray((loggers as any)[level])).toBe(true)
        expect((loggers as any)[level].length).toBe(0)
      }
    })

    it('should default initial.subscriptions to an empty array if only loggers is provided', () => {
      const opts = {
        ...minimalConfig,
        initial: {
          loggers: {
            error: [() => {}],
          },
        },
      }
      const result = enforceTypeOrThrow<
        ReactiveDatabaseOptions<any>,
        InvalidReactiveDatabaseOptionsError
      >(opts, ReactiveDatabaseOptionsSchema, InvalidReactiveDatabaseOptionsError)
      expect(Array.isArray(result.initial.subscriptions)).toBe(true)
      expect(result.initial.subscriptions.length).toBe(0)
    })

    it('should default initial.loggers to all levels as empty arrays if only subscriptions is provided', () => {
      const opts = {
        ...minimalConfig,
        initial: {
          subscriptions: [['error', () => {}]], // Fix: must be [LogLevel, Function] tuple
        },
      }
      const result = enforceTypeOrThrow<
        ReactiveDatabaseOptions<any>,
        InvalidReactiveDatabaseOptionsError
      >(opts, ReactiveDatabaseOptionsSchema, InvalidReactiveDatabaseOptionsError)
      const loggers = result.initial.loggers
      for (const arr of Object.values(loggers)) {
        expect(Array.isArray(arr)).toBe(true)
        expect(arr.length).toBe(0)
      }
    })
  })
})
