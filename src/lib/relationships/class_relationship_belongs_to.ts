import { makeReactiveModelName } from '../utils'
import { RelationshipBase } from './abstract_class_relationship_base'
import { RelationshipNotBootedException } from '@nhtio/web-re-active-record/errors'
import type { PlainObject, StringKeyOf } from '../types'
import type { ReactiveModel } from '../factory_reactive_model'
import type { UnifiedEventBus } from '../class_unified_event_bus'
import type { ReactiveModelChangeEmitter } from '../class_reactive_model_change_emitter'

/**
 * The configuration for a {@link BelongsTo} relationship.
 * @typeParam OM - the map of all models in the database
 * @typeParam TM - the table of the originating model
 * @typeParam PKT - the property used as the primary key in the originating model
 * @typeParam FM - the table of the foreign model
 * @typeParam PKF - the property used as the primary key in the foreign model
 *
 * @example
 * ```typescript
 * {
 *   ...
 *   models: {
 *       users: {
 *         schema: '++id, email, createdAt, updatedAt',
 *         properties: ['id', 'email', 'password', 'createdAt', 'updatedAt'],
 *         primaryKey: 'id',
 *       },
 *       profiles: {
 *         schema: '++id, user_id, full_name, avatar_url',
 *         properties: ['id', 'user_id', 'full_name', 'avatar_url'],
 *         relationships: {
 *           user: [BelongsTo, 'users', 'user_id'], // [!code focus]
 *         }
 *       }
 *   },
 *   ...
 * }
 * ```
 */
export type BelongsToConfiguration<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  FM extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FM]>,
> =
  | [typeof BelongsTo<OM, TM, PKT, FM, PKF>, FM, Omit<OM[FM], PKF>]
  | [typeof BelongsTo<OM, TM, PKT, FM, PKF>, FM, Omit<OM[FM], PKF>, PKT]
  | [typeof BelongsTo<OM, TM, PKT, FM, PKF>, FM, Omit<OM[FM], PKF>, PKT, PKF]

/**
 * Represents a relationship between two models where the ID of the foreign model is stored as a property of the originating model.
 *
 * @description
 * For example, a `user` has a single `profile`:
 * ```mermaid
 * erDiagram
 *  direction LR
 *  users {
 *      number id PK
 *      string email
 *      string password
 *  }
 *
 *  profiles {
 *      number id PK
 *      number user_id FK
 *      string full_name
 *      string avatar_url
 *  }
 *
 *  users || -- || profiles : "user.id ← profile.user_id"
 * ```
 *
 * In your configuration you would have:
 *
 * ```typescript
 * {
 *   ...
 *   models: {
 *       users: {
 *         schema: '++id, email, createdAt, updatedAt',
 *         properties: ['id', 'email', 'password', 'createdAt', 'updatedAt'],
 *         primaryKey: 'id',
 *       },
 *       profiles: {
 *         schema: '++id, user_id, full_name, avatar_url',
 *         properties: ['id', 'user_id', 'full_name', 'avatar_url'],
 *         relationships: {
 *           user: [BelongsTo, 'users', 'user_id'], // [!code focus]
 *         }
 *       }
 *   },
 *   ...
 * }
 * ```
 *
 * Which will then allow you to access the user of a profile from the `user` accessor on the `profile` model: `profile.user`.
 *
 * @remarks The inverse of this relationship can be either {@link HasOne} or {@link HasMany} relationship. Configured using the {@link BelongsToConfiguration} tuple.
 *
 * @typeParam OM - the map of all models in the database
 * @typeParam TM - the table of the originating model
 * @typeParam PKT - the property used as the primary key in the originating model
 * @typeParam FM - the table of the foreign model
 * @typeParam PKF - the property used as the primary key in the foreign model
 */
export class BelongsTo<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  FM extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FM]>,
> extends RelationshipBase<ReactiveModel<OM[FM], PKF, any>, OM, TM, PKT, FM, PKF, OM[TM], OM[FM]> {
  readonly #foreignModelLookupKey: StringKeyOf<OM[FM]>
  #hasHookedForeignKeyWatcher: boolean
  #boundNextRelatedChange?: (is: any, was: any) => void
  #boundNextRelatedDelta?: (delta: any) => void
  #boundOnSwarmSaved?: (model: string, primaryKey: string) => void
  #boundOnSwarmDeleted?: (model: string, primaryKey: string) => void

  /** @private */
  constructor(
    key: string,
    swarm: UnifiedEventBus,
    originatingModelTable: TM,
    originatingModelPrimaryKey: PKT,
    foreignModelTable: FM,
    foreignModelPrimaryKey: PKF,
    foreignModelLookupKey: StringKeyOf<OM[FM]>
  ) {
    super(
      key,
      swarm,
      originatingModelTable,
      originatingModelPrimaryKey,
      foreignModelTable,
      foreignModelPrimaryKey
    )
    this.#foreignModelLookupKey = foreignModelLookupKey
    this.#hasHookedForeignKeyWatcher = false
  }

  async prepare(
    host: ReactiveModel<OM[TM], Extract<keyof OM[TM], string>, any>,
    emitter: ReactiveModelChangeEmitter<OM[TM], Extract<keyof OM[TM], string>, any>,
    onChangeDetected?: () => void
  ) {
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
    }
    // Store previous value for change event
    let previousValue: typeof this.value | undefined
    try {
      previousValue = this.value
    } catch (e) {
      // If relationship is not prepared, just use undefined
      previousValue = undefined
    }
    if (this.#hasHookedForeignKeyWatcher && typeof previousValue !== 'undefined') {
      previousValue.offChange(this.#boundNextRelatedChange)
      previousValue.offDelta(this.#boundNextRelatedDelta)
    }
    if (!this.$foreignModelCtor) {
      throw new RelationshipNotBootedException()
    }
    const instance = (await this.$foreignModelCtor.find(
      host[this.#foreignModelLookupKey] as unknown as OM[FM][PKF]
    )) as unknown as ReactiveModel<OM[FM], PKF, any> | undefined
    this.value = instance
    if (this.value) {
      this.value.onChange(this.#boundNextRelatedChange)
      if (this.#boundNextRelatedDelta) {
        this.value.onDelta(this.#boundNextRelatedDelta)
      }
    }
    // Always emit property change for the relationship key
    emitter.nextRelatedChange(this.$key, this.value, previousValue)
    // Hook the foreign key watcher to update the relationship when the foreign key lookup value changes
    if (!this.#hasHookedForeignKeyWatcher) {
      this.#hasHookedForeignKeyWatcher = true
      this.#boundOnSwarmSaved = (model: string, primaryKey: string) => {
        if (
          model === makeReactiveModelName(this.$foreignModelTable) &&
          primaryKey === String(host[this.#foreignModelLookupKey])
        ) {
          onChangeDetected()
        }
      }
      this.#boundOnSwarmDeleted = (model: string, primaryKey: string) => {
        if (
          model === makeReactiveModelName(this.$foreignModelTable) &&
          primaryKey === String(host[this.#foreignModelLookupKey])
        ) {
          onChangeDetected()
        }
      }
      this.$swarm.on('reactivemodel:saved', this.#boundOnSwarmSaved)
      this.$swarm.on('reactivemodel:deleted', this.#boundOnSwarmDeleted)
      emitter.onPropertyChange(this.#foreignModelLookupKey, () => {
        this.value = undefined // Invalidate cache when FK changes
        onChangeDetected()
      })
    }
    return instance
  }

  async unref(): Promise<void> {
    // Remove event listeners from the value if it exists
    if (this.#hasHookedForeignKeyWatcher && this.value) {
      this.value.offChange(this.#boundNextRelatedChange!)
      this.value.offDelta(this.#boundNextRelatedDelta!)
    }

    // Remove specific swarm event listeners
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
