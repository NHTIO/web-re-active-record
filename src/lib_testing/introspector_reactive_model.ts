import { ReactiveModelChangeEmitter } from '../lib/class_reactive_model_change_emitter'
import { ERROR_CANNOT_REINITIALIZE, ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION } from './common'
import type { EntityTable } from 'dexie'
import type { Encryption } from '@nhtio/web-encryption'
import type { LogBusEventMap } from '../lib/class_logger'
import type { PlainObject, StringKeyOf } from '../lib/types'
import type { TypedEventEmitter } from '@nhtio/tiny-typed-emitter'
import type { UnifiedEventBus } from '../lib/class_unified_event_bus'
import type {
  Relationship,
  RelationshipConfiguration,
} from '@nhtio/web-re-active-record/relationships'

/**
 * A testing utility class for introspecting and testing ReactiveModel instances.
 * This class is designed to help with testing by exposing internal state that would otherwise be inaccessible due to TypeScript's private field declarations.
 *
 * @typeParam T - The shape of the model's data as a plain object
 * @typeParam PK - The primary key field of the model, must be a string key of T
 * @typeParam R - Record of relationship configurations for the model
 */
export class ReactiveModelIntrospector<
  T extends PlainObject,
  PK extends StringKeyOf<T>,
  R extends Record<string, RelationshipConfiguration>,
> {
  #swarm?: () => UnifiedEventBus
  #encryption?: () => Encryption
  #logBus?: () => TypedEventEmitter<LogBusEventMap>
  #throwError?: () => (err: Error) => void
  #table?: () => EntityTable<T>
  #properties?: () => Readonly<Array<StringKeyOf<T>>>
  #primaryKey?: () => PK
  #modelName?: () => string
  #modelKey?: () => string
  #pending?: () => Map<StringKeyOf<T>, T[StringKeyOf<T>]>
  #state?: () => Map<StringKeyOf<T>, T[StringKeyOf<T>]>
  #emitter?: () => ReactiveModelChangeEmitter<T, PK, R>
  #relationships?: () => Record<string, Relationship>
  #deleted?: () => boolean
  #boundOnReactiveModelUpdatedInSwarm?: () =>
    | ((modelName: string, instanceKey: string, values: Record<StringKeyOf<T>, string>) => void)
    | undefined
  #boundOnReactiveModelDeletedInSwarm?: () =>
    | ((modelName: string, instanceKey: string) => void)
    | undefined
  #onReactiveModelUpdatedInSwarm?: (
    modelName: string,
    instanceKey: string,
    values: Record<StringKeyOf<T>, string>
  ) => void
  #onReactiveModelDeletedInSwarm?: (modelName: string, instanceKey: string) => void
  #getProperty?: <P extends StringKeyOf<T>>(prop: P) => T[P] | undefined
  #getRelatedProperty?: <P extends StringKeyOf<R>>(prop: P) => any | undefined
  #setProperty?: <P extends StringKeyOf<T>>(prop: P, value: T[P]) => void
  #doEmitChanges?: () => void

  /**
   * Initializes the introspector with all necessary dependencies and functions.
   * This method can only be called once. Subsequent calls will throw an error.
   *
   * @throws {Error} If attempting to reinitialize any property
   */
  $init(
    swarm: () => UnifiedEventBus,
    encryption: () => Encryption,
    logBus: () => TypedEventEmitter<LogBusEventMap>,
    throwError: () => (err: Error) => void,
    table: () => EntityTable<T>,
    properties: () => Readonly<Array<StringKeyOf<T>>>,
    primaryKey: () => PK,
    modelName: () => string,
    modelKey: () => string,
    pending: () => Map<StringKeyOf<T>, T[StringKeyOf<T>]>,
    state: () => Map<StringKeyOf<T>, T[StringKeyOf<T>]>,
    emitter: () => ReactiveModelChangeEmitter<T, PK, R>,
    relationships: () => Record<string, Relationship>,
    deleted: () => boolean,
    boundOnReactiveModelUpdatedInSwarm: () =>
      | ((modelName: string, instanceKey: string, values: Record<StringKeyOf<T>, string>) => void)
      | undefined,
    boundOnReactiveModelDeletedInSwarm: () =>
      | ((modelName: string, instanceKey: string) => void)
      | undefined,
    onReactiveModelUpdatedInSwarm: (
      modelName: string,
      instanceKey: string,
      values: Record<StringKeyOf<T>, string>
    ) => void,
    onReactiveModelDeletedInSwarm: (modelName: string, instanceKey: string) => void,
    getProperty: <P extends StringKeyOf<T>>(prop: P) => T[P] | undefined,
    getRelatedProperty: <P extends StringKeyOf<R>>(prop: P) => any | undefined,
    setProperty: <P extends StringKeyOf<T>>(prop: P, value: T[P]) => void,
    doEmitChanges: () => void
  ) {
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
    if ('undefined' !== typeof this.#throwError) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#throwError = throwError
    if ('undefined' !== typeof this.#table) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#table = table
    if ('undefined' !== typeof this.#properties) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#properties = properties
    if ('undefined' !== typeof this.#primaryKey) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#primaryKey = primaryKey
    if ('undefined' !== typeof this.#modelName) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#modelName = modelName
    if ('undefined' !== typeof this.#modelKey) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#modelKey = modelKey
    if ('undefined' !== typeof this.#pending) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#pending = pending
    if ('undefined' !== typeof this.#state) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#state = state
    if ('undefined' !== typeof this.#emitter) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#emitter = emitter
    if ('undefined' !== typeof this.#relationships) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#relationships = relationships
    if ('undefined' !== typeof this.#deleted) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#deleted = deleted
    if ('undefined' !== typeof this.#boundOnReactiveModelUpdatedInSwarm) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#boundOnReactiveModelUpdatedInSwarm = boundOnReactiveModelUpdatedInSwarm
    if ('undefined' !== typeof this.#boundOnReactiveModelDeletedInSwarm) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#boundOnReactiveModelDeletedInSwarm = boundOnReactiveModelDeletedInSwarm
    if ('undefined' !== typeof this.#onReactiveModelUpdatedInSwarm) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#onReactiveModelUpdatedInSwarm = onReactiveModelUpdatedInSwarm
    if ('undefined' !== typeof this.#onReactiveModelDeletedInSwarm) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#onReactiveModelDeletedInSwarm = onReactiveModelDeletedInSwarm
    if ('undefined' !== typeof this.#getProperty) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#getProperty = getProperty
    if ('undefined' !== typeof this.#getRelatedProperty) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#getRelatedProperty = getRelatedProperty
    if ('undefined' !== typeof this.#setProperty) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#setProperty = setProperty
    if ('undefined' !== typeof this.#doEmitChanges) {
      throw ERROR_CANNOT_REINITIALIZE
    }
    this.#doEmitChanges = doEmitChanges
  }

  /** Gets the Swarm instance used for reactive state synchronization
   * @throws {Error} If accessed before initialization
   */
  get swarm() {
    if ('undefined' === typeof this.#swarm) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#swarm()
  }

  /** Gets the Encryption instance used for data encryption
   * @throws {Error} If accessed before initialization
   */
  get encryption() {
    if ('undefined' === typeof this.#encryption) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#encryption()
  }

  /** Gets the LogBus event emitter instance
   * @throws {Error} If accessed before initialization
   */
  get logBus() {
    if ('undefined' === typeof this.#logBus) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#logBus()
  }

  /** Gets the error throwing function
   * @throws {Error} If accessed before initialization
   */
  get throwError() {
    if ('undefined' === typeof this.#throwError) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#throwError()
  }

  /** Gets the Dexie EntityTable instance
   * @throws {Error} If accessed before initialization
   */
  get table() {
    if ('undefined' === typeof this.#table) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#table()
  }

  /** Gets the array of model property names
   * @throws {Error} If accessed before initialization
   */
  get properties() {
    if ('undefined' === typeof this.#properties) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#properties()
  }

  /** Gets the primary key field name
   * @throws {Error} If accessed before initialization
   */
  get primaryKey() {
    if ('undefined' === typeof this.#primaryKey) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#primaryKey()
  }

  /** Gets the model's name
   * @throws {Error} If accessed before initialization
   */
  get modelName() {
    if ('undefined' === typeof this.#modelName) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#modelName()
  }

  /** Gets the model's unique key
   * @throws {Error} If accessed before initialization
   */
  get modelKey() {
    if ('undefined' === typeof this.#modelKey) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#modelKey()
  }

  /** Gets the map of pending changes
   * @throws {Error} If accessed before initialization
   */
  get pending() {
    if ('undefined' === typeof this.#pending) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#pending()
  }

  /** Gets the current state map
   * @throws {Error} If accessed before initialization
   */
  get state() {
    if ('undefined' === typeof this.#state) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#state()
  }

  /** Gets the ReactiveModelChangeEmitter instance
   * @throws {Error} If accessed before initialization
   */
  get emitter() {
    if ('undefined' === typeof this.#emitter) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#emitter()
  }

  /** Gets the model's relationships
   * @throws {Error} If accessed before initialization
   */
  get relationships() {
    if ('undefined' === typeof this.#relationships) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#relationships()
  }

  /** Gets the deleted status of the model
   * @throws {Error} If accessed before initialization
   */
  get deleted() {
    if ('undefined' === typeof this.#deleted) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#deleted()
  }

  /** Gets the bound handler for model updates in Swarm
   * @throws {Error} If accessed before initialization
   */
  get boundOnReactiveModelUpdatedInSwarm() {
    if ('undefined' === typeof this.#boundOnReactiveModelUpdatedInSwarm) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#boundOnReactiveModelUpdatedInSwarm()
  }

  /** Gets the bound handler for model deletions in Swarm
   * @throws {Error} If accessed before initialization
   */
  get boundOnReactiveModelDeletedInSwarm() {
    if ('undefined' === typeof this.#boundOnReactiveModelDeletedInSwarm) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#boundOnReactiveModelDeletedInSwarm()
  }

  /**
   * Handles model deletion events in Swarm
   * @param modelName - Name of the model being deleted
   * @param instanceKey - Unique key of the model instance
   * @throws {Error} If accessed before initialization
   */
  onReactiveModelDeletedInSwarm(modelName: string, instanceKey: string): void {
    if ('undefined' === typeof this.#onReactiveModelDeletedInSwarm) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#onReactiveModelDeletedInSwarm(modelName, instanceKey)
  }

  /**
   * Gets a property value from the model
   * @param prop - Name of the property to get
   * @returns The property value or undefined if not found
   * @throws {Error} If accessed before initialization
   */
  getProperty<P extends StringKeyOf<T>>(prop: P): T[P] | undefined {
    if ('undefined' === typeof this.#getProperty) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#getProperty(prop)
  }

  /**
   * Gets a related property value from the model's relationships
   * @param prop - Name of the related property to get
   * @returns The related property value or undefined if not found
   * @throws {Error} If accessed before initialization
   */
  getRelatedProperty<P extends StringKeyOf<R>>(prop: P): any | undefined {
    if ('undefined' === typeof this.#getRelatedProperty) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#getRelatedProperty(prop)
  }

  /**
   * Sets a property value on the model
   * @param prop - Name of the property to set
   * @param value - Value to set for the property
   * @throws {Error} If accessed before initialization
   */
  setProperty<P extends StringKeyOf<T>>(prop: P, value: T[P]): void {
    if ('undefined' === typeof this.#setProperty) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#setProperty(prop, value)
  }

  /**
   * Emits any pending changes to subscribers
   * @throws {Error} If accessed before initialization
   */
  doEmitChanges(): void {
    if ('undefined' === typeof this.#doEmitChanges) {
      throw ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION
    }
    return this.#doEmitChanges()
  }
}
