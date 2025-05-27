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
 * The configuration for a {@link MorphTo} relationship.
 * @typeParam OM - the map of all models in the database
 * @typeParam TM - the table of the child (polymorphic) model
 * @typeParam PKT - the property used as the primary key in the child model
 * @typeParam FKTYP - the property on the child model storing the parent record's type
 * @typeParam FKID - the property on the child model storing the parent record's id
 *
 * @example
 * // A Comment or Image belongs to a parent of varying type (Post, Video, etc).
 * {
 *   models: {
 *     comment: {
 *       schema: '++id,body,commentable_id,commentable_type',
 *       properties: ['id', 'body', 'commentable_id', 'commentable_type'],
 *       primaryKey: 'id',
 *       relationships: {
 *         parent: [MorphTo, 'commentable_type', 'commentable_id'],
 *       },
 *     },
 *     image: {
 *       schema: '++id,url,imageable_id,imageable_type',
 *       properties: ['id', 'url', 'imageable_id', 'imageable_type'],
 *       primaryKey: 'id',
 *       relationships: {
 *         parent: [MorphTo, 'imageable_type', 'imageable_id'],
 *       },
 *     },
 *     post: {
 *       schema: '++id,title',
 *       properties: ['id', 'title'],
 *       primaryKey: 'id',
 *       relationships: {},
 *     },
 *     video: {
 *       schema: '++id,url',
 *       properties: ['id', 'url'],
 *       primaryKey: 'id',
 *       relationships: {},
 *     },
 *   }
 * }
 *
 * @remarks
 * MorphTo is defined on the child, and uses the type and id keys to point to a parent of varying type.
 */
export type MorphToConfiguration<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  FM extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FM]>,
  FKT extends StringKeyOf<OM[TM]>,
> =
  | [typeof MorphTo<OM, TM, PKT, FM, PKF, FKT>, FM, FKT]
  | [typeof MorphTo<OM, TM, PKT, FM, PKF, FKT>, FM, FKT, PKT]

/**
 * Represents a relationship between two models where the table of the foreign model and the ID of the foreign model is stored as a property of the originating model.
 *
 * @description
 * For example, a `task` has a single `owner` which can be either a `user` or a `group`:
 * ```mermaid
 * erDiagram
 *  direction LR
 *  users {
 *      number id PK
 *      string email
 *      string password
 *      date createdAt
 *      date updatedAt
 *  }
 *  groups {
 *      number id PK
 *      string email
 *      string password
 *  }
 *
 *  tasks {
 *      number id PK
 *      string owner_type
 *      number owner_id
 *      string title
 *      string description
 *      date createdAt
 *      date updatedAt
 *  }
 *
 *  users || -- || tasks : "user.id ← task.owner_type = 'user' AND task.owner_id"
 *  groups || -- || tasks : "group.id ← task.owner_type = 'group' AND task.owner_id"
 * ```
 *
 * In your configuration you would have:
 *
 * ```typescript
 * {
 *   ...
 *   models: {
 *       tasks: {
 *         schema: '++id, owner_type, owner_id, title, description, createdAt, updatedAt',
 *         properties: ['id', 'owner_type', 'owner_id', 'title', 'description', 'createdAt', 'updatedAt'],
 *         primaryKey: 'id',
 *         relationships: {
 *           owner: [MorphTo, 'owner_type', 'owner_id'], // [!code focus]
 *         }
 *       },
 *       users: {
 *         schema: '++id, email, createdAt, updatedAt',
 *         properties: ['id', 'email', 'password', 'createdAt', 'updatedAt'],
 *         primaryKey: 'id',
 *       },
 *       groups: {
 *         schema: '++id, email, createdAt, updatedAt',
 *         properties: ['id', 'email', 'password', 'createdAt', 'updatedAt'],
 *         primaryKey: 'id',
 *       },
 *   },
 *   ...
 * }
 * ```
 *
 * Which will then allow you to access the owner of a task from the `owner` accessor on the `task` model: `task.owner`.
 *
 * @remarks The inverse of this relationship can be either {@link MorphOne} or {@link MorphMany} relationship. Configured using the {@link MorphToConfiguration} tuple.
 *
 * @typeParam OM - the map of all models in the database
 * @typeParam TM - the table of the originating model
 * @typeParam PKT - the property used as the primary key in the originating model
 * @typeParam FM - the property used as the foreign model name in the originating model
 * @typeParam FKT - the property used as the foreign key in the originating model
 * @typeParam PKF - the property used as the primary key in the foreign model
 */
export class MorphTo<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  FM extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FM]>,
  FKT extends StringKeyOf<OM[TM]>,
> extends RelationshipBase<ReactiveModel<OM[FM], PKF, any>, OM, TM, PKT, FM, PKF, OM[TM], OM[FM]> {
  readonly #typeKey: FM
  readonly #idKey: FKT
  #hasHookedForeignKeyWatcher: boolean
  #boundNextRelatedChange?: (is: any, was: any) => void
  #boundNextRelatedDelta?: (delta: any) => void
  #boundOnSwarmSaved?: (model: string, primaryKey: string, values: any) => void
  #boundOnSwarmDeleted?: (model: string, primaryKey: string) => void

  /** @private */
  constructor(
    key: string,
    swarm: UnifiedEventBus,
    originatingTable: TM,
    originatingPK: PKT,
    typeKey: FM,
    idKey: FKT
  ) {
    super(
      key,
      swarm,
      originatingTable,
      originatingPK,
      originatingTable as any,
      originatingPK as any
    )
    this.#typeKey = typeKey
    this.#idKey = idKey
    this.#hasHookedForeignKeyWatcher = false
  }

  // @ts-ignore
  async prepare(
    host: ReactiveModel<OM[TM], PKT, any>,
    emitter: ReactiveModelChangeEmitter<OM[TM], PKT, any>,
    onChangeDetected?: () => void
  ) {
    if ('function' !== typeof onChangeDetected) {
      onChangeDetected = () => {
        this.prepare(host, emitter).catch(() => {
          this.value = undefined
        })
      }
    }
    if (this.#hasHookedForeignKeyWatcher && 'undefined' !== typeof this.value) {
      this.value.offChange(this.#boundNextRelatedChange)
      this.value.offDelta(this.#boundNextRelatedDelta)
    }
    if (this.#boundOnSwarmSaved) {
      this.$swarm.off('reactivemodel:saved', this.#boundOnSwarmSaved)
    }
    if (this.#boundOnSwarmDeleted) {
      this.$swarm.off('reactivemodel:deleted', this.#boundOnSwarmDeleted)
    }
    if (!this.$booted || !this.$database) {
      throw new RelationshipNotBootedException()
    }
    const tableName = host[this.#typeKey] as unknown as FM
    if (!tableName) {
      return undefined
    }
    const targetCtor = this.$database.model(tableName)
    if (!targetCtor) {
      throw new MissingModelException(makeReactiveModelName(tableName), tableName)
    }
    const id = host[this.#idKey] as unknown as OM[FM][PKF]
    if (!id) {
      return undefined
    }
    if ('function' !== typeof this.#boundNextRelatedChange) {
      this.#boundNextRelatedChange = emitter.nextRelatedChange.bind(emitter, this.$key)
      this.#boundNextRelatedDelta = emitter.nextRelatedDelta.bind(emitter, this.$key)
    }
    this.#boundOnSwarmSaved = (model, primaryKey) => {
      if (model === makeReactiveModelName(tableName) && primaryKey.toString() === id.toString()) {
        onChangeDetected()
      }
    }
    this.#boundOnSwarmDeleted = (model, primaryKey) => {
      if (model === makeReactiveModelName(tableName) && primaryKey.toString() === id.toString()) {
        onChangeDetected()
      }
    }
    const inst = await targetCtor.find(id)
    this.value = inst as unknown as ReactiveModel<OM[FM], PKF, any>
    this.$swarm.on('reactivemodel:saved', this.#boundOnSwarmSaved!)
    this.$swarm.on('reactivemodel:deleted', this.#boundOnSwarmDeleted!)
    if (this.value) {
      this.value.onChange(this.#boundNextRelatedChange)
      this.value.onDelta(this.#boundNextRelatedDelta!)
    }
    // Hook the foreign key watcher to update the relationship when the foreign key lookup value changes
    if (!this.#hasHookedForeignKeyWatcher) {
      this.#hasHookedForeignKeyWatcher = true
      emitter.onPropertyChange(this.#typeKey, () => {
        onChangeDetected()
      })
      emitter.onPropertyChange(this.#idKey, () => {
        onChangeDetected()
      })
    }
    return inst as unknown as ReactiveModel<OM[FM], PKF, any>
  }

  async unref(): Promise<void> {
    // Remove event listeners from the value if it exists
    if (this.#hasHookedForeignKeyWatcher && this.value) {
      this.value.offChange(this.#boundNextRelatedChange!)
      this.value.offDelta(this.#boundNextRelatedDelta!)
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
    this.#boundOnSwarmSaved = undefined
    this.#boundOnSwarmDeleted = undefined
    this.value = undefined
  }
}
