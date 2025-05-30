import { ReactiveQueryBuilder } from './class_reactive_query_builder'
import { makeModelConstraints } from '@nhtio/web-re-active-record/constraints'
import { canSerialize, serialize, deserialize } from '@nhtio/web-serialization'
import { ReactiveModelIntrospector } from '@nhtio/web-re-active-record/testing'
import { ReactiveModelChangeEmitter } from './class_reactive_model_change_emitter'
import { makeReactiveModelName, guessJoinTableName, guessForeignKeyName } from './utils'
import { ManyToMany, MorphMany, MorphOne, MorphTo } from '@nhtio/web-re-active-record/relationships'
import {
  ReactiveModelNoSuchPropertyException,
  ReactiveModelUnacceptableValueException,
  ReactiveModelCannotOverridePrimaryKeyException,
  MissingReactiveModelRecordError,
  ReactiveModelQueryException,
  NoReactiveModelRecordError,
  ReactiveModelDeletedException,
  ReactiveModelUnsubscribableException,
  RelationshipCannotOverridePropertyException,
  ShutdownDatabaseException,
  ReactiveModelUncreatableException,
  ReactiveModelFailedConstraintsException,
} from '@nhtio/web-re-active-record/errors'
import type { EntityTable } from 'dexie'
import type { LogBusEventMap } from './class_logger'
import type { WrapReactiveModelHook } from '../types'
import type { Encryption } from '@nhtio/web-encryption'
import type { Listener } from '@nhtio/tiny-typed-emitter'
import type { UnifiedEventBus } from './class_unified_event_bus'
import type { ReactiveDatabase } from './class_reactive_database'
import type { TypedEventEmitter } from '@nhtio/tiny-typed-emitter'
import type { ReactiveDatabaseOptions } from './class_reactive_database'
import type { ModelConstraints } from '@nhtio/web-re-active-record/constraints'
import type { ReactiveModelAgumentations } from '@nhtio/web-re-active-record/augmentable'
import type { ReactiveQueryBuilderIntrospector } from '@nhtio/web-re-active-record/testing'
import type { ReactiveModelChangeEmitterEventMap } from './class_reactive_model_change_emitter'
import type { PlainObject, DataValues, BaseObjectMap, StringKeyOf, RelatedValueMap } from './types'
import type {
  Relationship,
  RelationshipConfiguration,
  BelongsTo,
  HasMany,
  HasManyThrough,
  HasOne,
} from '@nhtio/web-re-active-record/relationships'

/**
 * The shape of the pending state changes for a model.
 */
export interface PendingStateChange<T extends PlainObject, K extends StringKeyOf<T>> {
  /**
   * The property that is being changed.
   */
  property: K
  /**
   * The value that is being changed to.
   */
  is: T[K]
  /**
   * The value that is being changed from.
   */
  was: T[K] | undefined
}

/**
 * The shape of the pending state changes for a model.
 * @typeParam T - The type of the object that will be used as the model.
 * @typeParam K - The key of the object which is used as the primary key for the model.
 */
export type PendingStateChanges<T extends PlainObject> = Partial<
  Record<StringKeyOf<T>, Omit<PendingStateChange<T, StringKeyOf<T>>, 'property'>>
>

/**
 * The abstract base class for all reactive models.
 * @typeParam T - The type of the object that will be used as the model.
 * @typeParam PK - The key of the object which is used as the primary key for the model.
 */
export abstract class BaseReactiveModel<
  T extends PlainObject,
  PK extends StringKeyOf<T>,
  R extends Record<string, RelationshipConfiguration>,
> {
  readonly #swarm: UnifiedEventBus
  readonly #encryption: Encryption
  readonly #logBus: TypedEventEmitter<LogBusEventMap>
  readonly #throwError: (err: Error) => void
  readonly #table: EntityTable<T>
  readonly #properties: Readonly<Array<StringKeyOf<T>>>
  readonly #primaryKey: PK
  readonly #modelName: string
  readonly #modelKey: string
  readonly #pending: Map<StringKeyOf<T>, T[StringKeyOf<T>]>
  readonly #state: Map<StringKeyOf<T>, T[StringKeyOf<T>]>
  readonly #emitter: ReactiveModelChangeEmitter<T, PK, R>
  readonly #relationships: Record<string, Relationship>
  readonly #constraints?: ModelConstraints<T>
  #deleted: boolean = false
  #boundOnReactiveModelUpdatedInSwarm?: (
    modelName: string,
    instanceKey: string,
    values: Record<StringKeyOf<T>, string>
  ) => void
  #boundOnReactiveModelDeletedInSwarm?: (modelName: string, instanceKey: string) => void

  /** @private */
  protected constructor(
    swarm: UnifiedEventBus,
    encryption: Encryption,
    logBus: TypedEventEmitter<LogBusEventMap>,
    throwError: (err: Error) => void,
    db: ReactiveDatabase<any>,
    table: EntityTable<T>,
    properties: Array<StringKeyOf<T>>,
    primaryKey: StringKeyOf<T>,
    modelName: string,
    modelKey: string,
    relationships: R,
    initial?: Partial<T>,
    introspector?: ReactiveModelIntrospector<T, PK, R>,
    constraints?: ModelConstraints<T>
  ) {
    for (const prop in relationships) {
      if (properties.includes(prop as StringKeyOf<T>)) {
        throw new RelationshipCannotOverridePropertyException(
          makeReactiveModelName(modelKey),
          String(prop)
        )
      }
    }
    this.#swarm = swarm
    this.#encryption = encryption
    this.#logBus = logBus
    this.#throwError = throwError
    this.#table = table
    this.#properties = properties
    this.#primaryKey = primaryKey as PK
    this.#modelName = modelName
    this.#modelKey = modelKey
    this.#pending = new Map()
    this.#state = new Map()
    this.#relationships = {}
    this.#emitter = new ReactiveModelChangeEmitter(
      this as unknown as ReactiveModel<T, PK, R>,
      logBus
    )
    this.#emitter.onError(this.#throwError, this)
    this.#constraints = constraints
    Object.freeze(this.#properties)
    Object.freeze(this.#primaryKey)
    Object.freeze(this.#modelName)
    Object.freeze(this.#modelKey)
    for (const prop of properties) {
      Object.defineProperty(this, prop, {
        get: () => this.#getProperty.call(this, prop),
        set: (value) => this.#setProperty.call(this, prop, value),
        enumerable: true,
        configurable: false,
      })
    }
    Object.defineProperty(this, 'fill', {
      value: (value: Partial<DataValues<T, PK>>) => {
        this.#fill.call(this, value)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'merge', {
      value: (value: Partial<DataValues<T, PK>>) => {
        this.#merge.call(this, value)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'save', {
      value: async () => {
        await this.#save.call(this)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'delete', {
      value: async () => {
        await this.#delete.call(this)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'reset', {
      value: () => {
        this.#reset.call(this)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'toObject', {
      value: () => this.#toObject.call(this),
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'toJSON', {
      value: () => this.#toJSON.call(this),
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'toString', {
      value: () => this.#toString.call(this),
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'related', {
      value: async <P extends StringKeyOf<R>>(relationship: P) => {
        return await this.#related.call(this, relationship)
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'load', {
      value: async (relationship: StringKeyOf<R>) => {
        return await this.#load.call(this, relationship)
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'loadMany', {
      value: async (keys: Array<StringKeyOf<R>>) => {
        return await this.#loadMany.call(this, keys)
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'onChange', {
      value: (listener: Listener<'change', ReactiveModelChangeEmitterEventMap<T>>, ctx?: any) => {
        this.#onChange.call(this, listener, ctx)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'onDelta', {
      value: (listener: Listener<'delta', ReactiveModelChangeEmitterEventMap<T>>, ctx?: any) => {
        this.#onDelta.call(this, listener, ctx)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'onPropertyChange', {
      value: (
        key: StringKeyOf<T> | StringKeyOf<R> | `${StringKeyOf<R>}.${number}`,
        listener: Listener<`change:${string}`, ReactiveModelChangeEmitterEventMap<T>>,
        ctx?: any
      ) => {
        this.#onPropertyChange.call(this, key, listener, ctx)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'onceChange', {
      value: (listener: Listener<'change', ReactiveModelChangeEmitterEventMap<T>>, ctx?: any) => {
        this.#onceChange.call(this, listener, ctx)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'onceDelta', {
      value: (listener: Listener<'delta', ReactiveModelChangeEmitterEventMap<T>>, ctx?: any) => {
        this.#onceDelta.call(this, listener, ctx)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'oncePropertyChange', {
      value: (
        key: StringKeyOf<T> | StringKeyOf<R> | `${StringKeyOf<R>}.${number}`,
        listener: Listener<`change:${string}`, ReactiveModelChangeEmitterEventMap<T>>,
        ctx?: any
      ) => {
        this.#oncePropertyChange.call(this, key, listener, ctx)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'offChange', {
      value: (listener?: Listener<'change', ReactiveModelChangeEmitterEventMap<T>>) => {
        this.#offChange.call(this, listener)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'offDelta', {
      value: (listener?: Listener<'delta', ReactiveModelChangeEmitterEventMap<T>>) => {
        this.#offDelta.call(this, listener)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'offPropertyChange', {
      value: (
        key: StringKeyOf<T> | StringKeyOf<R> | `${StringKeyOf<R>}.${number}`,
        listener?: Listener<`change:${string}`, ReactiveModelChangeEmitterEventMap<T>>
      ) => {
        this.#offPropertyChange.call(this, key, listener)
        return this
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    Object.defineProperty(this, 'unref', {
      value: async () => {
        await this.#unref.call(this)
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
    if (initial) {
      for (const prop in initial) {
        if (this.#properties.includes(prop as StringKeyOf<T>)) {
          const value = initial[prop as StringKeyOf<T>]
          if ('undefined' !== typeof value) {
            try {
              this.#setProperty(prop as StringKeyOf<T>, value)
            } catch (e) {
              this.#logBus.emit('error', `Error setting property ${prop}`, e)
              if (e instanceof Error) {
                this.#throwError(e)
              }
            }
          }
        }
      }
    }
    for (const prop in relationships) {
      const tuple = relationships[prop]
      if (tuple[0] === ManyToMany) {
        const [
          ctor,
          foreignTable,
          potentialJoinTable,
          potentialJoinTableForeignKeyForOriginating,
          potentialJoinTableForeignKeyForTarget,
          potentialPrimaryKeyForTarget,
          potentialPimaryKeyForOriginating,
        ] = tuple as [
          typeof ManyToMany<any, any, PK, any, any, any, any, any>,
          any,
          any,
          any,
          any,
          any,
          any,
        ]
        const pk: any = potentialPrimaryKeyForTarget || 'id'
        const fk: any = potentialPimaryKeyForOriginating || 'id'
        const jt: any = potentialJoinTable || guessJoinTableName(this.#modelKey, foreignTable)
        const jtfko =
          potentialJoinTableForeignKeyForOriginating || guessForeignKeyName(this.#modelKey, pk)
        const jtfkf = potentialJoinTableForeignKeyForTarget || guessForeignKeyName(foreignTable, fk)
        const relationship = new ctor(
          prop,
          this.#swarm,
          this.#modelKey,
          pk,
          jt,
          jtfko,
          jtfkf,
          foreignTable,
          fk
        )
        relationship.boot(db)
        // relationship.prepare(this, this.#emitter)
        this.#relationships[prop] = relationship
      } else if ([MorphTo, MorphMany, MorphOne].includes(tuple[0] as any)) {
        const [ctor, foreignTableLookupKey, foreignKeyLookupKey] = tuple as [
          (
            | typeof MorphTo<any, any, any, any, any, any>
            | typeof MorphMany<any, any, any, any, any, any>
            | typeof MorphOne<any, any, any, any, any, any>
          ),
          any,
          any,
          any,
        ]
        const relationship = new ctor(
          prop,
          this.#swarm,
          this.#modelKey,
          this.#primaryKey,
          foreignTableLookupKey,
          foreignKeyLookupKey
        )
        relationship.boot(db)
        // relationship.prepare(this, this.#emitter)
        this.#relationships[prop] = relationship
      } else {
        const [ctor, foreignTable, lookup, ppk, pfk] = tuple as [
          (
            | typeof BelongsTo<any, any, any, any, any>
            | typeof HasMany<any, any, any, any, any>
            | typeof HasManyThrough<any, any, any, any, any, any, any, any>
            | typeof HasOne<any, any, any, any, any>
          ),
          any,
          any,
          any,
          any,
        ]
        const pk: any = ppk || 'id'
        const fk: any = pfk || 'id'
        const relationship = new ctor(
          prop,
          this.#swarm,
          this.#modelKey,
          pk,
          foreignTable,
          fk,
          lookup as any
        )
        relationship.boot(db)
        // relationship.prepare(this, this.#emitter)
        this.#relationships[prop] = relationship
      }
      Object.defineProperty(this, prop, {
        get: () => this.#getRelatedProperty.call(this, prop),
        enumerable: true,
        configurable: false,
      })
    }
    this.#boundOnReactiveModelUpdatedInSwarm = this.#onReactiveModelUpdatedInSwarm.bind(this)
    this.#boundOnReactiveModelDeletedInSwarm = this.#onReactiveModelDeletedInSwarm.bind(this)
    this.#swarm.on('reactivemodel:saved', this.#boundOnReactiveModelUpdatedInSwarm)
    this.#swarm.on('reactivemodel:deleted', this.#boundOnReactiveModelDeletedInSwarm)
    this.#swarm.on('reactivemodel:truncated', this.#boundOnReactiveModelDeletedInSwarm)
    if (introspector instanceof ReactiveModelIntrospector) {
      introspector.$init(
        () => this.#swarm,
        () => this.#encryption,
        () => this.#logBus,
        () => this.#throwError,
        () => this.#table,
        () => this.#properties,
        () => this.#primaryKey,
        () => this.#modelName,
        () => this.#modelKey,
        () => this.#pending,
        () => this.#state,
        () => this.#emitter,
        () => this.#relationships,
        () => this.#deleted,
        () => this.#boundOnReactiveModelUpdatedInSwarm,
        () => this.#boundOnReactiveModelDeletedInSwarm,
        this.#onReactiveModelUpdatedInSwarm.bind(this),
        this.#onReactiveModelDeletedInSwarm.bind(this),
        this.#getProperty.bind(this),
        this.#getRelatedProperty.bind(this),
        this.#setProperty.bind(this),
        this.#doEmitChanges.bind(this)
      )
    }
  }

  /**
   * A boolean indicating whether the model has been deleted.
   * @category Properties
   */
  get $deleted() {
    return this.#deleted
  }

  #onReactiveModelUpdatedInSwarm(
    modelName: string,
    instanceKey: string,
    values: Record<StringKeyOf<T>, string>
  ) {
    if (this.#modelName !== modelName) return
    if (String(this.#state.get(this.#primaryKey)) !== instanceKey) return
    this.#logBus.emit(
      'debug',
      `Got update for ${this.#modelName} ${instanceKey} from swarm`,
      values
    )
    for (const prop in values) {
      if (this.#properties.includes(prop as StringKeyOf<T>)) {
        const value = this.#encryption.decrypt(values[prop as StringKeyOf<T>]) as T[StringKeyOf<T>]
        if ('undefined' !== typeof value) {
          this.#state.set(prop as StringKeyOf<T>, value as T[StringKeyOf<T>])
          this.#pending.delete(prop as StringKeyOf<T>)
        }
      }
    }
    this.#doEmitChanges()
  }

  #onReactiveModelDeletedInSwarm(modelName: string, instanceKey?: string) {
    if (this.#modelName !== modelName) return
    if (
      'string' === typeof instanceKey &&
      String(this.#state.get(this.#primaryKey)) !== instanceKey
    )
      return
    this.#logBus.emit('debug', `Got delete for ${this.#modelName} ${instanceKey} from swarm`)
    this.#deleted = true
    this.#emitter.clear()
  }

  #getProperty<P extends StringKeyOf<T>>(prop: P): T[P] | undefined {
    if (!this.#properties.includes(prop)) {
      throw new ReactiveModelNoSuchPropertyException(prop, this.#modelName)
    }
    const usable = this.#pending.get(prop) ?? this.#state.get(prop)
    return usable as T[P] | undefined
  }

  #getRelatedProperty<P extends StringKeyOf<R>>(prop: P) {
    if (!this.#relationships[prop]) {
      throw new ReactiveModelNoSuchPropertyException(prop, this.#modelName)
    }
    if (!this.#relationships[prop].prepared) {
      return undefined
    }
    return this.#relationships[prop].value
  }

  #setProperty<P extends StringKeyOf<T>>(prop: P, value: T[P]): void {
    if (this.$deleted) {
      throw new ReactiveModelDeletedException()
    }
    if (!this.#properties.includes(prop)) {
      throw new ReactiveModelNoSuchPropertyException(prop, this.#modelName)
    }
    if (!canSerialize(value)) {
      throw new ReactiveModelUnacceptableValueException(prop, value)
    }
    // @ts-ignore
    if (this.#primaryKey === prop) {
      const existing = this.#state.get(this.#primaryKey)
      if (existing && existing !== value) {
        throw new ReactiveModelCannotOverridePrimaryKeyException(this.#primaryKey, this.#modelName)
      }
    }
    const currentPrimaryKey = this.#state.get(this.#primaryKey)
    if ('undefined' === typeof currentPrimaryKey) {
      this.#state.set(prop, value)
      this.#pending.set(prop, value)
    } else {
      this.#pending.set(prop, value)
    }
  }

  #doEmitChanges() {
    const asObject: Partial<T> = {}
    for (const key of this.#properties) {
      const value = this.#getProperty(key)
      if ('undefined' !== typeof value) {
        asObject[key] = value
      }
    }
    this.#emitter.next(asObject as T)
    this.#emitter.flush() // Ensure events are emitted after next()
  }

  #doConstraintValidation() {
    if (!this.#constraints) return
    let constraints = this.#constraints
    const toValidate: any = {}
    if (!this.$key) {
      const propertiesToValidate = this.#properties.filter((prop) => prop !== this.#primaryKey)
      const extracted: any = {}
      propertiesToValidate.forEach((prop) => {
        extracted[prop] = constraints.extract(prop)
      })
      constraints = makeModelConstraints(extracted as any)
      for (const prop of propertiesToValidate) {
        let value = this.#pending.get(prop)
        if ('undefined' === typeof value) {
          value = this.#state.get(prop)
        }
        if ('undefined' !== typeof value) {
          toValidate[prop] = value
        }
      }
    } else {
      for (const prop of this.#properties) {
        let value = this.#pending.get(prop)
        if ('undefined' === typeof value) {
          value = this.#state.get(prop)
        }
        if ('undefined' !== typeof value) {
          toValidate[prop] = value
        }
      }
    }
    const { error } = constraints.validate(toValidate, {
      abortEarly: false,
    })
    if (error) {
      throw new ReactiveModelFailedConstraintsException(error)
    }
  }

  /**
   * The value of the primary key for the instance of the model.
   * @category Properties
   */
  get $key(): PK {
    return this.#getProperty(this.#primaryKey) as PK
  }

  /**
   * An object containing all of the pending changes to be made to the model
   * @category Properties
   */
  get $pending(): PendingStateChanges<T> {
    const ret: PendingStateChanges<T> = {}
    this.#pending.forEach((value, key) => {
      const current = this.#state.get(key)
      if (current !== value || !this.$key) {
        ret[key as StringKeyOf<T>] = {
          is: value,
          was: !this.$key ? undefined : current,
        }
      }
    })
    Object.freeze(ret)
    return ret
  }

  /**
   * A boolean indicating whether the model has any pending changes.
   * @category Properties
   */
  get $dirty(): boolean {
    return Object.keys(this.$pending).length > 0
  }

  /**
   * Fills missing / undefined properties of the model with the values from the object.
   * @param value - The object containing the values to fill the model with.
   * @returns The instance of the model.
   * @category Methods
   */
  #fill(value: Partial<DataValues<T, PK>>): this {
    if (this.$deleted) {
      throw new ReactiveModelDeletedException()
    }
    for (const key of this.#properties) {
      if (key in value) {
        const val = value[key as unknown as keyof typeof value]
        const current = this.#getProperty(key)
        if ('undefined' !== typeof val && 'undefined' === typeof current) {
          try {
            // @ts-ignore
            this.#setProperty(key, val)
          } catch (e) {
            if (e instanceof Error) {
              this.#throwError(e)
            }
          }
        }
      }
    }
    return this
  }

  /**
   * Merges the properties of the object into the model.
   * @param value - The object containing the values to merge into the model.
   * @returns The instance of the model.
   * @category Methods
   */
  #merge(value: Partial<DataValues<T, PK>>): this {
    if (this.$deleted) {
      throw new ReactiveModelDeletedException()
    }
    for (const key of this.#properties) {
      if (key in value) {
        const val = value[key as unknown as keyof typeof value]
        if ('undefined' !== typeof val) {
          try {
            // @ts-ignore
            this.#setProperty(key, val)
          } catch (e) {
            if (e instanceof Error) {
              this.#throwError(e)
            }
          }
        }
      }
    }
    return this
  }

  /**
   * Saves the pending changes for the instance of the model to the database and propagates the changes to the rest of the swarm.
   * @returns The instance of the model.
   * @category Methods
   */
  async #save(): Promise<this> {
    if (this.$deleted) {
      throw new ReactiveModelDeletedException()
    }
    this.#doConstraintValidation()
    const toUpdate: any = {}
    this.#properties.forEach((prop) => {
      if ('undefined' !== typeof this.$key || prop !== this.#primaryKey) {
        let value = this.#pending.get(prop)
        if ('undefined' === typeof value) {
          value = this.#state.get(prop)
        }
        if ('undefined' !== typeof value) {
          toUpdate[prop] = value
        }
      }
    })
    // If we are saving for the first time, we need to ensure that all of the properties exist on the object, otherwise we need to throw an error
    if (!this.$key) {
      const missing: Array<StringKeyOf<T>> = []
      for (const key of this.#properties) {
        // check for missing required properties
        if (!(key in toUpdate) && key !== this.#primaryKey) {
          // if we have constraints, we need to check if the property is required
          if (this.#constraints) {
            const constraint = this.#constraints.extract(key)
            if (!constraint) {
              missing.push(key)
              continue
            }
            const { error } = constraint.validate(undefined)
            if (error) {
              missing.push(key)
            }
          } else {
            missing.push(key)
          }
        }
      }
      if (missing.length > 0) {
        throw new ReactiveModelUncreatableException(missing as string[])
      }
    }
    let res: T
    let pk: T[PK] | undefined
    try {
      if (!this.$key) {
        this.#logBus.emit('debug', `Creating ${this.#modelName}`, toUpdate)
        pk = await this.#table.add(toUpdate as any)
        this.#logBus.emit('debug', `Got primary key ${pk}`)
        res = (await this.#table.get(pk as any)) as any
        this.#logBus.emit('debug', `Created ${this.#modelName} ${pk}`, toUpdate)
      } else {
        res = await this.#table.put(toUpdate as any, this.$key as any)
        this.#logBus.emit('debug', `Updated ${this.#modelName} ${this.$key}`, toUpdate)
      }
    } catch (e) {
      this.#logBus.emit('error', `Error saving ${this.#modelName}`, e)
      if (e instanceof Error) {
        this.#throwError(e)
      }
      throw new ReactiveModelQueryException(e)
    }
    if (res && !this.$key) {
      this.#state.set(this.#primaryKey, res[this.#primaryKey])
    }
    this.#pending.forEach((value, key) => {
      this.#state.set(key, value)
      this.#pending.delete(key)
    })
    const withEncryptedValues: Record<StringKeyOf<T>, string> = {} as Record<StringKeyOf<T>, string>
    for (const key of this.#properties) {
      const value = this.#getProperty(key)
      if ('undefined' !== typeof value) {
        withEncryptedValues[key] = this.#encryption.encrypt(value)
      }
    }
    this.#swarm.emit('reactivemodel:saved', this.#modelName, String(this.$key), withEncryptedValues)
    this.#doEmitChanges()
    return this
  }

  /**
   * Deletes the instance of the model from the database and propagates the changes to the rest of the swarm.
   * @returns The instance of the model.
   *
   * @warning While the model is deleted from the database, its in-memory reference still remains in its last state before being deleted in a read-only state.
   * @category Methods
   */
  async #delete(): Promise<this> {
    if (!this.$key) {
      return this
    }
    if (this.$deleted) {
      return this
    }
    await this.#table.delete(this.$key as any)
    this.#deleted = true
    this.#swarm.emit('reactivemodel:deleted', this.#modelName, String(this.$key))
    this.#doEmitChanges()
    this.#emitter.clear()
    return this
  }

  /**
   * Resets the pending changes for the instance of the model.
   * @category Methods
   */
  #reset() {
    if (this.$deleted) {
      throw new ReactiveModelDeletedException()
    }
    this.#pending.clear()
  }

  /**
   * Returns the object representation of the model.
   * @returns The object representation of the model.
   * @category Methods
   */
  #toObject(): T & Partial<Record<StringKeyOf<R>, any>> {
    const obj: any = {}
    for (const key of this.#properties) {
      const value = this.#getProperty(key)
      if ('undefined' !== typeof value) {
        obj[key] = value
      }
    }
    for (const key in this.#relationships) {
      if (this.#relationships[key].prepared) {
        obj[key] = this.#relationships[key].value
        if ('undefined' !== typeof obj[key]) {
          if (Array.isArray(obj[key])) {
            obj[key] = obj[key].map((related) => related.toObject())
          } else {
            obj[key] = obj[key].toObject()
          }
        }
      }
    }
    return obj as T & Partial<Record<StringKeyOf<R>, any>>
  }

  /**
   * Returns the object representation of the model.
   * @returns The object representation of the model.
   * @category Methods
   */
  #toJSON(): T {
    return this.#toObject()
  }

  /**
   * Returns the stringified representation of the model.
   * @returns The stringified representation of the model.
   * @category Methods
   */
  #toString(): string {
    return [this.#modelName, this.#encryption.encrypt(this.#toObject())].join(' ')
  }

  /**
   * Retrieve the value of a specific relationship.
   * @param relationship The name of the relationship to get
   * @returns The value of the relationship
   * @category Methods
   */
  async #related<P extends StringKeyOf<R>>(relationship: P): Promise<RelatedValueMap<R>[P]> {
    if (this.$deleted) {
      throw new ReactiveModelDeletedException()
    }
    if (!this.#relationships[relationship]) {
      throw new ReactiveModelNoSuchPropertyException(relationship, this.#modelName)
    }
    const rel = this.#relationships[relationship]
    if (!rel.prepared) {
      await rel.prepare(this as unknown as ReactiveModel<T, PK, R>, this.#emitter)
    }
    return rel.value as RelatedValueMap<R>[P]
  }

  /**
   * Lazy-load a specific relationship.
   * @param relationship The name of the relationship to load
   * @returns A promise that resolves when the relationship is loaded
   * @category Methods
   */
  async #load(relationship: StringKeyOf<R>) {
    if (this.$deleted) {
      throw new ReactiveModelDeletedException()
    }
    if (!this.#relationships[relationship]) {
      throw new ReactiveModelNoSuchPropertyException(relationship, this.#modelName)
    }
    const rel = this.#relationships[relationship]
    if (!rel.prepared) {
      await rel.prepare(this as unknown as ReactiveModel<T, PK, R>, this.#emitter)
    }
  }

  /**
   * Lazy-load many relationships.
   * @param relationships The names of the relationships to load
   * @returns A promise that resolves when all relationships are loaded
   * @category Methods
   */
  async #loadMany(relationships: Array<StringKeyOf<R>>) {
    if (this.$deleted) {
      throw new ReactiveModelDeletedException()
    }
    await Promise.all(relationships.map((relationship) => this.#load(relationship)))
  }

  /**
   * Subscribe a listener to events emitted when any of the properties of the model change.
   * @param listener The callback to be called when the model's properties are changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  #onChange(listener: Listener<'change', ReactiveModelChangeEmitterEventMap<T>>, ctx?: any): this {
    if (this.$deleted) {
      throw new ReactiveModelUnsubscribableException()
    }
    this.#emitter.onChange(listener, ctx)
    return this
  }

  /**
   * Subscribe a listener to events emitting the delta of the model when any of the properties change.
   * @param listener The callback to be called when the model's properties are changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  #onDelta(listener: Listener<'delta', ReactiveModelChangeEmitterEventMap<T>>, ctx?: any): this {
    if (this.$deleted) {
      throw new ReactiveModelUnsubscribableException()
    }
    this.#emitter.onDelta(listener, ctx)
    return this
  }

  /**
   * Subscribe a listener to events emitted when a specific property of the model changes.
   * @param key The property of the model to listen to
   * @param listener The callback to be called when the model's property is changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  #onPropertyChange(
    key: StringKeyOf<T> | StringKeyOf<R> | `${StringKeyOf<R>}.${number}`,
    listener: Listener<`change:${string}`, ReactiveModelChangeEmitterEventMap<T>>,
    ctx?: any
  ): this {
    if (this.$deleted) {
      throw new ReactiveModelUnsubscribableException()
    }
    this.#emitter.onPropertyChange(key as any, listener, ctx)
    return this
  }

  /**
   * Subscribe a listener once to events emitted when any of the properties of the model change.
   * @param listener The callback to be called when the model's properties are changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  #onceChange(
    listener: Listener<'change', ReactiveModelChangeEmitterEventMap<T>>,
    ctx?: any
  ): this {
    if (this.$deleted) {
      throw new ReactiveModelUnsubscribableException()
    }
    this.#emitter.onceChange(listener, ctx)
    return this
  }

  /**
   * Subscribe a listener once to events emitting the delta of the model when any of the properties change.
   * @param listener The callback to be called when the model's properties are changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  #onceDelta(listener: Listener<'delta', ReactiveModelChangeEmitterEventMap<T>>, ctx?: any): this {
    if (this.$deleted) {
      throw new ReactiveModelUnsubscribableException()
    }
    this.#emitter.onceDelta(listener, ctx)
    return this
  }

  /**
   * Subscribe a listener once to events emitted when a specific property of the model changes.
   * @param key The property of the model to listen to
   * @param listener The callback to be called when the model's property is changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  #oncePropertyChange(
    key: StringKeyOf<T> | StringKeyOf<R> | `${StringKeyOf<R>}.${number}`,
    listener: Listener<`change:${string}`, ReactiveModelChangeEmitterEventMap<T>>,
    ctx?: any
  ): this {
    if (this.$deleted) {
      throw new ReactiveModelUnsubscribableException()
    }
    this.#emitter.oncePropertyChange(key as any, listener, ctx)
    return this
  }

  /**
   * Unsubscribe a listener or all listeners from events emitted when any of the properties of the model change.
   * @param listener The callback to be called when the model's properties are changed
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  #offChange(listener?: Listener<'change', ReactiveModelChangeEmitterEventMap<T>>): this {
    this.#emitter.offChange(listener)
    return this
  }

  /**
   * Unsubscribe a listener or all listeners from events emitted when the delta of the model changes.
   * @param listener The callback to be called when the model's properties are changed
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  #offDelta(listener?: Listener<'delta', ReactiveModelChangeEmitterEventMap<T>>): this {
    this.#emitter.offDelta(listener)
    return this
  }

  /**
   * Unsubscribe a listener or all listeners from events emitted when a specific property of the model changes.
   * @param key The property of the model to listen to
   * @param listener The callback to be called when the model's property is changed
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  #offPropertyChange(
    key: StringKeyOf<T> | StringKeyOf<R> | `${StringKeyOf<R>}.${number}`,
    listener?: Listener<`change:${string}`, ReactiveModelChangeEmitterEventMap<T>>
  ): this {
    this.#emitter.offPropertyChange(key as any, listener)
    return this
  }

  /**
   * Cleanup the instance of the model in preparation for garbage collection.
   * @category Methods
   */
  async #unref() {
    // Set the status to deleted so that we don't have any changes while we are cleaning up
    this.#deleted = true
    // Clear the pending changes
    this.#pending.clear()
    // disable reactive events
    this.#emitter.clear()
    // cleanup swarm listeners
    if (this.#boundOnReactiveModelUpdatedInSwarm) {
      this.#swarm.off('reactivemodel:saved', this.#boundOnReactiveModelUpdatedInSwarm)
    }
    if (this.#boundOnReactiveModelDeletedInSwarm) {
      this.#swarm.off('reactivemodel:deleted', this.#boundOnReactiveModelDeletedInSwarm)
      this.#swarm.off('reactivemodel:truncated', this.#boundOnReactiveModelDeletedInSwarm)
    }
    // cleanup relationships
    for (const key in this.#relationships) {
      const rel = this.#relationships[key]
      await rel.unref()
      // unreference the relationship so that it can be garbage collected
      delete this.#relationships[key]
    }
  }

  protected markDeletedForTruncate() {
    this.#deleted = true
    this.#pending.clear()
    this.#emitter.clear()
  }
}

export interface AdditionalReactiveModelModelMethods<
  T extends PlainObject,
  PK extends StringKeyOf<T>,
  R extends Record<string, RelationshipConfiguration>,
> {
  /**
   * Fills missing / undefined properties of the model with the values from the object.
   * @param value - The object containing the values to fill the model with.
   * @returns The instance of the model.
   * @category Methods
   */
  fill(value: Partial<DataValues<T, PK>>): this

  /**
   * Merges the properties of the object into the model.
   * @param value - The object containing the values to merge into the model.
   * @returns The instance of the model.
   * @category Methods
   */
  merge(value: Partial<DataValues<T, PK>>): this

  /**
   * Saves the pending changes for the instance of the model to the database and propagates the changes to the rest of the swarm.
   * @returns The instance of the model.
   * @category Methods
   */
  save(): Promise<this>

  /**
   * Deletes the instance of the model from the database and propagates the changes to the rest of the swarm.
   * @returns The instance of the model.
   * @category Methods
   */
  delete(): Promise<this>

  /**
   * Resets the pending changes for the instance of the model.
   * @category Methods
   */
  reset(): void

  /**
   * Returns the object representation of the model.
   * @returns The object representation of the model.
   * @category Methods
   */
  toObject(): T & Partial<Record<StringKeyOf<R>, any>>

  /**
   * Returns the object representation of the model.
   * @returns The object representation of the model.
   * @category Methods
   */
  toJSON(): T

  /**
   * Returns the stringified representation of the model.
   * @returns The stringified representation of the model.
   * @category Methods
   */
  toString(): string

  /**
   * Retrieve the value of a specific relationship.
   * @param relationship The name of the relationship to get
   * @returns The value of the relationship
   * @category Methods
   */
  related<P extends StringKeyOf<R>>(relationship: P): Promise<RelatedValueMap<R>[P]>

  /**
   * Lazy-load a specific relationship.
   * @param relationship The name of the relationship to load
   * @returns A promise that resolves when the relationship is loaded
   * @category Methods
   */
  load(relationship: StringKeyOf<R>): Promise<void>

  /**
   * Lazy-load many relationships.
   * @param relationships The names of the relationships to load
   * @returns A promise that resolves when all relationships are loaded
   * @category Methods
   */
  loadMany(relationships: Array<StringKeyOf<R>>): Promise<void>

  /**
   * Subscribe a listener to events emitted when any of the properties of the model change.
   * @param listener The callback to be called when the model's properties are changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  onChange(listener: Listener<'change', ReactiveModelChangeEmitterEventMap<T>>, ctx?: any): this

  /**
   * Subscribe a listener to events emitting the delta of the model when any of the properties change.
   * @param listener The callback to be called when the model's properties are changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  onDelta(listener: Listener<'delta', ReactiveModelChangeEmitterEventMap<T>>, ctx?: any): this

  /**
   * Subscribe a listener to events emitted when a specific property of the model changes.
   * @param key The property of the model to listen to
   * @param listener The callback to be called when the model's property is changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  onPropertyChange(
    key: StringKeyOf<T> | StringKeyOf<R> | `${StringKeyOf<R>}.${number}`,
    listener: Listener<`change:${string}`, ReactiveModelChangeEmitterEventMap<T>>,
    ctx?: any
  ): this

  /**
   * Subscribe a listener once to events emitted when any of the properties of the model change.
   * @param listener The callback to be called when the model's properties are changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  onceChange(listener: Listener<'change', ReactiveModelChangeEmitterEventMap<T>>, ctx?: any): this

  /**
   * Subscribe a listener once to events emitting the delta of the model when any of the properties change.
   * @param listener The callback to be called when the model's properties are changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  onceDelta(listener: Listener<'delta', ReactiveModelChangeEmitterEventMap<T>>, ctx?: any): this

  /**
   * Subscribe a listener once to events emitted when a specific property of the model changes.
   * @param key The property of the model to listen to
   * @param listener The callback to be called when the model's property is changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  oncePropertyChange(
    key: StringKeyOf<T> | StringKeyOf<R> | `${StringKeyOf<R>}.${number}`,
    listener: Listener<`change:${string}`, ReactiveModelChangeEmitterEventMap<T>>,
    ctx?: any
  ): this

  /**
   * Unsubscribe a listener or all listeners from events emitted when any of the properties of the model change.
   * @param listener The callback to be called when the model's properties are changed
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  offChange(listener?: Listener<'change', ReactiveModelChangeEmitterEventMap<T>>): this

  /**
   * Unsubscribe a listener or all listeners from events emitted when the delta of the model changes.
   * @param listener The callback to be called when the model's properties are changed
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  offDelta(listener?: Listener<'delta', ReactiveModelChangeEmitterEventMap<T>>): this

  /**
   * Unsubscribe a listener or all listeners from events emitted when a specific property of the model changes.
   * @param key The property of the model to listen to
   * @param listener The callback to be called when the model's property is changed
   * @returns The current ReactiveModel instance
   * @category Methods
   */
  offPropertyChange(
    key: StringKeyOf<T> | StringKeyOf<R> | `${StringKeyOf<R>}.${number}`,
    listener?: Listener<`change:${string}`, ReactiveModelChangeEmitterEventMap<T>>
  ): this

  /**
   * Cleanup the instance of the model in preparation for garbage collection.
   * @category Methods
   */
  unref(): Promise<void>

  /**
   * Creates a new instance of the model with the same properties as the current instance.
   * @returns A new instance of the model with the same properties as the current instance.
   * @category Methods
   */
  clone: () => ReactiveModel<T, PK, R>
}

/**
 * Utility type to extract the correct ReactiveModelConstructor for a specified key from ReactiveDatabaseOptions.
 * @typeParam ObjectMap - The object map of all models.
 * @typeParam Options - The ReactiveDatabaseOptions type.
 * @typeParam K - The key of the model to extract the constructor for.
 *
 * @example
 * ```typescript
 * type User = { id: number; name: string }
 * type Profile = { id: number; userId: number; bio?: string }
 *
 * type ObjectMap = {
 *   user: User
 *   profile: Profile
 * }
 *
 * const options: ReactiveDatabaseOptions<ObjectMap> = {
 *   ...
 *   models: {
 *     user: {
 *       schema: '++id,name',
 *       properties: ['id', 'name'],
 *       primaryKey: 'id',
 *       relationships: {
 *         profile: [HasOne, 'profile', 'userId'],
 *       },
 *     },
 *     profile: {
 *       schema: '++id,userId',
 *       properties: ['id', 'userId', 'bio'],
 *       primaryKey: 'id',
 *       relationships: {
 *         user: [BelongsTo, 'user', 'userId'],
 *       },
 *     },
 *   },
 *   ...
 * }
 *
 * let UserModel: InferredReactiveModelConstructor<ObjectMap, typeof options, 'user'>
 * let ProfileModel: InferredReactiveModelConstructor<ObjectMap, typeof options, 'profile'>
 * ```
 */
export type InferredReactiveModelConstructor<
  ObjectMap extends Record<string, PlainObject>,
  Options extends ReactiveDatabaseOptions<ObjectMap>,
  K extends Extract<keyof ObjectMap, string> & Extract<keyof Options['models'], string>,
  H extends Required<ReactiveDatabaseOptions<ObjectMap>['hooks']> = Required<
    ReactiveDatabaseOptions<ObjectMap>['hooks']
  >,
> = Options['hooks'] extends { wrapReactiveModel: infer Hook }
  ? Hook extends WrapReactiveModelHook<
      ObjectMap[K],
      Options['models'][K]['primaryKey'],
      Options['models'][K]['relationships'],
      infer Output
    >
    ? Output
    : ReactiveModelConstructor<
        ObjectMap,
        ObjectMap[K],
        Options['models'][K]['primaryKey'],
        Options['models'][K]['relationships'],
        H
      >
  : ReactiveModelConstructor<
      ObjectMap,
      ObjectMap[K],
      Options['models'][K]['primaryKey'],
      Options['models'][K]['relationships'],
      H
    >

/**
 * Describes the shape of an instance of a ReactiveModel.
 * @typeParam T - The type of the object that will be used as the model.
 * @typeParam PK - The key of the object which is used as the primary key for the model.
 * @interface
 */
export type ReactiveModel<
  T extends PlainObject,
  PK extends StringKeyOf<T>,
  R extends Record<string, RelationshipConfiguration>,
> = BaseReactiveModel<T, PK, R> &
  AdditionalReactiveModelModelMethods<T, PK, R> &
  T & {
    [P in StringKeyOf<R>]: R[P] extends [infer RelType, ...any[]]
      ? RelType extends typeof HasOne | typeof BelongsTo | typeof MorphOne | typeof MorphTo
        ? any | undefined
        : RelType extends
              | typeof HasMany
              | typeof HasManyThrough
              | typeof ManyToMany
              | typeof MorphMany
          ? any[] | undefined
          : any
      : any
  } & ReactiveModelAgumentations

/**
 * Describes the constructor of a ReactiveModel.
 * @typeParam T - The type of the object that will be used as the model.
 * @typeParam PK - The key of the object which is used as the primary key for the model.
 */
export interface ReactiveModelConstructor<
  OM extends BaseObjectMap,
  T extends PlainObject,
  PK extends StringKeyOf<T>,
  R extends Record<string, RelationshipConfiguration>,
  H extends Required<ReactiveDatabaseOptions<OM>['hooks']>,
> {
  /**
   * Creates a new instance of the ReactiveModel.
   * @param initial The initial values of the properties for the model.
   */
  new (initial?: Partial<T>): ReactiveModel<T, PK, R>
  /**
   * Creates a new instance of the ReactiveModel and saves it to the database.
   * @param value The non-primary key values of the properties for the model.
   */
  create(
    this: ReactiveModelConstructor<OM, T, PK, R, H>,
    value: DataValues<T, PK>
  ): Promise<ReactiveModel<T, PK, R>>
  /**
   * Creates multiple instances of the ReactiveModel and saves them to the database.
   * @param values An array of objects containing the non-primary key values of the properties for each model.
   */
  createMany(
    this: ReactiveModelConstructor<OM, T, PK, R, H>,
    values: Array<DataValues<T, PK>>
  ): Promise<Array<ReactiveModel<T, PK, R>>>
  /**
   * Finds a single instance of the ReactiveModel by its primary key.
   * @param value The value of the primary key for the model.
   */
  find(
    this: ReactiveModelConstructor<OM, T, PK, R, H>,
    value: T[PK]
  ): Promise<ReactiveModel<T, PK, R> | undefined>
  /**
   * Finds multiple instances of the ReactiveModel by their primary keys.
   * @param values An array of values of the primary key for each model.
   */
  findMany(
    this: ReactiveModelConstructor<OM, T, PK, R, H>,
    values: Array<T[PK]>
  ): Promise<Array<ReactiveModel<T, PK, R>>>
  /**
   * Finds a single instance of the ReactiveModel by its primary key or throws an error if not found.
   * @param value The value of the primary key for the model.
   */
  findOrFail(
    this: ReactiveModelConstructor<OM, T, PK, R, H>,
    value: T[PK]
  ): Promise<ReactiveModel<T, PK, R>>
  /**
   * Finds a single instance of the ReactiveModel by a specific property.
   * @param key The name of the property to search by.
   * @param value The value of the property to search for.
   */
  findBy(
    this: ReactiveModelConstructor<OM, T, PK, R, H>,
    key: StringKeyOf<T>,
    value: T[StringKeyOf<T>]
  ): Promise<ReactiveModel<T, PK, R> | undefined>
  /**
   * Find a single instance of the ReactiveModel by a specific property or throws an error if not found.
   * @param key The name of the property to search by.
   * @param value The value of the property to search for.
   */
  findByOrFail(
    this: ReactiveModelConstructor<OM, T, PK, R, H>,
    key: StringKeyOf<T>,
    value: T[StringKeyOf<T>]
  ): Promise<ReactiveModel<T, PK, R>>
  findManyBy(
    this: ReactiveModelConstructor<OM, T, PK, R, H>,
    key: StringKeyOf<T>,
    value: Array<T[StringKeyOf<T>]>
  ): Promise<Array<ReactiveModel<T, PK, R>>>
  first(
    this: ReactiveModelConstructor<OM, T, PK, R, H>
  ): Promise<ReactiveModel<T, PK, R> | undefined>
  firstOrFail(this: ReactiveModelConstructor<OM, T, PK, R, H>): Promise<ReactiveModel<T, PK, R>>
  firstOrNew(
    this: ReactiveModelConstructor<OM, T, PK, R, H>,
    searchPayload: Record<StringKeyOf<T>, unknown>,
    savePayload?: Partial<DataValues<T, PK>>
  ): Promise<ReactiveModel<T, PK, R>>
  firstOrCreate(
    this: ReactiveModelConstructor<OM, T, PK, R, H>,
    searchPayload: Record<StringKeyOf<T>, unknown>,
    savePayload?: Partial<DataValues<T, PK>>
  ): Promise<ReactiveModel<T, PK, R>>
  updateOrCreate(
    this: ReactiveModelConstructor<OM, T, PK, R, H>,
    searchPayload: Record<StringKeyOf<T>, unknown>,
    savePayload: Partial<DataValues<T, PK>>
  ): Promise<ReactiveModel<T, PK, R>>
  /**
   * Returns all instances of the ReactiveModel.
   */
  all(this: ReactiveModelConstructor<OM, T, PK, R, H>): Promise<Array<ReactiveModel<T, PK, R>>>
  query(
    this: ReactiveModelConstructor<OM, T, PK, R, H>,
    introspector?: ReactiveQueryBuilderIntrospector<OM, T, PK, R, H>
  ): ReactiveQueryBuilder<OM, T, PK, R, H>
  truncate(this: ReactiveModelConstructor<OM, T, PK, R, H>): Promise<void>
}

export const applyReactiveModelConstructorMixin = <
  OM extends BaseObjectMap,
  T extends PlainObject,
  PK extends StringKeyOf<T>,
  R extends Record<string, RelationshipConfiguration>,
  H extends Required<ReactiveDatabaseOptions<OM>['hooks']>,
  MCtor extends new (
    initial?: Partial<T>,
    introspector?: ReactiveModelIntrospector<T, PK, R>
  ) => any = new (
    initial?: Partial<T>,
    introspector?: ReactiveModelIntrospector<T, PK, R>
  ) => ReactiveModel<T, PK, R>,
>(
  constructor: MCtor,
  eventBus: UnifiedEventBus,
  _encryption: Encryption,
  logBus: TypedEventEmitter<LogBusEventMap>,
  throwError: (err: Error) => void,
  _db: ReactiveDatabase<any>,
  table: EntityTable<T>,
  _properties: Array<StringKeyOf<T>>,
  primaryKey: PK,
  modelName: string,
  _modelKey: string,
  relatable: StringKeyOf<R>[],
  addCleanupCallback: (cb: () => Promise<void>) => void,
  hooks: H
): MCtor => {
  const reactiveModelName = makeReactiveModelName(modelName)
  const reactiveModelConstructorAbortController = new AbortController()
  addCleanupCallback(async () => {
    reactiveModelConstructorAbortController.abort()
  })
  const ReactiveModelConstructorMixin: Omit<ReactiveModelConstructor<OM, T, PK, R, H>, 'new'> = {
    async create(value) {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      const instance = new this(value as Partial<T>)
      await instance.save()
      return instance
    },
    async createMany(values) {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      const instances = values.map((value) => new this(value as Partial<T>))
      await Promise.all(instances.map((instance) => instance.save()))
      return instances
    },
    async find(value) {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      try {
        return await this.findOrFail(value)
      } catch (e) {
        if (e instanceof Error) {
          throwError(e)
        }
        return undefined
      }
    },
    async findMany(values) {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      try {
        return await this.findManyBy(primaryKey, values)
      } catch (e) {
        if (e instanceof Error) {
          throwError(e)
        }
        return []
      }
    },
    async findOrFail(value) {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      return await this.findByOrFail(primaryKey, value)
    },
    async findBy(key, value) {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      try {
        return await this.findByOrFail(key, value)
      } catch (e) {
        if (e instanceof Error) {
          throwError(e)
        }
        return undefined
      }
    },
    async findByOrFail(key, value) {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      try {
        const record = await this.query().where(key, value).first()
        if (!record) {
          throw new MissingReactiveModelRecordError(key, value, reactiveModelName)
        }
        const instance = new this(record)
        return instance
      } catch (e) {
        if (e instanceof Error) {
          throwError(e)
        }
        throw new MissingReactiveModelRecordError(key, value, reactiveModelName)
      }
    },
    async findManyBy(key, value) {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      try {
        const records = await table.filter((r) => value.includes(r[key])).toArray()
        return records.map((record) => new this(record))
      } catch (e) {
        throw new ReactiveModelQueryException(e)
      }
    },
    async first() {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      try {
        return await this.firstOrFail()
      } catch (e) {
        if (e instanceof Error) {
          throwError(e)
        }
        return undefined
      }
    },
    async firstOrFail() {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      try {
        const records = await table.orderBy(String(primaryKey)).limit(1).toArray()
        if (records.length === 0) {
          throw new NoReactiveModelRecordError(reactiveModelName)
        }
        const instance = new this(records[0])
        return instance
      } catch {
        throw new NoReactiveModelRecordError(reactiveModelName)
      }
    },
    async firstOrNew(searchPayload, savePayload) {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      try {
        const instances: Array<ReactiveModel<T, PK, R>> = []
        const keys = Object.keys(searchPayload) as Array<StringKeyOf<DataValues<T, PK>>>
        for (const key of keys) {
          try {
            const instancesForKey = await this.findManyBy(key, [
              searchPayload[key] as T[StringKeyOf<T>],
            ])
            if (instancesForKey.length > 0) {
              instances.push(...instancesForKey)
            }
          } catch (e) {
            if (e instanceof Error) {
              throwError(e)
            }
          }
        }
        if (instances.length > 0) {
          const sorted = instances.sort((a, b) => {
            const pkA = a[primaryKey]
            const pkB = b[primaryKey]
            if ('string' === typeof pkA && 'string' === typeof pkB) {
              return (pkA as string).localeCompare(pkB)
            }
            if ('number' === typeof pkA && 'number' === typeof pkB) {
              return pkA - pkB
            }
            if ('bigint' === typeof pkA && 'bigint' === typeof pkB) {
              return Number(pkA - pkB)
            }
            if ('boolean' === typeof pkA && 'boolean' === typeof pkB) {
              return Number(pkA) - Number(pkB)
            }
            if ('object' === typeof pkA && 'object' === typeof pkB) {
              return Number(pkA) - Number(pkB)
            }
            return 0
          })
          return sorted[0]
        } else {
          const instance = new this(savePayload as Partial<T>)
          return instance
        }
      } catch (e) {
        throw new ReactiveModelQueryException(e)
      }
    },
    async firstOrCreate(searchPayload, savePayload) {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      try {
        const firstOrNew = await this.firstOrNew(searchPayload, savePayload)
        if (firstOrNew[primaryKey] === undefined) {
          await firstOrNew.save()
        }
        return firstOrNew
      } catch (e) {
        if (e instanceof ReactiveModelQueryException) {
          throw e
        } else {
          throw new ReactiveModelQueryException(e)
        }
      }
    },
    async updateOrCreate(searchPayload, savePayload) {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      try {
        const record = await this.query().where(searchPayload).first()
        if (record) {
          record.merge(savePayload)
          await record.save()
          return record
        } else {
          const instance = new this({ ...searchPayload, ...savePayload } as Partial<T>)
          await instance.save()
          return instance
        }
      } catch (e) {
        if (e instanceof ReactiveModelQueryException) {
          throw e
        } else {
          throw new ReactiveModelQueryException(e)
        }
      }
    },
    async all() {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      try {
        const records = await table.toArray()
        return records.map((record) => new this(record))
      } catch (e) {
        if (e instanceof Error) {
          throwError(e)
        }
        return []
      }
    },
    query(introspector?: ReactiveQueryBuilderIntrospector<OM, T, PK, R, H>) {
      return new ReactiveQueryBuilder<OM, T, PK, R, H>(
        hooks,
        this,
        table,
        relatable,
        primaryKey,
        logBus,
        eventBus,
        addCleanupCallback,
        undefined,
        undefined,
        undefined,
        introspector
      )
    },
    async truncate() {
      if (reactiveModelConstructorAbortController.signal.aborted) {
        throw new ShutdownDatabaseException()
      }
      try {
        await table.clear()
        eventBus.emit('reactivemodel:truncated', modelName)
        // Mark all instances as deleted after truncate
        cleanupDeadRefs(this)
        for (const instance of getLiveInstances(this)) {
          if (typeof instance.markDeletedForTruncate === 'function') {
            instance.markDeletedForTruncate()
          }
        }
        cleanupDeadRefs(this)
      } catch (e) {
        if (e instanceof Error) {
          throwError(e)
        }
      }
    },
  }
  Object.assign(constructor, ReactiveModelConstructorMixin)
  return constructor
}

// Helper type to infer the return type of wrapReactiveModel if present
// Otherwise, default to the generated constructor type
export type MakeReactiveModelReturnType<
  OM extends BaseObjectMap,
  K extends StringKeyOf<OM>,
  PK extends StringKeyOf<OM[K]>,
  R extends Record<string, RelationshipConfiguration>,
  H extends Required<ReactiveDatabaseOptions<OM>['hooks']>,
> = 'wrapReactiveModel' extends keyof H
  ? H['wrapReactiveModel'] extends (ctor: any) => infer RT
    ? RT
    : ReactiveModelConstructor<OM, OM[K], PK, R, H>
  : ReactiveModelConstructor<OM, OM[K], PK, R, H>

export const makeReactiveModel = <
  OM extends BaseObjectMap,
  K extends StringKeyOf<OM>,
  PK extends StringKeyOf<OM[K]>,
  R extends Record<string, RelationshipConfiguration>,
  H extends Required<ReactiveDatabaseOptions<OM>['hooks']>,
>(
  modelKey: K,
  properties: Array<StringKeyOf<OM[K]>>,
  primaryKey: PK,
  swarm: UnifiedEventBus,
  encryption: Encryption,
  logBus: TypedEventEmitter<LogBusEventMap>,
  throwError: (err: Error) => void,
  db: ReactiveDatabase<OM>,
  entityTable: EntityTable<OM[K]>,
  relationships: R,
  addCleanupCallback: (cb: () => Promise<void>) => void,
  constraints: ModelConstraints<OM[K]> | undefined,
  hooks: H
): MakeReactiveModelReturnType<OM, K, PK, R, H> => {
  const name = makeReactiveModelName(String(modelKey))
  const cb = new Function(
    'BaseReactiveModel',
    'swarm',
    'encryption',
    'logBus',
    'throwError',
    'db',
    'table',
    'properties',
    'primaryKey',
    'modelName',
    'modelKey',
    'serialize',
    'deserialize',
    'relationships',
    'addCleanupCallback',
    'constraints',
    'registerInstance',
    'hooks',
    `return class ${name} extends BaseReactiveModel {
        constructor(initial, introspector = undefined) {
          super(
              swarm,
              encryption,
              logBus,
              throwError,
              db,
              table,
              properties,
              primaryKey,
              modelName,
              modelKey,
              relationships,
              initial,
              introspector,
              constraints
          )
          addCleanupCallback(this.unref.bind(this))
          registerInstance(this)
          if (hooks && typeof hooks.wrapReactiveModel === 'function') {
            const raw = this
            return hooks.wrapReactiveModel(this)
          }
        }

        clone() {
          const asObject = deserialize(serialize(this.toObject()))
          delete asObject[primaryKey]
          const clone = new ${name}(asObject, introspector)
          return clone
        }

        get $key() {
          return this[primaryKey]
        }
      }`
  )
  const generated = cb(
    BaseReactiveModel,
    swarm,
    encryption,
    logBus,
    throwError,
    db,
    entityTable,
    properties,
    primaryKey,
    name,
    modelKey,
    serialize,
    deserialize,
    relationships,
    addCleanupCallback,
    constraints,
    registerInstance,
    hooks
  ) as unknown as ReactiveModelConstructor<OM, OM[K], PK, R, H>
  Object.defineProperty(generated, 'name', { value: name })
  applyReactiveModelConstructorMixin<OM, OM[K], PK, R, H>(
    generated,
    swarm,
    encryption,
    logBus,
    throwError,
    db as ReactiveDatabase<any>,
    entityTable,
    properties,
    primaryKey,
    name,
    modelKey,
    Object.keys(relationships) as Array<StringKeyOf<R>>,
    addCleanupCallback,
    hooks
  )
  let modelCtor = generated as any
  return modelCtor as MakeReactiveModelReturnType<OM, K, PK, R, H>
}

// Instance tracking for all model classes
const MODEL_INSTANCE_REGISTRY: Map<any, Set<WeakRef<any>>> = new Map()

function registerInstance(instance: any) {
  const ctor = instance.constructor
  let set = MODEL_INSTANCE_REGISTRY.get(ctor)
  if (!set) {
    set = new Set()
    MODEL_INSTANCE_REGISTRY.set(ctor, set)
  }
  set.add(new WeakRef(instance))
}

function getLiveInstances(ctor: any): any[] {
  const set = MODEL_INSTANCE_REGISTRY.get(ctor)
  if (!set) return []
  const live: any[] = []
  for (const ref of set) {
    const inst = ref.deref()
    if (inst) {
      live.push(inst)
    }
  }
  return live
}

function cleanupDeadRefs(ctor: any) {
  const set = MODEL_INSTANCE_REGISTRY.get(ctor)
  if (!set) return
  for (const ref of Array.from(set)) {
    if (!ref.deref()) set.delete(ref)
  }
}
