import { ERROR_CANNOT_REINITIALIZE, ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION } from './common'
import type { EntityTable } from 'dexie'
import type { LogBusEventMap } from '../lib/class_logger'
import type { PlainObject, StringKeyOf } from '../lib/types'
import type { TypedEventEmitter, Key } from '@nhtio/tiny-typed-emitter'
import type { RelationshipConfiguration } from '@nhtio/web-re-active-record/relationships'
import type { ReactiveModelConstructor, ReactiveModel } from '../lib/factory_reactive_model'
import type {
  ReactiveQueryBuilderClause,
  WhereCondition,
} from '../lib/class_reactive_query_builder'

/**
 * A testing utility class that provides introspection capabilities for ReactiveQueryBuilder.
 * This class allows access to private members of ReactiveQueryBuilder for testing purposes.
 *
 * @typeParam T - The type of the model being queried
 * @typeParam PK - The type of the primary key of the model
 * @typeParam R - The type of the relationship configurations
 */
export class ReactiveQueryBuilderIntrospector<
  T extends PlainObject,
  PK extends StringKeyOf<T>,
  R extends Record<string, RelationshipConfiguration>,
> {
  /** @private Query builder clauses accessor */
  #clauses?: () => ReactiveQueryBuilderClause[]
  /** @private Query builder where conditions */
  #whereConditions?: () => WhereCondition<T>[]
  /** @private Model constructor accessor */
  #ctor?: () => ReactiveModelConstructor<T, PK, R>
  /** @private Available relationship names accessor */
  #relatable?: () => StringKeyOf<R>[]
  /** @private Database table accessor */
  #table?: () => EntityTable<T>
  /** @private Active relations accessor */
  #relations?: () => Set<StringKeyOf<R>>
  /** @private Primary key */
  #primaryKey?: () => PK
  /** @private Log bus accessor */
  #logBus?: () => TypedEventEmitter<LogBusEventMap>
  /** @private Cleanup callback registrar accessor */
  #addCleanupCallback?: () => (cb: () => Promise<void>) => void
  /** @private Abort controller accessor */
  #abortController?: () => AbortController
  /** @private Logging function accessor */
  #log?: <K>(level: Key<K, LogBusEventMap>, ...args: any[]) => void
  /** @private Query execution function accessor */
  #execute?: () => Promise<number | ReactiveModel<T, PK, R> | ReactiveModel<T, PK, R>[] | undefined>
  /** @private Array result accessor */
  #getReturnableArray?: (records: ReactiveModel<T, PK, R>[]) => Promise<ReactiveModel<T, PK, R>[]>
  /** @private Single result accessor */
  #getReturnable?: (record: ReactiveModel<T, PK, R>) => Promise<ReactiveModel<T, PK, R>>

  /**
   * Initializes the introspector with accessors to private members of ReactiveQueryBuilder.
   * This method can only be called once - subsequent calls will throw an error.
   *
   * @param clauses - Function to access query builder clauses
   * @param ctor - Function to access the model constructor
   * @param relatable - Function to access available relationship names
   * @param table - Function to access the database table
   * @param relations - Function to access active relations
   * @param logBus - Function to access the log bus
   * @param addCleanupCallback - Function to access the cleanup callback registrar
   * @param abortController - Function to access the abort controller
   * @param log - Function to access the logging function
   * @param execute - Function to access the query execution function
   * @param getReturnableArray - Function to access the array result getter
   * @param getReturnable - Function to access the single result getter
   * @throws {Error} If attempting to reinitialize any accessor
   */
  $init(
    clauses: () => ReactiveQueryBuilderClause[],
    whereConditions: () => WhereCondition<T>[],
    ctor: () => ReactiveModelConstructor<T, PK, R>,
    relatable: () => StringKeyOf<R>[],
    table: () => EntityTable<T>,
    primaryKey: () => PK,
    relations: () => Set<StringKeyOf<R>>,
    logBus: () => TypedEventEmitter<LogBusEventMap>,
    addCleanupCallback: () => (cb: () => Promise<void>) => void,
    abortController: () => AbortController,
    log: <K>(level: Key<K, LogBusEventMap>, ...args: any[]) => void,
    execute: () => Promise<
      number | ReactiveModel<T, PK, R> | ReactiveModel<T, PK, R>[] | undefined
    >,
    getReturnableArray: (records: ReactiveModel<T, PK, R>[]) => Promise<ReactiveModel<T, PK, R>[]>,
    getReturnable: (record: ReactiveModel<T, PK, R>) => Promise<ReactiveModel<T, PK, R>>
  ) {
    if ('undefined' !== typeof this.#clauses) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#clauses = clauses
    if ('undefined' !== typeof this.#whereConditions) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#whereConditions = whereConditions
    if ('undefined' !== typeof this.#ctor) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#ctor = ctor
    if ('undefined' !== typeof this.#relatable) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#relatable = relatable
    if ('undefined' !== typeof this.#table) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#table = table
    if ('undefined' !== typeof this.#relations) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#relations = relations
    if ('undefined' !== typeof this.#primaryKey) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#primaryKey = primaryKey
    if ('undefined' !== typeof this.#logBus) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#logBus = logBus
    if ('undefined' !== typeof this.#addCleanupCallback) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#addCleanupCallback = addCleanupCallback
    if ('undefined' !== typeof this.#abortController) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#abortController = abortController
    if ('undefined' !== typeof this.#log) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#log = log
    if ('undefined' !== typeof this.#execute) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#execute = execute
    if ('undefined' !== typeof this.#getReturnableArray) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#getReturnableArray = getReturnableArray
    if ('undefined' !== typeof this.#getReturnable) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#getReturnable = getReturnable
  }

  /**
   * Gets the current query builder clauses.
   * @throws {Error} If accessed before initialization
   */
  get clauses() {
    if ('undefined' === typeof this.#clauses) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#clauses()
  }

  /**
   * Gets the current query builder where conditions.
   * @throws {Error} If accessed before initialization
   */
  get whereConditions() {
    if ('undefined' === typeof this.#whereConditions) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#whereConditions()
  }

  /**
   * Gets the model constructor.
   * @throws {Error} If accessed before initialization
   */
  get ctor() {
    if ('undefined' === typeof this.#ctor) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#ctor()
  }

  /**
   * Gets the available relationship names.
   * @throws {Error} If accessed before initialization
   */
  get relatable() {
    if ('undefined' === typeof this.#relatable) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#relatable()
  }

  /**
   * Gets the primary key.
   * @throws {Error} If accessed before initialization
   */
  get primaryKey() {
    if ('undefined' === typeof this.#primaryKey) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#primaryKey()
  }

  /**
   * Gets the database table.
   * @throws {Error} If accessed before initialization
   */
  get table() {
    if ('undefined' === typeof this.#table) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#table()
  }

  /**
   * Gets the set of active relations.
   * @throws {Error} If accessed before initialization
   */
  get relations() {
    if ('undefined' === typeof this.#relations) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#relations()
  }

  /**
   * Gets the log bus event emitter.
   * @throws {Error} If accessed before initialization
   */
  get logBus() {
    if ('undefined' === typeof this.#logBus) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#logBus()
  }

  /**
   * Gets the cleanup callback registrar.
   * @throws {Error} If accessed before initialization
   */
  get addCleanupCallback() {
    if ('undefined' === typeof this.#addCleanupCallback) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#addCleanupCallback()
  }

  /**
   * Gets the abort controller.
   * @throws {Error} If accessed before initialization
   */
  get abortController() {
    if ('undefined' === typeof this.#abortController) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#abortController()
  }

  /**
   * Logs a message with the specified level.
   * @param level - The log level
   * @param args - Arguments to log
   * @throws {Error} If accessed before initialization
   */
  log<K>(level: Key<K, LogBusEventMap>, ...args: any[]) {
    if ('undefined' === typeof this.#log) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#log(level, ...args)
  }

  /**
   * Executes the query.
   * @returns A promise that resolves when the query is executed
   * @throws {Error} If accessed before initialization
   */
  async execute() {
    if ('undefined' === typeof this.#execute) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return await this.#execute()
  }

  /**
   * Gets an array of query results.
   * @returns A promise that resolves to an array of model instances
   * @throws {Error} If accessed before initialization
   */
  async getReturnableArray(records: ReactiveModel<T, PK, R>[]) {
    if ('undefined' === typeof this.#getReturnableArray) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return await this.#getReturnableArray(records)
  }

  /**
   * Gets a single query result.
   * @returns A promise that resolves to a model instance
   * @throws {Error} If accessed before initialization
   */
  async getReturnable(record: ReactiveModel<T, PK, R>) {
    if ('undefined' === typeof this.#getReturnable) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return await this.#getReturnable(record)
  }
}
