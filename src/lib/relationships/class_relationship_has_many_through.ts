import { guessJoinTableName, guessForeignKeyName } from '../utils'
import { RelationshipBase } from './abstract_class_relationship_base'
import { ManyToMany } from '@nhtio/web-re-active-record/relationships'
import {
  RelationshipNotBootedException,
  MissingGlueException,
} from '@nhtio/web-re-active-record/errors'
import type { PlainObject, StringKeyOf } from '../types'
import type { ReactiveModel } from '../factory_reactive_model'
import type { UnifiedEventBus } from '../class_unified_event_bus'
import type { ReactiveDatabase } from '../class_reactive_database'
import type { ReactiveModelChangeEmitter } from '../class_reactive_model_change_emitter'
import type {
  ChainableRelationship,
  ChainableRelationshipConfiguration,
  BelongsTo,
  HasMany,
  HasOne,
} from '@nhtio/web-re-active-record/relationships'

/**
 * The configuration for a {@link HasManyThrough} relationship.
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
 *           comments: [HasMany, 'comments', 'user_id'], // [!code focus]
 *           commentors: [HasManyThrough, [  // [!code focus]
 *             [HasMany, 'posts', 'user_id'], // [!code focus]
 *             [HasMany, 'comments', 'post_id'], // [!code focus]
 *             [BelongsTo, 'users', 'user_id'], // [!code focus]
 *           ]]  // [!code focus]
 *         }
 *       },
 *       posts: {
 *         schema: '++id, user_id, title, body',
 *         properties: ['id', 'user_id', 'title', 'body'],
 *         relationships: {
 *           comments: [HasMany, 'comments', 'post_id'], // [!code focus]
 *         }
 *       }
 *       comments: {
 *         schema: '++id, post_id, user_id, body',
 *         properties: ['id', 'post_id', 'user_id', 'body'],
 *         relationships: {
 *          user: [BelongsTo, 'users', 'user_id'], // [!code focus]
 *         }
 *       }
 *   },
 *   ...
 * }
 * ```
 */
export type HasManyThroughConfiguration<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  FM extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FM]>,
  JM extends StringKeyOf<OM>,
  JPKT extends StringKeyOf<OM[JM]>,
  JPKF extends StringKeyOf<OM[JM]>,
> = [
  typeof HasManyThrough<OM, TM, PKT, FM, PKF, JM, JPKT, JPKF>,
  FM,
  Array<ChainableRelationshipConfiguration>,
]

/**
 * Represents a one-to-many relationship between models where the ID of the originating model is stored as a property of one or many "glue" models which connect to the foreign model.
 *
 * @description
 * For example, a `user` has many `post`s, which has many `comment`s which has many `user`s:
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
 * comments {
 *     number id PK
 *     number post_id FK
 *     number user_id FK
 *     string body
 * }
 *
 *  users || -- || posts: "user.id → profile.user_id"
 *  posts || -- || comments: "post.id → comment.post_id"
 *  comments || -- || users: "comment.user_id → user.id"
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
 *           comments: [HasMany, 'comments', 'user_id'], // [!code focus]
 *           commentors: [HasManyThrough, [  // [!code focus]
 *             [HasMany, 'posts', 'user_id'], // [!code focus]
 *             [HasMany, 'comments', 'post_id'], // [!code focus]
 *             [BelongsTo, 'users', 'user_id'], // [!code focus]
 *           ]]  // [!code focus]
 *         }
 *       },
 *       posts: {
 *         schema: '++id, user_id, title, body',
 *         properties: ['id', 'user_id', 'title', 'body'],
 *         relationships: {
 *           comments: [HasMany, 'comments', 'post_id'], // [!code focus]
 *         }
 *       }
 *       comments: {
 *         schema: '++id, post_id, user_id, body',
 *         properties: ['id', 'post_id', 'user_id', 'body'],
 *         relationships: {
 *          user: [BelongsTo, 'users', 'user_id'], // [!code focus]
 *         }
 *       }
 *   },
 *   ...
 * }
 * ```
 *
 * Which will then allow you to access all of the user's related commentors using the `commentors` accessor on the `user` model: `user.commentors`.
 *
 * @remarks Configured using the {@link HasManyThroughConfiguration} tuple.
 *
 * @typeParam OM - the map of all models in the database
 * @typeParam TM - the table of the originating model
 * @typeParam PKT - the property used as the primary key in the originating model
 * @typeParam FM - the table of the foreign model
 * @typeParam PKF - the property used as the primary key in the foreign model
 */
export class HasManyThrough<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  FM extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FM]>,
  JM extends StringKeyOf<OM>,
  JPKT extends StringKeyOf<OM[JM]>,
  JPKF extends StringKeyOf<OM[JM]>,
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
  readonly #glue: ChainableRelationshipConfiguration[]
  readonly #intermediaries: ChainableRelationship[]
  #boundNextRelatedChange?: (is: any, was: any) => void
  #boundNextRelatedDelta?: (delta: any) => void
  #hasHookedForeignKeyWatcher = false

  /** @private */
  constructor(
    key: string,
    swarm: UnifiedEventBus,
    originatingModelTable: TM,
    originatingModelPrimaryKey: PKT,
    foreignModelTable: FM,
    foreignModelPrimaryKey: PKF,
    glue: ChainableRelationshipConfiguration[]
  ) {
    if (glue.length <= 0) {
      throw new MissingGlueException()
    }
    super(
      key,
      swarm,
      originatingModelTable,
      originatingModelPrimaryKey,
      foreignModelTable,
      foreignModelPrimaryKey
    )
    this.#glue = glue
    this.#intermediaries = []
  }

  protected get $intermediaries() {
    return [...this.#intermediaries]
  }

  override boot(database: ReactiveDatabase<OM>) {
    super.boot(database)
    let originatingModelTable: any = this.$originatingModelTable
    for (const tuple of this.#glue) {
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
          typeof ManyToMany<OM, TM, PKT, JM, JPKT, JPKF, FM, PKF>,
          any,
          any,
          any,
          any,
          any,
          any,
        ]
        const pk: any = potentialPrimaryKeyForTarget || 'id'
        const fk: any = potentialPimaryKeyForOriginating || 'id'
        const jt: any =
          potentialJoinTable || guessJoinTableName(originatingModelTable, this.$foreignModelTable)
        const jtfko =
          potentialJoinTableForeignKeyForOriginating ||
          guessForeignKeyName(originatingModelTable, pk)
        const jtfkf =
          potentialJoinTableForeignKeyForTarget || guessForeignKeyName(this.$foreignModelTable, fk)
        const relationship = new ctor(
          'virtual',
          this.$swarm,
          originatingModelTable,
          pk,
          jt,
          jtfko,
          jtfkf,
          this.$foreignModelTable,
          fk
        )
        relationship.boot(database)
        this.#intermediaries.push(relationship)
        originatingModelTable = foreignTable
      } else {
        const [ctor, table, lookup, ppk, pfk] = tuple as [
          (
            | typeof BelongsTo<OM, TM, PKT, FM, PKF>
            | typeof HasMany<OM, TM, PKT, FM, PKF>
            | typeof HasManyThrough<OM, TM, PKT, FM, PKF, JM, JPKT, JPKF>
            | typeof HasOne<OM, TM, PKT, FM, PKF>
          ),
          any,
          any,
          any,
          any,
        ]
        // @ts-ignore
        const pk: any = ppk || 'id'
        const fk: any = pfk || 'id'
        const relationship = new ctor(
          'virtual',
          this.$swarm,
          originatingModelTable,
          pk,
          table,
          fk,
          lookup as any
        )
        relationship.boot(database)
        this.#intermediaries.push(relationship)
        originatingModelTable = table
      }
    }
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
    if (this.#intermediaries.length === 0) {
      throw new RelationshipNotBootedException()
    }
    if ('function' !== typeof this.#boundNextRelatedChange) {
      this.#boundNextRelatedChange = emitter.nextRelatedChange.bind(emitter, this.$key)
      this.#boundNextRelatedDelta = emitter.nextRelatedDelta.bind(emitter, this.$key)
    }
    if (this.#hasHookedForeignKeyWatcher && Array.isArray(this.value)) {
      this.value.forEach((item) => {
        item.offChange(this.#boundNextRelatedChange)
        item.offDelta(this.#boundNextRelatedDelta)
      })
    }
    const firstRel = this.#intermediaries[0]!
    await firstRel.prepare(host, emitter, () => onChangeDetected())
    let current = firstRel.value
      ? Array.isArray(firstRel.value)
        ? firstRel.value
        : [firstRel.value]
      : []
    for (let i = 1; i < this.#intermediaries.length; i++) {
      const rel = this.#intermediaries[i]
      const next: ReactiveModel<OM[FM], PKF, any>[] = []
      for (const item of current) {
        await rel.prepare(item as any, emitter, () => onChangeDetected())
        const v = rel.value
        if (Array.isArray(v)) {
          next.push(...v)
        } else if (typeof v !== 'undefined') {
          next.push(v)
        }
      }
      current = next
    }
    // Store previous value for change event
    let previousValue: typeof this.value | undefined
    try {
      previousValue = this.value
    } catch (e) {
      previousValue = undefined
    }
    this.value = current
    // Always emit property change for the relationship key after updating value
    emitter.nextRelatedChange(this.$key, this.value, previousValue)
    // Defensive: only attach listeners if value is a non-empty array
    if (!this.#hasHookedForeignKeyWatcher) {
      this.#hasHookedForeignKeyWatcher = true
      if (Array.isArray(this.value) && this.value.length > 0) {
        this.value.forEach((item) => {
          item.onChange(this.#boundNextRelatedChange!)
          item.onDelta(this.#boundNextRelatedDelta!)
        })
      }
    }
    return current
  }

  async unref(): Promise<void> {
    // Remove event listeners from each model in the array if they exist
    if (this.#hasHookedForeignKeyWatcher && Array.isArray(this.value) && this.value.length > 0) {
      this.value.forEach((item) => {
        if (item && typeof item.offChange === 'function') {
          item.offChange(this.#boundNextRelatedChange!)
          item.offDelta(this.#boundNextRelatedDelta!)
        }
      })
    }

    // Unref all intermediary relationships
    for (const intermediary of this.#intermediaries) {
      await intermediary.unref()
    }

    // Reset state
    this.#hasHookedForeignKeyWatcher = false
    this.#boundNextRelatedChange = undefined
    this.#boundNextRelatedDelta = undefined
    this.value = undefined
  }
}
