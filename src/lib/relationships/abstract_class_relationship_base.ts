import { makeReactiveModelName } from '../utils'
import { HasOne } from './class_relationship_has_one'
import { HasMany } from './class_relationship_has_many'
import { MorphTo } from './class_relationship_morph_to'
import { MorphOne } from './class_relationship_morph_one'
import { BelongsTo } from './class_relationship_belongs_to'
import { MorphMany } from './class_relationship_morph_many'
import { ManyToMany } from './class_relationship_many_to_many'
import { HasManyThrough } from './class_relationship_has_many_through'
import {
  MissingModelException,
  UnpreparedRelationshipException,
} from '@nhtio/web-re-active-record/errors'
import type { PlainObject, StringKeyOf } from '../types'
import type { UnifiedEventBus } from '../class_unified_event_bus'
import type { ReactiveDatabase } from '../class_reactive_database'
import type { HasOneConfiguration } from './class_relationship_has_one'
import type { HasManyConfiguration } from './class_relationship_has_many'
import type { MorphToConfiguration } from './class_relationship_morph_to'
import type { MorphOneConfiguration } from './class_relationship_morph_one'
import type { BelongsToConfiguration } from './class_relationship_belongs_to'
import type { MorphManyConfiguration } from './class_relationship_morph_many'
import type { ManyToManyConfiguration } from './class_relationship_many_to_many'
import type { ReactiveModelConstructor, ReactiveModel } from '../factory_reactive_model'
import type { ReactiveModelChangeEmitter } from '../class_reactive_model_change_emitter'
import type { HasManyThroughConfiguration } from './class_relationship_has_many_through'

/**
 * Describes a class which defines a relationship between models.
 */
export type Relationship =
  | BelongsTo<any, any, any, any, any>
  | HasMany<any, any, any, any, any>
  | HasManyThrough<any, any, any, any, any, any, any, any>
  | HasOne<any, any, any, any, any>
  | ManyToMany<any, any, any, any, any, any, any, any>
  | MorphTo<any, any, any, any, any, any>
  | MorphOne<any, any, any, any, any, any>
  | MorphMany<any, any, any, any, any, any>

/**
 * Describes the constructor for a class which defines a relationship between models.
 */
export type RelationshipCtor =
  | typeof BelongsTo<any, any, any, any, any>
  | typeof HasMany<any, any, any, any, any>
  | typeof HasManyThrough<any, any, any, any, any, any, any, any>
  | typeof HasOne<any, any, any, any, any>
  | typeof ManyToMany<any, any, any, any, any, any, any, any>
  | typeof MorphTo<any, any, any, any, any, any>
  | typeof MorphOne<any, any, any, any, any, any>
  | typeof MorphMany<any, any, any, any, any, any>

/**
 * Describes a class which defines a relationship between models which can be used in a chain.
 */
export type ChainableRelationship =
  | BelongsTo<any, any, any, any, any>
  | HasMany<any, any, any, any, any>
  | HasManyThrough<any, any, any, any, any, any, any, any>
  | HasOne<any, any, any, any, any>
  | ManyToMany<any, any, any, any, any, any, any, any>

/**
 * Describes the configuration tuples for the relationship classes.
 */
export type RelationshipConfiguration =
  | BelongsToConfiguration<any, any, any, any, any>
  | HasManyConfiguration<any, any, any, any, any>
  | HasManyThroughConfiguration<any, any, any, any, any, any, any, any>
  | HasOneConfiguration<any, any, any, any, any>
  | ManyToManyConfiguration<any, any, any, any, any, any, any, any>
  | MorphToConfiguration<any, any, any, any, any, any>
  | MorphOneConfiguration<any, any, any, any, any, any>
  | MorphManyConfiguration<any, any, any, any, any, any>

/**
 * Describes the configuration tuples for the relationship classes which can be used in a chain.
 */
export type ChainableRelationshipConfiguration =
  | BelongsToConfiguration<any, any, any, any, any>
  | HasManyConfiguration<any, any, any, any, any>
  | HasManyThroughConfiguration<any, any, any, any, any, any, any, any>
  | HasOneConfiguration<any, any, any, any, any>
  | ManyToManyConfiguration<any, any, any, any, any, any, any, any>

/**
 * The base class for all relationships
 * @typeParam R - type of value returned by the relationship
 * @typeParam OM - the map of all models in the database
 * @typeParam TM - the table of the originating model
 * @typeParam PKT - the property used as the primary key in the originating model
 * @typeParam FM - the table of the foreign model
 * @typeParam PKF - the property used as the primary key in the foreign model
 * @typeParam T - the type of the originating model
 * @typeParam F - the type of the foreign model
 *
 * @remarks Relationships are defined during runtime by adding them to the ReactiveDatabaseModelDefinition under the relationships property,
 * where the key is the name of the relationship, and the value is an instance of the relationship class which defines how the relationship works.
 * For example:
 *
 * ```typescript
 * {
 *   ...
 *      relationships: {
 *         user: [BelongsTo, 'users', 'user_id'], // [!code focus]
 *      }
 *   ...
 * }
 * ```
 */
export abstract class RelationshipBase<
  R,
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  FM extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FM]>,
  T extends PlainObject = OM[TM],
  F extends PlainObject = OM[FM],
> {
  readonly #key: string
  readonly #originatingModelTable: TM
  readonly #foreignModelTable: FM
  readonly #originatingModelPrimaryKey: PKT
  readonly #foreignModelPrimaryKey: PKF
  readonly #swarm: UnifiedEventBus
  #booted: boolean
  #database?: ReactiveDatabase<OM>
  #originatingModelCtor?: ReactiveModelConstructor<OM, T, Extract<keyof T, string>, any, any>
  #foreignModelCtor?: ReactiveModelConstructor<OM, F, Extract<keyof F, string>, any, any>
  #cached: boolean
  #value?: R | undefined

  /** @private */
  public get $key() {
    return this.#key
  }

  /** @private */
  public get $originatingModelTable() {
    return this.#originatingModelTable
  }

  /** @private */
  public get $foreignModelTable() {
    return this.#foreignModelTable
  }

  /** @private */
  public get $originatingModelPrimaryKey() {
    return this.#originatingModelPrimaryKey
  }

  /** @private */
  public get $foreignModelPrimaryKey() {
    return this.#foreignModelPrimaryKey
  }

  /** @private */
  public get $booted() {
    return this.#booted
  }

  /** @private */
  public get $database() {
    return this.#database
  }

  /** @private */
  public get $originatingModelCtor() {
    return this.#originatingModelCtor
  }

  /** @private */
  public get $foreignModelCtor() {
    return this.#foreignModelCtor
  }

  /** @private */
  public get $cached() {
    return this.#cached
  }

  /** @private */
  public get $value() {
    return this.#value
  }

  /** @private */
  public get $swarm() {
    return this.#swarm
  }

  /**
   * Creates a new relationship instance.
   * @param key The key of the relationship on the originating model
   * @param originatingModelTable The table of the originating model
   * @param originatingModelPrimaryKey The property used as the primary key in the originating model
   * @param foreignModelTable The table of the foreign model
   * @param foreignModelPrimaryKey The property used as the primary key in the foreign model
   * @param callback A callback function that is called with the relationship accessors
   * @param callback.originatingModelTable The accessor for the originating model table
   * @param callback.originatingModelPrimaryKey The accessor for the originating model primary key
   * @param callback.foreignModelTable The accessor for the foreign model table
   * @param callback.foreignModelPrimaryKey The accessor for the foreign model primary key
   * @param callback.originatingModelCtor The accessor for the originating model constructor
   * @param callback.foreignModelCtor The accessor for the foreign model constructor
   * @param callback.cached The accessor for the cached value
   * @param callback.setCached The setter for the cached value
   * @private
   */
  constructor(
    key: string,
    swarm: UnifiedEventBus,
    originatingModelTable: TM,
    originatingModelPrimaryKey: PKT,
    foreignModelTable: FM,
    foreignModelPrimaryKey: PKF
  ) {
    this.#key = key
    this.#swarm = swarm
    this.#originatingModelTable = originatingModelTable
    this.#foreignModelTable = foreignModelTable
    this.#originatingModelPrimaryKey = originatingModelPrimaryKey
    this.#foreignModelPrimaryKey = foreignModelPrimaryKey
    this.#booted = false
    this.#cached = false
  }

  /**
   * Boots the relationship by setting the database instance and the originating and foreign model constructors.
   * @param database The database instance to use for the relationship
   * @private
   */
  boot(database: ReactiveDatabase<OM>) {
    if (this.#booted) return
    this.#database = database
    this.#originatingModelCtor = this.#database.model(this.#originatingModelTable) as unknown as
      | ReactiveModelConstructor<OM, T, Extract<keyof T, string>, any, any>
      | undefined
    this.#foreignModelCtor = this.#database.model(this.#foreignModelTable) as unknown as
      | ReactiveModelConstructor<OM, F, Extract<keyof F, string>, any, any>
      | undefined
    if (!this.#originatingModelCtor) {
      throw new MissingModelException(
        makeReactiveModelName(this.#originatingModelTable),
        this.#originatingModelTable
      )
    }
    if (!this.#foreignModelCtor) {
      throw new MissingModelException(
        makeReactiveModelName(this.#foreignModelTable),
        this.#foreignModelTable
      )
    }
    this.#booted = true
  }

  /**
   * Indicates whether the relationship has been booted.
   * @private
   */
  get booted() {
    return this.#booted
  }

  /**
   * Indicates whether the relationship has been prepared.
   * @private
   */
  get prepared() {
    return this.#cached
  }

  /**
   * Get the curent value of the relationship.
   * @private
   */
  get value() {
    if (!this.#cached) {
      throw new UnpreparedRelationshipException(
        makeReactiveModelName(this.#originatingModelTable),
        makeReactiveModelName(this.#foreignModelTable)
      )
    }
    return this.#value
  }

  /**
   * Sets the value of the relationship.
   * @param value The value to set
   * @private
   */
  protected set value(value: R | undefined) {
    this.#value = value
    this.#cached = true
  }

  /**
   * Prepares the relationship for use with the specific source ReactiveModel.
   * @param host The originating model
   * @param emitter The change emitter for the originating model
   * @returns A promise that resolves to an array of foreign models or a single foreign model, or undefined if no models are found.
   *
   * @private
   * @privateRemarks You will need to call the `setCached` method from the callbacks within this method
   */
  abstract prepare(
    host: ReactiveModel<T, Extract<keyof T, string>, any>,
    emitter: ReactiveModelChangeEmitter<T, Extract<keyof T, string>, any>,
    onChangeDetected?: () => void
  ): Promise<R | undefined>

  /**
   * Prepares the relationship for being disposed.
   * @returns A promise that resolves when the relationship is unreferenced.
   * @private
   */
  abstract unref(): Promise<void>
}
