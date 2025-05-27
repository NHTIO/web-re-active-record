import { Severities } from '../src/lib/class_logger'
import { ReactiveDatabase } from '../src/lib/class_reactive_database'
import { ReactiveDatabaseIntrospector } from '@nhtio/web-re-active-record/testing'
import { describe, it, expect, expectTypeOf, vi, beforeEach, afterEach } from 'vitest'
import type { PlainObject } from '../src/lib/types'

interface TestUser extends PlainObject {
  id: number
  name: string
}

describe('ReactiveDatabase Debugging', () => {
  beforeEach(async () => {
    // Clean up any existing databases before each test
    await ReactiveDatabase.shutdown()
  })

  afterEach(async () => {
    // Clean up after each test
    await ReactiveDatabase.shutdown()
  })

  describe('Logger Configuration', () => {
    it('should initialize with default empty loggers', () => {
      const db = new ReactiveDatabase<{ users: TestUser }>({
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

      expect(db.logger).toBeDefined()
      expectTypeOf(db.logger.on).toBeFunction()
      expectTypeOf(db.logger.off).toBeFunction()
      expectTypeOf(db.logger.subscribe).toBeFunction()
    })

    it('should handle custom logger callbacks', () => {
      const debugSpy = vi.fn()
      const errorSpy = vi.fn()
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()

      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
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
          initial: {
            loggers: {
              debug: [debugSpy],
              error: [errorSpy],
              emerg: [],
              alert: [],
              crit: [],
              warning: [],
              notice: [],
              info: [],
            },
            subscriptions: [],
          },
        },
        introspector
      )

      expect(debugSpy).toHaveBeenCalled()
      expect(db.logger).toBeDefined()
      expect(introspector.logger).toBeDefined()
      expect(introspector.logBus).toBeDefined()
    })
  })

  describe('Log Event Handling', () => {
    it('should allow subscribing to specific log levels', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
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
        },
        introspector
      )

      const debugSpy = vi.fn()
      db.logger.on('debug', debugSpy)
      expect(introspector.logBus.e.debug).toBeDefined()
      expect(introspector.logBus.e.debug.length).toBe(1)
    })

    it('should handle one-time log subscriptions', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
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
        },
        introspector
      )

      const infoSpy = vi.fn()
      db.logger.once('info', infoSpy)
      expect(introspector.logBus.e.info).toBeDefined()
      expect(introspector.logBus.e.info.length).toBe(1)
    })

    it('should allow unsubscribing from log events', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
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
        },
        introspector
      )

      const warningSpy = vi.fn()
      db.logger.on('warning', warningSpy)
      db.logger.off('warning', warningSpy)
      expect(introspector.logger).toBeDefined()
      expect(introspector.logBus).toBeDefined()
    })
  })

  describe('Severity-Based Subscriptions', () => {
    it('should handle severity-based subscriptions correctly', () => {
      const logs: Array<{ level: string; args: unknown[] }> = []
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
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
            subscriptions: [['error', (...args) => logs.push({ level: 'error', args })]],
          },
        },
        introspector
      )

      // Subscribe to warning level - should receive warning and above
      db.logger.subscribe('warning', (...args) => logs.push({ level: 'warning', args }))

      // Emit logs of different severities
      introspector.logBus.emit('debug', 'Debug message') // Should not be caught
      introspector.logBus.emit('info', 'Info message') // Should not be caught
      introspector.logBus.emit('warning', 'Warning message') // Should be caught by warning subscription
      introspector.logBus.emit('error', 'Error message') // Should be caught by both subscriptions
      introspector.logBus.emit('crit', 'Critical message') // Should be caught by both subscriptions
      introspector.logBus.emit('alert', 'Alert message') // Should be caught by both subscriptions
      introspector.logBus.emit('emerg', 'Emergency message') // Should be caught by both subscriptions

      // Verify debug and info were not caught
      expect(logs.filter((l) => l.args[0] === 'Debug message')).toHaveLength(0)
      expect(logs.filter((l) => l.args[0] === 'Info message')).toHaveLength(0)

      // Verify warning was caught once
      expect(logs.filter((l) => l.args[0] === 'Warning message')).toHaveLength(1)

      // Verify more severe messages were caught by both subscriptions
      expect(logs.filter((l) => l.args[0] === 'Error message')).toHaveLength(2)
      expect(logs.filter((l) => l.args[0] === 'Critical message')).toHaveLength(2)
      expect(logs.filter((l) => l.args[0] === 'Alert message')).toHaveLength(2)
      expect(logs.filter((l) => l.args[0] === 'Emergency message')).toHaveLength(2)
    })

    it('should respect severity levels hierarchy', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      new ReactiveDatabase<{ users: TestUser }>(
        {
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
        },
        introspector
      )

      const emergSpy = vi.fn()
      const warningSpy = vi.fn()
      const debugSpy = vi.fn()

      // Subscribe to different severity levels
      introspector.logBus.on('emerg', emergSpy)
      introspector.logBus.on('warning', warningSpy)
      introspector.logBus.on('debug', debugSpy)

      // Emit logs of different severities directly through the log bus
      introspector.logBus.emit('debug', 'Debug message')
      introspector.logBus.emit('warning', 'Warning message')
      introspector.logBus.emit('emerg', 'Emergency message')

      // Debug level should only receive debug messages
      expect(debugSpy).toHaveBeenCalledTimes(1)
      expect(debugSpy).toHaveBeenCalledWith('Debug message')

      // Warning level should receive warning messages
      expect(warningSpy).toHaveBeenCalledTimes(1)
      expect(warningSpy).toHaveBeenCalledWith('Warning message')

      // Emergency level should receive emergency messages
      expect(emergSpy).toHaveBeenCalledTimes(1)
      expect(emergSpy).toHaveBeenCalledWith('Emergency message')
    })
  })

  describe('Error Handler Integration', () => {
    it('should provide access to error handler', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
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
        },
        introspector
      )

      expect(db.errorHandler).toBeDefined()
      expect(introspector.errorHandler).toBeDefined()
      expect(introspector.errorBus).toBeDefined()
      expectTypeOf(db.errorHandler.on).toBeFunction()
      expectTypeOf(db.errorHandler.off).toBeFunction()
    })

    it('should handle error subscriptions and swallow errors when handlers are registered', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
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
        },
        introspector
      )

      const errorSpy = vi.fn()
      db.errorHandler.on(errorSpy)

      // Emit an error through the error bus
      const testError = new Error('Test error')
      introspector.errorBus.emit('error', testError)

      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledWith(testError)

      // Verify error is swallowed and doesn't propagate
      expect(() => {
        introspector.errorBus.emit('error', new Error('Another error'))
      }).not.toThrow()
    })

    it('should throw errors when no handlers are registered', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      new ReactiveDatabase<{ users: TestUser }>(
        {
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
        },
        introspector
      )

      const testError = new Error('Unhandled error')
      expect(() => {
        introspector.throw(testError)
      }).toThrow(testError)
    })

    it('should handle one-time error subscriptions', () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
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
        },
        introspector
      )

      const errorSpy = vi.fn()
      db.errorHandler.once(errorSpy)

      // Emit errors through the error bus
      const firstError = new Error('First error')
      const secondError = new Error('Second error')
      introspector.errorBus.emit('error', firstError)
      introspector.errorBus.emit('error', secondError)

      // Should only be called once with the first error
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledWith(firstError)
      expect(errorSpy).not.toHaveBeenCalledWith(secondError)
    })
  })

  describe('Type Safety', () => {
    it('should enforce type safety for logger methods', () => {
      const db = new ReactiveDatabase<{ users: TestUser }>({
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

      // Verify logger method types
      expectTypeOf(db.logger.on).toBeFunction()
      expectTypeOf(db.logger.once).toBeFunction()
      expectTypeOf(db.logger.off).toBeFunction()
      expectTypeOf(db.logger.subscribe).toBeFunction()
    })

    it('should handle concurrent event subscriptions correctly', async () => {
      const introspector = new ReactiveDatabaseIntrospector<{ users: TestUser }>()
      const db = new ReactiveDatabase<{ users: TestUser }>(
        {
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
        },
        introspector
      )

      const eventCount = 100
      let receivedCount = 0

      const handler = () => {
        receivedCount++
      }

      db.logger.on('info', handler)

      // Emit multiple events concurrently
      await Promise.all(
        Array.from({ length: eventCount }).map(
          () =>
            new Promise<void>((resolve) => {
              setTimeout(() => {
                introspector.logBus.emit('info', 'Concurrent event')
                resolve()
              }, Math.random() * 10)
            })
        )
      )

      // Allow event loop to process all events
      await new Promise((resolve) => setTimeout(resolve, 500))

      expect(receivedCount).toBe(eventCount)

      db.logger.off('info', handler)
    })

    it('should enforce type safety for severity levels', () => {
      // Verify severity level types
      expectTypeOf(Severities.emerg).toBeNumber()
      expectTypeOf(Severities.alert).toBeNumber()
      expectTypeOf(Severities.crit).toBeNumber()
      expectTypeOf(Severities.error).toBeNumber()
      expectTypeOf(Severities.warning).toBeNumber()
      expectTypeOf(Severities.notice).toBeNumber()
      expectTypeOf(Severities.info).toBeNumber()
      expectTypeOf(Severities.debug).toBeNumber()
    })

    it('should maintain correct severity level hierarchy', () => {
      // Verify severity levels are in ascending order (lower number = more severe)
      expect(Severities.emerg).toBeLessThan(Severities.alert)
      expect(Severities.alert).toBeLessThan(Severities.crit)
      expect(Severities.crit).toBeLessThan(Severities.error)
      expect(Severities.error).toBeLessThan(Severities.warning)
      expect(Severities.warning).toBeLessThan(Severities.notice)
      expect(Severities.notice).toBeLessThan(Severities.info)
      expect(Severities.info).toBeLessThan(Severities.debug)

      // Verify non-adjacent levels maintain hierarchy
      expect(Severities.emerg).toBeLessThan(Severities.error)
      expect(Severities.alert).toBeLessThan(Severities.warning)
      expect(Severities.crit).toBeLessThan(Severities.notice)
      expect(Severities.error).toBeLessThan(Severities.info)
      expect(Severities.warning).toBeLessThan(Severities.debug)
    })
  })
})
