import { makeReactiveModelName } from '../utils'
import { RelationshipBase } from './abstract_class_relationship_base'
import { RelationshipNotBootedException } from '@nhtio/web-re-active-record/errors'
import type { PlainObject, StringKeyOf } from '../types'
import type { ReactiveModel } from '../factory_reactive_model'
import type { UnifiedEventBus } from '../class_unified_event_bus'
import type { ReactiveModelChangeEmitter } from '../class_reactive_model_change_emitter'

/**
 * The configuration for a {@link HasMany} relationship.
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
 *           posts: [HasMany, 'posts', 'user_id'], // [!code focus]
 *         }
 *       },
 *       posts: {
 *         schema: '++id, user_id, title, body',
 *         properties: ['id', 'user_id', 'title', 'body'],
 *       }
 *   },
 *   ...
 * }
 * ```
 */
export type HasManyConfiguration<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  FM extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FM]>,
> =
  | [typeof HasMany<OM, TM, PKT, FM, PKF>, FM, Omit<OM[TM], PKT>]
  | [typeof HasMany<OM, TM, PKT, FM, PKF>, FM, Omit<OM[TM], PKT>, PKT]
  | [typeof HasMany<OM, TM, PKT, FM, PKF>, FM, Omit<OM[TM], PKT>, PKT, PKF]

/**
 * Represents a one-to-many relationship between models where the ID of the originating model is stored as a property of the foreign model.
 *
 * @description
 * For example, a `user` has many `post`s:
 * ```mermaid
 * erDiagram
 *  direction LR
 *  users {
 *      number id PK
 *      string email
 *      string password
 *  }
 *
 *  posts {
 *      number id PK
 *      number user_id FK
 *      string title
 *      string body
 *  }
 *
 *  users || -- || posts: "user.id → profile.user_id"
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
 *           posts: [HasMany, 'posts', 'user_id'], // [!code focus]
 *         }
 *       },
 *       posts: {
 *         schema: '++id, user_id, title, body',
 *         properties: ['id', 'user_id', 'title', 'body'],
 *       }
 *   },
 *   ...
 * }
 * ```
 *
 * Which will then allow you to access all of the user's related posts using the `posts` accessor on the `user` model: `user.posts`.
 *
 * @remarks The inverse of this relationship is the {@link BelongsTo} relationship. Configured using the {@link HasManyConfiguration} tuple.
 *
 * @typeParam OM - the map of all models in the database
 * @typeParam TM - the table of the originating model
 * @typeParam PKT - the property used as the primary key in the originating model
 * @typeParam FM - the table of the foreign model
 * @typeParam PKF - the property used as the primary key in the foreign model
 */
export class HasMany<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  FM extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FM]>,
> extends RelationshipBase<
  ReactiveModel<OM[FM], PKF, any>[],
  OM,
  TM,
  PKT,
  FM,
  PKF,
  OM[TM],
  OM[FM]
> {
  readonly #originatingModelLookupKey: StringKeyOf<OM[TM]>
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
    if ('function' !== typeof this.#boundNextRelatedChange) {
      this.#boundNextRelatedChange = emitter.nextRelatedChange.bind(emitter, this.$key)
      this.#boundNextRelatedDelta = emitter.nextRelatedDelta.bind(emitter, this.$key)
      this.#boundOnRelatedDelta = (delta: any) => {
        if (
          this.#originatingModelLookupKey in delta &&
          'is' in delta[this.#originatingModelLookupKey] &&
          'was' in delta[this.#originatingModelLookupKey] &&
          (delta[this.#originatingModelLookupKey].is.toString() ===
            host[this.$originatingModelPrimaryKey].toString() ||
            delta[this.#originatingModelLookupKey].was.toString() ===
              host[this.$originatingModelPrimaryKey].toString())
        ) {
          onChangeDetected()
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
    if (this.#hasHookedForeignKeyWatcher && Array.isArray(previousValue)) {
      previousValue.forEach((instance) => {
        instance.offChange(this.#boundNextRelatedChange)
        instance.offDelta(this.#boundNextRelatedDelta)
        instance.offDelta(this.#boundOnRelatedDelta)
      })
    }
    if (!this.$foreignModelCtor) {
      throw new RelationshipNotBootedException()
    }
    const instances = await this.$foreignModelCtor.findManyBy(
      this.#originatingModelLookupKey as Extract<keyof OM[FM], string>,
      [host[this.$originatingModelPrimaryKey] as unknown as OM[FM][PKF]]
    )
    // @ts-ignore
    this.value = instances
    if (this.value) {
      this.value.forEach((instance) => {
        instance.onChange(this.#boundNextRelatedChange!)
        instance.onDelta(this.#boundNextRelatedDelta!)
        instance.onDelta(this.#boundOnRelatedDelta!)
      })
    }
    // Always emit property change for the relationship key
    emitter.nextRelatedChange(this.$key, this.value, previousValue)
    if (!this.#hasHookedForeignKeyWatcher) {
      this.#hasHookedForeignKeyWatcher = true
      this.#boundOnSwarmSaved = (model: string, _primaryKey: string, values: any) => {
        if (
          model === makeReactiveModelName(this.$foreignModelTable) &&
          String(values[this.#originatingModelLookupKey]) ===
            String(host[this.$originatingModelPrimaryKey])
        ) {
          onChangeDetected()
        } else if (model === makeReactiveModelName(this.$foreignModelTable)) {
          // Always trigger onChangeDetected for any save in the related table
          onChangeDetected()
        }
      }
      this.#boundOnSwarmDeleted = (model: string, _primaryKey: string) => {
        if (model === makeReactiveModelName(this.$foreignModelTable)) {
          onChangeDetected()
        }
      }
      this.$swarm.on('reactivemodel:saved', this.#boundOnSwarmSaved)
      this.$swarm.on('reactivemodel:deleted', this.#boundOnSwarmDeleted)
      this.$swarm.on('reactivemodel:truncated', this.#boundOnSwarmDeleted)
    }
    return instances
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

    // Remove specific swarm event listeners
    if (this.#boundOnSwarmSaved) {
      this.$swarm.off('reactivemodel:saved', this.#boundOnSwarmSaved)
    }
    if (this.#boundOnSwarmDeleted) {
      this.$swarm.off('reactivemodel:deleted', this.#boundOnSwarmDeleted)
      this.$swarm.off('reactivemodel:truncated', this.#boundOnSwarmDeleted)
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
