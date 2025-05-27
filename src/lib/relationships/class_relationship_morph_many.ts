import { makeReactiveModelName } from '../utils'
import { RelationshipBase } from './abstract_class_relationship_base'
import {
  MissingModelException,
  RelationshipNotBootedException,
} from '@nhtio/web-re-active-record/errors'
import type { PlainObject, StringKeyOf } from '../types'
import type { ReactiveModel } from '../factory_reactive_model'
import type { UnifiedEventBus } from '../class_unified_event_bus'
import type { ReactiveModelChangeEmitter } from '../class_reactive_model_change_emitter'

/**
 * The configuration for a {@link MorphMany} relationship.
 * @typeParam OM - the map of all models in the database
 * @typeParam TM - the table of the parent model
 * @typeParam PKT - the property used as the primary key in the parent model
 * @typeParam FT - the table of the child (polymorphic) model
 * @typeParam FKID - the property on the child model storing the parent record's id
 * @typeParam FKTYP - the property on the child model storing the parent record's type
 * @typeParam PKF - the property used as the primary key in the child model
 *
 * @example
 * // A Post or Video can have many Comments (polymorphic). Each Comment stores the parent type and id.
 * {
 *   models: {
 *     post: {
 *       schema: '++id,title',
 *       properties: ['id', 'title'],
 *       primaryKey: 'id',
 *       relationships: {
 *         comments: [MorphMany, 'comment', 'commentable_id', 'commentable_type'],
 *       },
 *     },
 *     video: {
 *       schema: '++id,url',
 *       properties: ['id', 'url'],
 *       primaryKey: 'id',
 *       relationships: {
 *         comments: [MorphMany, 'comment', 'commentable_id', 'commentable_type'],
 *       },
 *     },
 *     comment: {
 *       schema: '++id,body,commentable_id,commentable_type',
 *       properties: ['id', 'body', 'commentable_id', 'commentable_type'],
 *       primaryKey: 'id',
 *       relationships: {},
 *     },
 *   }
 * }
 *
 * @remarks
 * MorphMany is defined on the parent, points to the child table, and the child table must have both a type and id column referencing the parent.
 */
/* ...existing code... */
export type MorphManyConfiguration<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  FT extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FT]>,
  FKID extends StringKeyOf<OM[FT]>,
> =
  | [typeof MorphMany<OM, TM, PKT, FT, PKF, FKID>, FT, FKID]
  | [typeof MorphMany<OM, TM, PKT, FT, PKF, FKID>, FT, FKID, PKT]

/**
 * Represents a relationship between two models where the table and primary key of the foreign model stored as a property of the originating model.
 *
 * @description
 * For example, a `user` has many `contactMethod` which can be either an `email` or a `phone_number`:
 * ```mermaid
 * erDiagram
 *  direction LR
 *  users {
 *      number id PK
 *      string contact_method_type
 *      number contact_method_id
 *      string password
 *      date createdAt
 *      date updatedAt
 *  }
 *  emails {
 *      number id PK
 *      string address
 *  }
 *
 *  phone_numbers {
 *      number id PK
 *      string number
 *  }
 *
 *  users || -- || emails : "user.id ← user.contact_method_type = 'email' AND email.contact_method_id"
 *  users || -- || phone_numbers : "user.id ← user.contact_method_type = 'phone_number' AND phone_number.contact_method_id"
 * ```
 *
 * In your configuration you would have:
 *
 * ```typescript
 * {
 *   ...
 * models: {
 *   users: {
 *     schema: '++id, contact_method_type, contact_method_id, password, createdAt, updatedAt',
 *     properties: ['id', 'contact_method_type', 'contact_method_id', 'password', 'createdAt', 'updatedAt'],
 *     primaryKey: 'id',
 *     relationships: {
 *       contactMethod: [MorphMany, 'contact_method_type', 'contact_method_id'], // [!code focus]
 *     }
 *   },
 *   emails: {
 *     schema: '++id, address',
 *     properties: ['id', 'address'],
 *     primaryKey: 'id',
 *   },
 *   phone_numbers: {
 *     schema: '++id, number',
 *     properties: ['id', 'number'],
 *     primaryKey: 'id',
 *  },
 * }
 * ```
 *
 * Which will then allow you to access the contact methods of a user from the `contactMethod` accessor on the `user` model: `user.contactMethod`.
 *
 * @remarks The inverse of this relationship is the {@link MorphTo} relationship. Configured using the {@link MorphManyConfiguration} tuple.
 *
 * @typeParam OM - the map of all models in the database
 * @typeParam TM - the table of the host model
 * @typeParam PKT - the property used as the primary key in the host model
 * @typeParam FT - the table of the target model
 * @typeParam FKID - the property on the target model storing the host record's id
 * @typeParam PKF - the property used as the primary key in the target model
 */
export class MorphMany<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  FT extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FT]>,
  FKID extends StringKeyOf<OM[FT]>,
> extends RelationshipBase<
  ReactiveModel<OM[FT], PKF, any>[],
  OM,
  TM,
  PKT,
  FT,
  PKF,
  OM[TM],
  OM[FT]
> {
  readonly #idKey: FKID
  #hasHookedForeignKeyWatcher: boolean
  #boundNextRelatedChange?: (is: any, was: any) => void
  #boundNextRelatedDelta?: (delta: any) => void
  #boundOnRelatedDelta?: (delta: any) => void
  #boundOnSwarmSaved?: (model: string, primaryKey: string, values: any) => void
  #boundOnSwarmDeleted?: (model: string, primaryKey: string) => void

  /** @private */
  constructor(
    key: string,
    swarm: UnifiedEventBus,
    hostTable: TM,
    hostPK: PKT,
    targetTable: FT,
    idKey: FKID
  ) {
    // `foreignModelPrimaryKey` must be the actual PK of target, not idKey property.
    super(key, swarm, hostTable, hostPK, targetTable, idKey as any)
    this.#idKey = idKey
    this.#hasHookedForeignKeyWatcher = false
  }

  // @ts-ignore
  async prepare(
    host: ReactiveModel<OM[TM], PKT, any>,
    emitter: ReactiveModelChangeEmitter<OM[TM], PKT, any>,
    onChangeDetected?: () => void
  ): Promise<ReactiveModel<OM[FT], PKF, any>[] | undefined> {
    if ('function' !== typeof onChangeDetected) {
      onChangeDetected = () => {
        this.prepare(host, emitter).catch(() => {
          this.value = undefined
        })
      }
    }
    if ('function' !== typeof this.#boundNextRelatedChange) {
      this.#boundNextRelatedChange = emitter.nextRelatedChange.bind(emitter, this.$key)
      this.#boundNextRelatedDelta = emitter.nextRelatedDelta.bind(emitter, this.$key)
      this.#boundOnRelatedDelta = (delta: any) => {
        if (
          this.#idKey in delta &&
          'is' in delta[this.#idKey] &&
          'was' in delta[this.#idKey] &&
          (delta[this.#idKey].is.toString() === host[this.$originatingModelPrimaryKey].toString() ||
            delta[this.#idKey].was.toString() === host[this.$originatingModelPrimaryKey].toString())
        ) {
          onChangeDetected()
        }
      }
    }
    if ('function' === typeof this.#boundOnSwarmSaved) {
      this.$swarm.off('reactivemodel:saved', this.#boundOnSwarmSaved)
    }
    if ('function' === typeof this.#boundOnSwarmDeleted) {
      this.$swarm.off('reactivemodel:deleted', this.#boundOnSwarmDeleted)
    }
    if (this.#hasHookedForeignKeyWatcher && Array.isArray(this.value)) {
      this.value.forEach((instance) => {
        instance.offChange(this.#boundNextRelatedChange)
        instance.offDelta(this.#boundNextRelatedDelta)
        instance.offDelta(this.#boundOnRelatedDelta)
      })
    }
    if (!this.$booted || !this.$foreignModelCtor) {
      throw new RelationshipNotBootedException()
    }
    const tableName = host[this.$originatingModelTable]
    if (!tableName) {
      return undefined
    }
    this.#boundOnSwarmSaved = (model, primaryKey, values) => {
      if (
        model === makeReactiveModelName(tableName) &&
        values[this.#idKey].toString() === host[this.$originatingModelPrimaryKey].toString()
      ) {
        onChangeDetected()
      } else if (
        model === makeReactiveModelName(tableName) &&
        Array.isArray(this.value) &&
        this.value.some((instance) => {
          return instance[this.$foreignModelPrimaryKey].toString() === primaryKey.toString()
        })
      ) {
        onChangeDetected()
      }
    }
    this.#boundOnSwarmDeleted = (model, primaryKey) => {
      if (
        model === makeReactiveModelName(tableName) &&
        Array.isArray(this.value) &&
        this.value.some((instance) => {
          return instance[this.$foreignModelPrimaryKey].toString() === primaryKey.toString()
        })
      ) {
        onChangeDetected()
      }
    }
    const foreignCtor = this.$foreignModelCtor
    if (!foreignCtor) {
      throw new MissingModelException(
        makeReactiveModelName(tableName as string),
        tableName as string
      )
    }
    const match = await foreignCtor.findManyBy(this.#idKey, [
      host[this.$originatingModelPrimaryKey] as any,
    ])
    // @ts-ignore
    this.value = match
    this.$swarm.on('reactivemodel:saved', this.#boundOnSwarmSaved!)
    this.$swarm.on('reactivemodel:deleted', this.#boundOnSwarmDeleted!)
    if (this.value) {
      this.value.forEach((instance) => {
        instance.onChange(this.#boundNextRelatedChange!)
        instance.onDelta(this.#boundNextRelatedDelta!)
        instance.onDelta(this.#boundOnRelatedDelta!)
      })
    }
    if (!this.#hasHookedForeignKeyWatcher) {
      this.#hasHookedForeignKeyWatcher = true
    }
    // @ts-ignore
    return match
  }

  async unref(): Promise<void> {
    // Remove event listeners from each model in the array if they exist
    if (this.#hasHookedForeignKeyWatcher && Array.isArray(this.value)) {
      this.value.forEach((instance) => {
        instance.offChange(this.#boundNextRelatedChange!)
        instance.offDelta(this.#boundNextRelatedDelta!)
        instance.offDelta(this.#boundOnRelatedDelta!)
      })
    }

    // Remove swarm event listeners
    if (this.#boundOnSwarmSaved) {
      this.$swarm.off('reactivemodel:saved', this.#boundOnSwarmSaved)
    }
    if (this.#boundOnSwarmDeleted) {
      this.$swarm.off('reactivemodel:deleted', this.#boundOnSwarmDeleted)
    }

    // Reset state
    this.#hasHookedForeignKeyWatcher = false
    this.#boundNextRelatedChange = undefined
    this.#boundNextRelatedDelta = undefined
    this.#boundOnRelatedDelta = undefined
    this.#boundOnSwarmSaved = undefined
    this.#boundOnSwarmDeleted = undefined
    this.value = undefined
  }
}
