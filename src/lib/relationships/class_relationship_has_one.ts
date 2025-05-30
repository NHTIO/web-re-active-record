import { makeReactiveModelName } from '../utils'
import { RelationshipBase } from './abstract_class_relationship_base'
import { RelationshipNotBootedException } from '@nhtio/web-re-active-record/errors'
import type { PlainObject, StringKeyOf } from '../types'
import type { ReactiveModel } from '../factory_reactive_model'
import type { UnifiedEventBus } from '../class_unified_event_bus'
import type { ReactiveModelChangeEmitter } from '../class_reactive_model_change_emitter'

/**
 * The configuration for a {@link HasOne} relationship.
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
 *         properties: ['id', 'email', 'password'],
 *         primaryKey: 'id',
 *         relationships: {
 *           profile: [HasOne, 'profiles', 'user_id'], // [!code focus]
 *         }
 *       },
 *       profiles: {
 *         schema: '++id, user_id, full_name, avatar_url',
 *         properties: ['id', 'user_id', 'full_name', 'avatar_url'],
 *       }
 *   },
 *   ...
 * }
 * ```
 */
export type HasOneConfiguration<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  FM extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FM]>,
> =
  | [typeof HasOne<OM, TM, PKT, FM, PKF>, FM, Omit<OM[TM], PKT>]
  | [typeof HasOne<OM, TM, PKT, FM, PKF>, FM, Omit<OM[TM], PKT>, PKT]
  | [typeof HasOne<OM, TM, PKT, FM, PKF>, FM, Omit<OM[TM], PKT>, PKT, PKF]

/**
 * Represents a one-to-one relationship between two models where the ID of the originating model is stored as a property of the foreign model.
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
 *  users || -- || profiles: "user.id → profile.user_id"
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
 *         properties: ['id', 'email', 'password'],
 *         primaryKey: 'id',
 *         relationships: {
 *           profile: [HasOne, 'profiles', 'user_id'], // [!code focus]
 *         }
 *       },
 *       profiles: {
 *         schema: '++id, user_id, full_name, avatar_url',
 *         properties: ['id', 'user_id', 'full_name', 'avatar_url'],
 *       }
 *   },
 *   ...
 * }
 * ```
 *
 * Which will then allow you to access the profile of a user from the `profile` accessor on the `user` model: `user.profile`.
 *
 * @remarks The inverse of this relationship is the {@link BelongsTo} relationship. Configured using the {@link HasOneConfiguration} tuple.
 *
 * @typeParam OM - the map of all models in the database
 * @typeParam TM - the table of the originating model
 * @typeParam PKT - the property used as the primary key in the originating model
 * @typeParam FM - the table of the foreign model
 * @typeParam PKF - the property used as the primary key in the foreign model
 */
export class HasOne<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  FM extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FM]>,
> extends RelationshipBase<ReactiveModel<OM[FM], PKF, any>, OM, TM, PKT, FM, PKF, OM[TM], OM[FM]> {
  readonly #originatingModelLookupKey: StringKeyOf<OM[TM]>
  #hasHookedForeignKeyWatcher: boolean
  #boundNextRelatedChange?: (is: any, was: any) => void
  #boundNextRelatedDelta?: (delta: any) => void
  #boundOnRelatedDelta?: (delta: any) => void
  #boundOnSwarmSaved?: (model: string, _primaryKey: string) => void
  #boundOnSwarmDeleted?: (model: string) => void

  /** @private */
  constructor(
    key: string,
    swarm: UnifiedEventBus,
    originatingModelTable: TM,
    originatingModelPrimaryKey: PKT,
    foreignModelTable: FM,
    foreignModelPrimaryKey: PKF,
    originatingModelLookupKey: StringKeyOf<OM[TM]>
  ) {
    super(
      key,
      swarm,
      originatingModelTable,
      originatingModelPrimaryKey,
      foreignModelTable,
      foreignModelPrimaryKey
    )
    this.#originatingModelLookupKey = originatingModelLookupKey
    this.#hasHookedForeignKeyWatcher = false
  }

  static #preparing = new WeakSet<any>()
  // @ts-ignore
  async prepare(
    host: ReactiveModel<OM[TM], PKT, any>,
    emitter: ReactiveModelChangeEmitter<OM[TM], PKT, any>,
    onChangeDetected?: () => void
  ) {
    if (HasOne.#preparing.has(host)) return this.value
    HasOne.#preparing.add(host)
    try {
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
            this.#originatingModelLookupKey in delta &&
            'is' in delta[this.#originatingModelLookupKey] &&
            'was' in delta[this.#originatingModelLookupKey] &&
            (delta[this.#originatingModelLookupKey].is?.toString() ===
              host[this.$originatingModelPrimaryKey]?.toString() ||
              delta[this.#originatingModelLookupKey].was?.toString() ===
                host[this.$originatingModelPrimaryKey]?.toString())
          ) {
            onChangeDetected!()
          }
        }
      }
      // Store previous value for change event
      let previousValue: typeof this.value | undefined
      try {
        previousValue = this.value
      } catch (e) {
        previousValue = undefined
      }
      // Always remove listeners from the old value if present
      if (this.#hasHookedForeignKeyWatcher && typeof previousValue !== 'undefined') {
        previousValue.offChange(this.#boundNextRelatedChange)
        previousValue.offDelta(this.#boundNextRelatedDelta)
        previousValue.offDelta(this.#boundOnRelatedDelta)
        previousValue.offPropertyChange(this.#originatingModelLookupKey, onChangeDetected!)
      }
      if (!this.$foreignModelCtor) {
        throw new RelationshipNotBootedException()
      }
      const instance = await this.$foreignModelCtor.findBy(
        this.#originatingModelLookupKey as Extract<keyof OM[FM], string>,
        host[this.$originatingModelPrimaryKey] as unknown as OM[FM][PKF]
      )
      // @ts-ignore
      this.value = instance
      // Attach listeners to the new value if present
      if (this.value) {
        this.value.onChange(this.#boundNextRelatedChange!)
        this.value.onDelta(this.#boundNextRelatedDelta!)
        this.value.onDelta(this.#boundOnRelatedDelta!)
        this.value.onPropertyChange(this.#originatingModelLookupKey, onChangeDetected!)
      }
      // Always emit property change for the relationship key
      emitter.nextRelatedChange(this.$key, this.value, previousValue)
      // Always hook the foreign key watcher (only once per host instance)
      if (!this.#hasHookedForeignKeyWatcher) {
        this.#hasHookedForeignKeyWatcher = true
        this.#boundOnSwarmSaved = async (model: string, _primaryKey: string) => {
          if (model === makeReactiveModelName(this.$foreignModelTable)) {
            // Always re-prepare and emit change if the related table is affected
            await this.prepare(host, emitter, () => {
              emitter.nextRelatedChange(this.$key, this.value, undefined)
            })
          }
        }
        this.#boundOnSwarmDeleted = async (model: string) => {
          if (model === makeReactiveModelName(this.$foreignModelTable)) {
            // Always re-prepare and emit change if the related table is affected
            await this.prepare(host, emitter, () => {
              emitter.nextRelatedChange(this.$key, this.value, undefined)
            })
          }
        }
        this.$swarm.on('reactivemodel:saved', this.#boundOnSwarmSaved)
        this.$swarm.on('reactivemodel:deleted', this.#boundOnSwarmDeleted)
        this.$swarm.on('reactivemodel:truncated', this.#boundOnSwarmDeleted)
        // Listen for changes to the host's primary key
        emitter.onPropertyChange(this.$originatingModelPrimaryKey, () => {
          onChangeDetected!()
        })
      }
      return instance
    } finally {
      HasOne.#preparing.delete(host)
    }
  }

  async unref(): Promise<void> {
    // Remove event listeners from the value if it exists
    if (this.#hasHookedForeignKeyWatcher && this.value) {
      this.value.offChange(this.#boundNextRelatedChange!)
      this.value.offDelta(this.#boundNextRelatedDelta!)
      this.value.offDelta(this.#boundOnRelatedDelta!)
    }

    // Remove specific swarm event listeners
    if (this.#boundOnSwarmSaved) {
      this.$swarm.off('reactivemodel:saved', this.#boundOnSwarmSaved)
    }
    if (this.#boundOnSwarmDeleted) {
      this.$swarm.off('reactivemodel:deleted', this.#boundOnSwarmDeleted)
      this.$swarm.off('reactivemodel:truncated', this.#boundOnSwarmDeleted)
    }
    // Remove related table listeners (legacy patch, not needed)
    // this.#boundOnRelatedTableChange = undefined
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
