import { ERROR_CANNOT_REINITIALIZE, ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION } from './common'
import type { Logger } from '../lib/class_logger'
import type { Encryption } from '@nhtio/web-encryption'
import type { LogBusEventMap } from '../lib/class_logger'
import type { ErrorHandler } from '../lib/class_error_handler'
import type { ErrorBusEventMap } from '../lib/class_error_handler'
import type { UnifiedEventBus } from '../lib/class_unified_event_bus'
import type { TypedEventEmitter, Key } from '@nhtio/tiny-typed-emitter'
import type { ReactiveModelConstructor } from '../lib/factory_reactive_model'
import type { ReactiveDatabaseOptions } from '@nhtio/web-re-active-record/types'
import type {
  ReActiveDatabaseDexie,
  PlainObject,
  DefaultObjectMap,
  StringKeyOf,
} from '../lib/types'

/**
 * A testing utility class that provides access to the private members of the ReactiveDatabase class.
 * This class is designed to help with testing by exposing internal state that would otherwise be
 * inaccessible due to TypeScript's private field declarations.
 *
 * @typeParam ObjectMap - A record type where keys are store names and values are plain objects
 *                       representing the structure of stored data. Defaults to DefaultObjectMap.
 */
export class ReactiveDatabaseIntrospector<
  ObjectMap extends Record<string, PlainObject> = DefaultObjectMap,
> {
  /** Function that returns the configuration options for the ReactiveDatabase */
  #options?: () => ReactiveDatabaseOptions<any>
  /** Function that returns the Swarm instance used for state synchronization */
  #swarm?: () => UnifiedEventBus
  /** Function that returns the Encryption instance used for data encryption */
  #encryption?: () => Encryption
  /** Function that returns the event emitter for logging events */
  #logBus?: () => TypedEventEmitter<LogBusEventMap>
  /** Function that returns the event emitter for error events */
  #errorBus?: () => TypedEventEmitter<ErrorBusEventMap>
  /** Function that returns the Logger instance */
  #logger?: () => Logger
  /** Function that returns the ErrorHandler instance */
  #errorHandler?: () => ErrorHandler
  /** Function that returns the Dexie database instance */
  #db?: () => ReActiveDatabaseDexie<ObjectMap>
  /** Function that returns the map of model constructors */
  #models?: () => Map<
    StringKeyOf<ObjectMap>,
    ReactiveModelConstructor<
      ObjectMap[StringKeyOf<ObjectMap>],
      ReactiveDatabaseOptions<ObjectMap>['models'][StringKeyOf<ObjectMap>]['primaryKey'],
      ReactiveDatabaseOptions<ObjectMap>['models'][StringKeyOf<ObjectMap>]['relationships']
    >
  >
  /** Function that returns the promise that resolves when the database is ready */
  #readyPromise?: () => Promise<void>
  /** Function that returns whether the database is ready */
  #isReady?: () => boolean
  /** Function which triggers a log to be emitted */
  #log?: <K>(level: Key<K, LogBusEventMap>, ...args: any[]) => void
  /** Function which throws an error via the error handler */
  #throw?: (err: Error) => void
  /** Function which makes a model constructor for the specified model */
  #makeModelPrototype?: (
    model: StringKeyOf<ObjectMap>
  ) => ReactiveModelConstructor<
    ObjectMap[StringKeyOf<ObjectMap>],
    ReactiveDatabaseOptions<ObjectMap>['models'][StringKeyOf<ObjectMap>]['primaryKey'],
    ReactiveDatabaseOptions<ObjectMap>['models'][StringKeyOf<ObjectMap>]['relationships']
  >

  /**
   * Initializes the ReactiveDatabaseIntrospector instance with the accessors for the private members
   *
   * @param options - Function that returns the ReactiveDatabase configuration options
   * @param swarm - Function that returns the Swarm instance for state synchronization
   * @param encryption - Function that returns the Encryption instance
   * @param logBus - Function that returns the logging event emitter
   * @param errorBus - Function that returns the error event emitter
   * @param logger - Function that returns the Logger instance
   * @param errorHandler - Function that returns the ErrorHandler instance
   * @param db - Function that returns the Dexie database instance
   * @param models - Function that returns the map of model constructors
   * @param readyPromise - Function that returns the database ready promise
   * @param isReady - Function that returns the database ready state
   */
  $init(
    options: () => ReactiveDatabaseOptions<ObjectMap>,
    swarm: () => UnifiedEventBus,
    encryption: () => Encryption,
    logBus: () => TypedEventEmitter<LogBusEventMap>,
    errorBus: () => TypedEventEmitter<ErrorBusEventMap>,
    logger: () => Logger,
    errorHandler: () => ErrorHandler,
    db: () => ReActiveDatabaseDexie<ObjectMap>,
    models: () => Map<
      StringKeyOf<ObjectMap>,
      ReactiveModelConstructor<
        ObjectMap[StringKeyOf<ObjectMap>],
        ReactiveDatabaseOptions<ObjectMap>['models'][StringKeyOf<ObjectMap>]['primaryKey'],
        ReactiveDatabaseOptions<ObjectMap>['models'][StringKeyOf<ObjectMap>]['relationships']
      >
    >,
    readyPromise: () => Promise<void>,
    isReady: () => boolean,
    $log: <K>(level: Key<K, LogBusEventMap>, ...args: any[]) => void,
    $throw: (err: Error) => void,
    $makeModelPrototype: (
      model: StringKeyOf<ObjectMap>
    ) => ReactiveModelConstructor<
      ObjectMap[StringKeyOf<ObjectMap>],
      ReactiveDatabaseOptions<ObjectMap>['models'][StringKeyOf<ObjectMap>]['primaryKey'],
      ReactiveDatabaseOptions<ObjectMap>['models'][StringKeyOf<ObjectMap>]['relationships']
    >
  ) {
    if ('undefined' !== typeof this.#options) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#options = options
    if ('undefined' !== typeof this.#swarm) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#swarm = swarm
    if ('undefined' !== typeof this.#encryption) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#encryption = encryption
    if ('undefined' !== typeof this.#logBus) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#logBus = logBus
    if ('undefined' !== typeof this.#errorBus) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#errorBus = errorBus
    if ('undefined' !== typeof this.#logger) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#logger = logger
    if ('undefined' !== typeof this.#errorHandler) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#errorHandler = errorHandler
    if ('undefined' !== typeof this.#db) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#db = db
    if ('undefined' !== typeof this.#models) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#models = models
    if ('undefined' !== typeof this.#readyPromise) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#readyPromise = readyPromise
    if ('undefined' !== typeof this.#isReady) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#isReady = isReady
    if ('undefined' !== typeof this.#log) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#log = $log
    if ('undefined' !== typeof this.#throw) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#throw = $throw
    if ('undefined' !== typeof this.#makeModelPrototype) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#makeModelPrototype = $makeModelPrototype
  }

  /** Gets the ReactiveDatabase configuration options */
  get options() {
    if ('undefined' === typeof this.#options) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#options()
  }

  /** Gets the Swarm instance used for state synchronization */
  get swarm() {
    if ('undefined' === typeof this.#swarm) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#swarm()
  }

  /** Gets the Encryption instance used for data encryption */
  get encryption() {
    if ('undefined' === typeof this.#encryption) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#encryption()
  }

  /** Gets the event emitter for logging events */
  get logBus() {
    if ('undefined' === typeof this.#logBus) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#logBus()
  }

  /** Gets the event emitter for error events */
  get errorBus() {
    if ('undefined' === typeof this.#errorBus) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#errorBus()
  }

  /** Gets the Logger instance */
  get logger() {
    if ('undefined' === typeof this.#logger) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#logger()
  }

  /** Gets the ErrorHandler instance */
  get errorHandler() {
    if ('undefined' === typeof this.#errorHandler) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#errorHandler()
  }

  /** Gets the Dexie database instance */
  get db() {
    if ('undefined' === typeof this.#db) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#db()
  }

  /** Gets the map of model constructors */
  get models() {
    if ('undefined' === typeof this.#models) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#models()
  }

  /** Gets the promise that resolves when the database is ready */
  get readyPromise() {
    if ('undefined' === typeof this.#readyPromise) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#readyPromise()
  }

  /** Gets whether the database is ready */
  get isReady() {
    if ('undefined' === typeof this.#isReady) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#isReady()
  }

  /** Triggers a log to be emitted */
  log<K>(level: Key<K, LogBusEventMap>, ...args: any[]) {
    if ('undefined' === typeof this.#log) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#log!(level, ...args)
  }
  /** Function which throws an error via the error handler */
  throw(err: Error) {
    if ('undefined' === typeof this.#throw) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#throw!(err)
  }
  /** Function which makes a model constructor for the specified model */
  makeModelPrototype(model: StringKeyOf<ObjectMap>) {
    if ('undefined' === typeof this.#makeModelPrototype) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#makeModelPrototype!(model)
  }
}
