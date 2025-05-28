import { Dexie } from 'dexie'
import { default as joi } from 'joi'
import { Logger } from './class_logger'
import { Swarm, setPSK } from '@nhtio/swarm'
import { Encryption } from '@nhtio/web-encryption'
import { ErrorHandler } from './class_error_handler'
import { enforceTypeOrThrow, getGlobal } from './utils'
import { UnifiedEventBus } from './class_unified_event_bus'
import { makeReactiveModel } from './factory_reactive_model'
import { TypedEventEmitter } from '@nhtio/tiny-typed-emitter'
import { dexieStoreSchema, relationshipConfig } from './validators'
import { ReactiveDatabaseIntrospector } from '@nhtio/web-re-active-record/testing'
import {
  InvalidReactiveDatabaseOptionsError,
  ReactiveDatabaseInitializationException,
  ReactiveDatabaseNoSuchModelException,
} from '@nhtio/web-re-active-record/errors'
import type { ObservabilitySet } from 'dexie'
import type { LogBusEventMap } from './class_logger'
import type { ErrorBusEventMap } from './class_error_handler'
import type { Key, Listener } from '@nhtio/tiny-typed-emitter'
import type { ModelConstraints } from '@nhtio/web-re-active-record/constraints'
import type { RelationshipConfiguration } from '@nhtio/web-re-active-record/relationships'
import type {
  PlainObject,
  DefaultObjectMap,
  StringKeyOf,
  ReActiveDatabaseDexie,
  ReactiveStateTypedEventMap,
} from './types'
import type {
  InferredReactiveModelConstructor,
  WrapReactiveModelHook,
  WrapReactiveQueryCollectionHook,
  WrapReactiveQueryResultHook,
} from '../types'

/**
 * The shape of an initial logger subscription object for the ReactiveDatabase.
 */
export type ReactiveDatabaseInitialOptionsSubscription<K> = [
  Key<K, LogBusEventMap>,
  Listener<K, LogBusEventMap>,
]

/**
 * The shape of the initial logger options object for the ReactiveDatabase.
 * @remarks These options are used to configure the initial state of the logger.
 */
export interface ReactiveDatabaseInitialLoggerOptions {
  /**
   * Callbacks which should be initially registered for `emerg` level logs
   */
  emerg: Array<Listener<'emerg', LogBusEventMap>>
  /**
   * Callbacks which should be initially registered for `alert` level logs
   */
  alert: Array<Listener<'alert', LogBusEventMap>>
  /**
   * Callbacks which should be initially registered for `crit` level logs
   */
  crit: Array<Listener<'crit', LogBusEventMap>>
  /**
   * Callbacks which should be initially registered for `error` level logs
   */
  error: Array<Listener<'error', LogBusEventMap>>
  /**
   * Callbacks which should be initially registered for `warning` level logs
   */
  warning: Array<Listener<'warning', LogBusEventMap>>
  /**
   * Callbacks which should be initially registered for `notice` level logs
   */
  notice: Array<Listener<'notice', LogBusEventMap>>
  /**
   * Callbacks which should be initially registered for `info` level logs
   */
  info: Array<Listener<'info', LogBusEventMap>>
  /**
   * Callbacks which should be initially registered for `debug` level logs
   */
  debug: Array<Listener<'debug', LogBusEventMap>>
}

/**
 * The shape of the initial configuration options object for the ReactiveDatabase.
 * @remarks These options are used to configure the initial state of the ReactiveDatabase.
 */
export interface ReactiveDatabaseInitialOptions {
  /**
   * The initial logger options for the ReactiveDatabase.
   */
  loggers: ReactiveDatabaseInitialLoggerOptions
  /**
   * The initial logger subscription options for the ReactiveDatabase.
   */
  subscriptions: Array<ReactiveDatabaseInitialOptionsSubscription<keyof LogBusEventMap>>
}

/**
 * The shape of an object which contains the definition of a model
 */
export interface ReactiveDatabaseModelDefinition<Model extends PlainObject> {
  /**
   * The dexie store schema for the model
   * @see [Dexie Documenation](https://dexie.org/docs/Version/Version.stores())
   */
  schema: string
  /**
   * An array of the model's properties
   */
  properties: Array<StringKeyOf<Model>>
  /**
   * The property which is used as the primary key for the model
   */
  primaryKey: StringKeyOf<Model>
  /**
   * The relationships which are defined for the model
   */
  relationships: Record<string, RelationshipConfiguration>
  /**
   * The validation constraints for the model
   */
  constraints?: ModelConstraints<Model>
}

/**
 * The shape of the configuration options object for the ReactiveDatabase.
 */
export interface ReactiveDatabaseOptions<
  ObjectMap extends Record<string, PlainObject> = DefaultObjectMap,
> {
  /**
   * The initial configuration options for the ReactiveDatabase.
   */
  initial: ReactiveDatabaseInitialOptions
  /**
   * The current database version number
   */
  namespace: string
  /**
   * The current database version number
   */
  version: number
  /**
   * A map which contains the schema definitions for the models which will be created over the
   * Dexie stores
   */
  models: {
    [K in StringKeyOf<ObjectMap>]: ReactiveDatabaseModelDefinition<ObjectMap[K]>
  }
  /**
   * The pre-shared key used to encrypt and decrypt values as they are passed between contexts
   * @remarks This key should be at least 16 characters long, but it should not be considered "secure" since it is available to anyone who decides to dig deep enough into your code base.
   */
  psk: string
  /**
   * Optional hooks for wrapping returned instances for integration with reactive frameworks.
   *
   * @property wrapReactiveModel - Hook to wrap every ReactiveModel instance before returning to the user.
   * @property wrapReactiveQueryCollection - Hook to wrap every ReactiveQueryCollection instance before returning to the user.
   * @property wrapReactiveQueryResult - Hook to wrap every ReactiveQueryResult instance before returning to the user.
   *
   * These hooks allow integration with frameworks such as Vue, Svelte, or others that require reactivity or proxies.
   * Each hook receives the original instance and must return the wrapped (or original) instance.
   *
   * If not provided, each hook defaults to an identity function (returns the original instance).
   */
  hooks?: {
    /**
     * Hook to wrap every ReactiveModel instance before returning to the user.
     */
    wrapReactiveModel?: WrapReactiveModelHook<
      ObjectMap[StringKeyOf<ObjectMap>],
      // Primary key type for the model
      ReactiveDatabaseModelDefinition<ObjectMap[StringKeyOf<ObjectMap>]>['primaryKey'],
      // Relationships config for the model
      ReactiveDatabaseModelDefinition<ObjectMap[StringKeyOf<ObjectMap>]>['relationships']
    >
    /**
     * Hook to wrap every ReactiveQueryCollection instance before returning to the user.
     */
    wrapReactiveQueryCollection?: WrapReactiveQueryCollectionHook<
      ObjectMap[StringKeyOf<ObjectMap>],
      ReactiveDatabaseModelDefinition<ObjectMap[StringKeyOf<ObjectMap>]>['primaryKey'],
      ReactiveDatabaseModelDefinition<ObjectMap[StringKeyOf<ObjectMap>]>['relationships'],
      any
    >
    /**
     * Hook to wrap every ReactiveQueryResult instance before returning to the user.
     */
    wrapReactiveQueryResult?: WrapReactiveQueryResultHook<
      ObjectMap[StringKeyOf<ObjectMap>],
      ReactiveDatabaseModelDefinition<ObjectMap[StringKeyOf<ObjectMap>]>['primaryKey'],
      ReactiveDatabaseModelDefinition<ObjectMap[StringKeyOf<ObjectMap>]>['relationships'],
      any
    >
  }
}

export const ReactiveDatabaseOptionsSchema = joi.object({
  initial: joi
    .object({
      loggers: joi
        .object({
          emerg: joi.array().items(joi.function()).default([]),
          alert: joi.array().items(joi.function()).default([]),
          crit: joi.array().items(joi.function()).default([]),
          error: joi.array().items(joi.function()).default([]),
          warning: joi.array().items(joi.function()).default([]),
          notice: joi.array().items(joi.function()).default([]),
          info: joi.array().items(joi.function()).default([]),
          debug: joi.array().items(joi.function()).default([]),
        })
        .default({
          emerg: [],
          alert: [],
          crit: [],
          error: [],
          warning: [],
          notice: [],
          info: [],
          debug: [],
        }),
      subscriptions: joi
        .array()
        .items(
          joi
            .array()
            .items(
              joi
                .string()
                .allow('emerg', 'alert', 'crit', 'error', 'warning', 'notice', 'info', 'debug'),
              joi.function()
            )
            .length(2)
        )
        .default([]),
    })
    .default({
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
    }),
  namespace: joi.string().required(),
  version: joi.number().min(1).required(),
  models: joi
    .object()
    .pattern(
      joi.string(),
      joi
        .object({
          schema: dexieStoreSchema,
          properties: joi.array().items(joi.string()).required(),
          primaryKey: joi.string().required(),
          relationships: joi
            .object()
            .optional()
            .default({})
            .pattern(joi.string(), relationshipConfig),
          constraints: joi.custom((value, helpers) => {
            if (value && typeof value !== 'object') {
              return helpers.error('any.custom', {
                message: 'constraints must be a joi ObjectSchema',
              })
            } else if (value && typeof value === 'object') {
              // check if we're dealing with a joi schema
              if (value.isJoi) {
                return value
              } else if (joi.isSchema(value)) {
                if (value.type !== 'object') {
                  return helpers.error('any.custom', {
                    message: 'constraints must be a joi ObjectSchema',
                  })
                }
                return value
              }
            }
            return value
          }),
        })
        .custom((value, helpers) => {
          // Validate that primaryKey exists in properties
          if (!value.properties.includes(value.primaryKey)) {
            return helpers.error('any.custom', {
              message: `primaryKey "${value.primaryKey}" must be included in properties array`,
            })
          }
          return value
        })
    )
    .required(),
  psk: joi.string().required().min(16),
  hooks: joi
    .object({
      wrapReactiveModel: joi
        .function()
        .arity(1)
        .optional()
        .default(() => (model: any) => model),
      wrapReactiveQueryCollection: joi
        .function()
        .arity(1)
        .optional()
        .default(() => (model: any) => model),
      wrapReactiveQueryResult: joi
        .function()
        .arity(1)
        .optional()
        .default(() => (model: any) => model),
    })
    .default({
      wrapReactiveModel: (model: any) => model,
      wrapReactiveQueryCollection: (collection: any) => collection,
      wrapReactiveQueryResult: (result: any) => result,
    }),
})

const knownReactiveDatabases = new Set<ReactiveDatabase<any>>()
let rejectionHandler: ReturnType<(typeof window)['addEventListener']> | undefined

/**
 * The main entry point for the Reactive Active Record ORM.
 * @typeParam ObjectMap - an interface where the key is the name of the store and the value is the type of the object stored in that store.
 */
export class ReactiveDatabase<ObjectMap extends Record<string, PlainObject> = DefaultObjectMap> {
  readonly #options: ReactiveDatabaseOptions<ObjectMap>
  readonly #swarm: Swarm<ReactiveStateTypedEventMap>
  readonly #unifiedEventBus: UnifiedEventBus
  readonly #encryption: Encryption
  readonly #logBus: TypedEventEmitter<LogBusEventMap>
  readonly #errorBus: TypedEventEmitter<ErrorBusEventMap>
  readonly #logger: Logger
  readonly #errorHandler: ErrorHandler
  readonly #db: ReActiveDatabaseDexie<ObjectMap>
  readonly #models: Map<
    StringKeyOf<ObjectMap>,
    InferredReactiveModelConstructor<
      ObjectMap,
      ReactiveDatabaseOptions<ObjectMap>,
      StringKeyOf<ObjectMap>
    >
  >
  readonly #readyPromise: Promise<void>
  readonly #cleanupCallbacks: Array<() => Promise<void>>
  #isReady: boolean
  #shuttingDown: boolean

  /**
   * Creates a new ReactiveDatabase instance.
   * @param opts The configuration options for the ReactiveDatabase instance.
   * @param introspector An optional introspector instance for testing purposes.
   * @throws {@link @nhtio/web-re-active-record/errors!InvalidReactiveDatabaseOptionsError | InvalidReactiveDatabaseOptionsError} if the options are invalid.
   * @throws {@link @nhtio/web-re-active-record/errors!ReactiveDatabaseInitializationException | ReactiveDatabaseInitializationException} if the database cannot be initialized.
   */
  constructor(
    opts: Partial<ReactiveDatabaseOptions<ObjectMap>> = {},
    introspector?: ReactiveDatabaseIntrospector<ObjectMap>
  ) {
    if ('undefined' === typeof rejectionHandler) {
      const context = getGlobal()
      if (context) {
        rejectionHandler = context.addEventListener(
          'unhandledrejection',
          this.#onUnhandledRejection.bind(this),
          {
            passive: true,
          }
        )
      }
    }
    this.#options = enforceTypeOrThrow<
      ReactiveDatabaseOptions<ObjectMap>,
      InvalidReactiveDatabaseOptionsError
    >(opts, ReactiveDatabaseOptionsSchema, InvalidReactiveDatabaseOptionsError)
    knownReactiveDatabases.add(this)
    setPSK(this.#options.psk)
    this.#swarm = Swarm.instance<ReactiveStateTypedEventMap>()
    this.#unifiedEventBus = new UnifiedEventBus(this.#swarm)
    this.#encryption = new Encryption({ secret: this.#options.psk })
    this.#logBus = new TypedEventEmitter<LogBusEventMap>()
    this.#errorBus = new TypedEventEmitter<ErrorBusEventMap>()
    this.#db = new Dexie(this.#options.namespace, {
      autoOpen: false,
    }) as ReActiveDatabaseDexie<ObjectMap>
    this.#db.on('blocked', this.#onDexieDbBlocked.bind(this))
    this.#db.on('close', this.#onDexieDbUnexpectedClose.bind(this))
    this.#db.on('ready', this.#onDexieDbReady.bind(this))
    this.#models = new Map()
    this.#logger = new Logger(this.#logBus)
    this.#cleanupCallbacks = []
    this.#errorHandler = new ErrorHandler(this.#errorBus)
    for (const [level, callbacks] of Object.entries(this.#options.initial.loggers) as [
      StringKeyOf<LogBusEventMap>,
      Array<Listener<StringKeyOf<LogBusEventMap>, LogBusEventMap>>,
    ][]) {
      for (const callback of callbacks) {
        this.#logger.on(level, callback)
      }
    }
    this.#options.initial.subscriptions.forEach(([level, callback]) => {
      this.#logger.subscribe(level, callback)
    })
    this.#log('debug', 'ReactiveDatabase initializing')
    const stores: Record<string, string> = {}
    Object.keys(this.#options.models).forEach((model) => {
      const { schema } = this.#options.models[model]
      stores[model] = schema
    })
    try {
      this.#db.version(this.#options.version).stores(stores)
      for (const model of Object.keys(this.#options.models) as Array<StringKeyOf<ObjectMap>>) {
        const modelConstructor = this.#makeModelPrototype(model)
        this.#models.set(model, modelConstructor)
      }
      this.#log('debug', 'ReactiveDatabase initialized')
      this.#log(
        'debug',
        `\nReactiveDatabase version: ${this.#options.version}\nReactiveDatabase namespace: ${this.#options.namespace}\nReactiveDatabase models: ${this.models.map((m) => `"${String(m)}"`).join(', ')}`
      )
    } catch (err) {
      for (const [level] of Object.entries(this.#options.initial.loggers) as [
        StringKeyOf<LogBusEventMap>,
        Array<Listener<StringKeyOf<LogBusEventMap>, LogBusEventMap>>,
      ][]) {
        this.#logBus.off(level)
      }
      throw new ReactiveDatabaseInitializationException(err)
    }
    Dexie.on('storagemutated', this.#onDexieNoticedStorageMutated.bind(this))
    this.#isReady = false
    this.#shuttingDown = false
    this.#readyPromise = new Promise((resolve) => {
      this.#db.on('ready', () => {
        this.#isReady = true
        this.#log('debug', 'Dexie database is open and ready')
        resolve()
      })
    })
    this.#db.open().catch((err) => {
      this.#log('error', 'Dexie database failed to open')
      this.#throw(err)
    })
    if (introspector instanceof ReactiveDatabaseIntrospector) {
      try {
        introspector.$init(
          () => this.#options,
          () => this.#unifiedEventBus,
          () => this.#encryption,
          () => this.#logBus,
          () => this.#errorBus,
          () => this.#logger,
          () => this.#errorHandler,
          () => this.#db,
          () => this.#models,
          () => this.#readyPromise,
          () => this.#isReady,
          this.#log.bind(this),
          this.#throw.bind(this),
          this.#makeModelPrototype.bind(this)
        )
      } catch (err) {
        this.#log('error', 'Failed to initialize introspector')
        if (err instanceof Error) {
          this.#throw(err)
        } else {
          this.#throw(new Error('Failed to initialize introspector'))
        }
      }
    }
  }

  /**
   * A logger instance which can be used to subscribe to log events.
   * @category Instance Accessors
   */
  get logger(): Readonly<Logger> {
    return this.#logger
  }

  /**
   * Provides methods for handling asyncronously thrown errors.
   * @warning If an error is thrown and there are not any handlers registered, the error will be thrown normally. Otherwise the error is "swallowed" and will not be thrown by the ReactiveDatabase.
   * @category Instance Accessors
   */
  get errorHandler(): Readonly<ErrorHandler> {
    return this.#errorHandler
  }

  /**
   * Provides an array of all the models which have been registered with the ReactiveDatabase.
   * @category Instance Accessors
   */
  get models(): Readonly<Array<StringKeyOf<ObjectMap>>> {
    return Array.from(this.#models.keys())
  }

  /**
   * Indicates whether the database is ready to be used.
   * @category Instance Accessors
   */
  get ready() {
    return this.#isReady
  }

  /**
   * Waits for the database to be ready.
   * @category Instance Accessors
   */
  get promise() {
    if (this.#isReady) {
      return Promise.resolve()
    } else {
      return this.#readyPromise
    }
  }

  #log<K>(level: Key<K, LogBusEventMap>, ...args: any[]) {
    this.#logBus.emit(level, ...args)
  }

  #throw(err: Error) {
    if (Array.isArray(this.#errorBus.e.error) && this.#errorBus.e.error.length > 0) {
      this.#errorBus.emit('error', err)
    } else {
      throw err
    }
  }

  #makeModelPrototype(model: StringKeyOf<ObjectMap>) {
    this.#log('debug', `Registering model: ${String(model)}`)
    const modelPrototype = makeReactiveModel(
      model,
      this.#options.models[model].properties,
      this.#options.models[model].primaryKey,
      this.#unifiedEventBus,
      this.#encryption,
      this.#logBus,
      this.#throw.bind(this),
      this,
      this.#db[model] as any,
      this.#options.models[model].relationships,
      this.#addCleanupCallback.bind(this),
      this.#options.models[model].constraints,
      this.#options.hooks! as Required<ReactiveDatabaseOptions<ObjectMap>['hooks']>
    )
    this.#log('info', `Model ${String(model)} registered successfully`)
    return modelPrototype
  }

  #addCleanupCallback(callback: () => Promise<void>) {
    this.#cleanupCallbacks.push(callback)
  }

  #onDexieNoticedStorageMutated(mutations: ObservabilitySet) {
    this.#log('debug', `Storage mutation detected: ${JSON.stringify(mutations)}`)
    this.#swarm.emit('reactivedatabase:storagemutated', mutations)
  }

  #onDexieDbReady() {
    this.#log('debug', 'Dexie database is open and ready')
  }

  #onDexieDbBlocked() {
    this.#log('warning', 'Database upgrading was blocked by another window.')
    this.#log('warning', 'Please close down any other tabs or windows that has this page open')
  }

  #onDexieDbUnexpectedClose() {
    if (this.#shuttingDown) return
    this.#log('crit', 'Database was forcibly closed by an external process.')
  }

  #onUnhandledRejection(event: PromiseRejectionEvent) {
    const { reason } = event
    if (reason instanceof Error) {
      // here we need to check if stack for the error includes the ReactiveDatabase
      // if it does, we need to throw the error
      if (reason.stack && reason.stack.includes('ReactiveDatabase')) {
        this.#log('error', 'Unhandled rejection detected in ReactiveDatabase')
        this.#log('error', reason)
        this.#throw(reason)
      }
    }
  }

  /**
   * Retrieve a model constructor for the specified model.
   * @param model The name of the model to get.
   * @throws {@link @nhtio/web-re-active-record/errors!ReactiveDatabaseNoSuchModelException | ReactiveDatabaseNoSuchModelException} if the model does not exist.
   * @returns The model constructor for the specified model.
   * @typeParam K The name of the model to get.
   * @category Instance Methods
   */
  model<K extends StringKeyOf<ObjectMap>>(
    model: K
  ): InferredReactiveModelConstructor<ObjectMap, ReactiveDatabaseOptions<ObjectMap>, K> {
    const modelConstructor = this.#models.get(model)
    if (modelConstructor) {
      return modelConstructor as unknown as InferredReactiveModelConstructor<
        ObjectMap,
        ReactiveDatabaseOptions<ObjectMap>,
        K
      >
    } else {
      throw new ReactiveDatabaseNoSuchModelException(model)
    }
  }

  /**
   * Closes the database connection, cleans up resources, and stops all event listeners.
   * @remarks This method should be called when the database is no longer needed.
   * @category Instance Methods
   */
  async shutdown() {
    if (this.#shuttingDown) return
    this.#shuttingDown = true
    // Run all cleanup callbacks
    await Promise.all(this.#cleanupCallbacks.map((callback) => callback()))
    // Closes the database connection
    const dexieClosedPromise = new Promise<void>((resolve) => {
      this.#db.on('close', () => {
        this.#log('debug', 'Dexie database closed')
        resolve()
      })
      setTimeout(() => {
        this.#log('debug', 'Dexie database close timed out')
        resolve()
      }, 500)
    })
    this.#db.close({ disableAutoOpen: true })
    await dexieClosedPromise
    // Cleans up the model constructor map
    this.#models.clear()
    // cleans up the error listeners
    for (const key in this.#errorBus.e) {
      this.#errorBus.off(key)
    }
    // cleans up the log event listeners
    for (const key in this.#logBus.e) {
      this.#logBus.off(key)
    }
  }

  /**
   * Closes all database connections in the current context
   * @category Static Methods
   */
  static async shutdown() {
    await Promise.all(Array.from(knownReactiveDatabases).map((db) => db.shutdown().catch(() => {})))
  }
}
