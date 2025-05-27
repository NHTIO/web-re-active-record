import { HasMany } from './class_relationship_has_many'
import { BelongsTo } from './class_relationship_belongs_to'
import { HasManyThrough } from './class_relationship_has_many_through'
import type { PlainObject, StringKeyOf } from '../types'
import type { UnifiedEventBus } from '../class_unified_event_bus'
import type { ChainableRelationshipConfiguration } from './abstract_class_relationship_base'

/**
 * The configuration for a {@link ManyToMany} relationship.
 * @typeParam OM - the map of all models in the database
 * @typeParam TM - the table of the originating model
 * @typeParam PKT - the property used as the primary key in the originating model
 * @typeParam FM - the table of the foreign model
 * @typeParam PKF - the property used as the primary key in the foreign model
 * @typeParam JM - the table of the join model
 * @typeParam JPKT - the property used as the foreign key in the join model that references the originating model
 * @typeParam JPKF - the property used as the foreign key in the join model that references the foreign model
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
 *          skills: [ManyToMany, 'skills', 'user_skills', 'user_id', 'skill_id'], // [!code focus]
 *         }
 *       },
 *       skills: {
 *         schema: '++id, name',
 *         properties: ['id', 'name'],
 *         relationships: {
 *          users: [ManyToMany, 'users'], // [!code focus]
 *         }
 *       }
 *       user_skills: {
 *         schema: '++id, user_id, skill_id, notes',
 *         properties: ['id', 'user_id', 'skill_id', 'notes'],
 *       }
 *   },
 *   ...
 * }
 * ```
 */
export type ManyToManyConfiguration<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  JM extends StringKeyOf<OM>,
  JPKT extends StringKeyOf<OM[JM]>,
  JPKF extends StringKeyOf<OM[JM]>,
  FM extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FM]>,
> =
  | [typeof ManyToMany<OM, TM, PKT, JM, JPKT, JPKF, FM, PKF>, FM]
  | [typeof ManyToMany<OM, TM, PKT, JM, JPKT, JPKF, FM, PKF>, FM, JM]
  | [typeof ManyToMany<OM, TM, PKT, JM, JPKT, JPKF, FM, PKF>, FM, JM, JPKT]
  | [typeof ManyToMany<OM, TM, PKT, JM, JPKT, JPKF, FM, PKF>, FM, JM, JPKT, JPKF]
  | [typeof ManyToMany<OM, TM, PKT, JM, JPKT, JPKF, FM, PKF>, FM, JM, JPKT, JPKF, PKF]
  | [typeof ManyToMany<OM, TM, PKT, JM, JPKT, JPKF, FM, PKF>, FM, JM, JPKT, JPKF, PKF, PKT]

/**
 * Represents a many-to-many relationship between models where the IDs of both models are stored in a join table (pivot table).
 *
 * @description
 * For example, a `user` has many `skill`s, and a skill can be associated with many `user`s.
 * ```mermaid
 * erDiagram
 *  direction LR
 *  users {
 *      number id PK
 *      string email
 *      string password
 *  }
 *
 *  skills {
 *      number id PK
 *      string name
 *  }
 *
 * user_skills {
 *     number id PK
 *     number user_id FK
 *     number skill_id FK
 *     string notes
 * }
 *
 *  users || -- || user_skills: "user.id → user_skills.user_id"
 *  skills || -- || user_skills: "skills.id → user_skills.skill_id"
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
 *          skills: [ManyToMany, 'skills', 'user_skills', 'user_id', 'skill_id'], // [!code focus]
 *         }
 *       },
 *       skills: {
 *         schema: '++id, name',
 *         properties: ['id', 'name'],
 *         relationships: {
 *          users: [ManyToMany, 'users'], // [!code focus]
 *         }
 *       }
 *       user_skills: {
 *         schema: '++id, user_id, skill_id, notes',
 *         properties: ['id', 'user_id', 'skill_id', 'notes'],
 *       }
 *   },
 *   ...
 * }
 * ```
 *
 * Which will then allow you to access :
 * - all of the user's related skill using the `skills` accessor on the `user` model: `user.skills`.
 * - all of the skills's related users using the `users` accessor on the `skill` model: `skill.users`.
 *
 * @remarks Configured using the {@link ManyToManyConfiguration} tuple.
 *
 * @typeParam OM - the map of all models in the database
 * @typeParam TM - the table of the originating model
 * @typeParam PKT - the property used as the primary key in the originating model
 * @typeParam FM - the table of the foreign model
 * @typeParam PKF - the property used as the primary key in the foreign model
 * @typeParam JM - the table of the join model
 * @typeParam JPKT - the property used as the foreign key in the join model that references the originating model
 * @typeParam JPKF - the property used as the foreign key in the join model that references the foreign model
 */
export class ManyToMany<
  OM extends Record<string, PlainObject>,
  TM extends StringKeyOf<OM>,
  PKT extends StringKeyOf<OM[TM]>,
  JM extends StringKeyOf<OM>,
  JPKT extends StringKeyOf<OM[JM]>,
  JPKF extends StringKeyOf<OM[JM]>,
  FM extends StringKeyOf<OM>,
  PKF extends StringKeyOf<OM[FM]>,
> extends HasManyThrough<OM, TM, PKT, FM, PKF, JM, JPKT, JPKF> {
  readonly #joinTable: JM
  #hasJoinTableListener = false

  constructor(
    key: string,
    swarm: UnifiedEventBus,
    ownerTable: TM,
    ownerPK: PKT,
    pivotTable: JM,
    pivotOwnerFK: JPKT,
    pivotTargetFK: JPKF,
    targetTable: FM,
    targetPK: PKF
  ) {
    const glue = [
      [HasMany, pivotTable, pivotOwnerFK],
      [BelongsTo, targetTable, pivotTargetFK, targetPK],
    ]
    super(
      key,
      swarm,
      ownerTable,
      ownerPK,
      targetTable,
      targetPK,
      glue as ChainableRelationshipConfiguration[]
    )
    this.#joinTable = pivotTable
  }

  async prepare(host: any, emitter: any, onChangeDetected?: () => void): Promise<any[]> {
    // Wrap onChangeDetected to re-prepare on join table change
    const self = this
    let wrappedOnChange: (() => void) | undefined = onChangeDetected
    if (this.#joinTable && this.$swarm) {
      wrappedOnChange = function () {
        // Re-run prepare to update the accessor and emit property change
        self.prepare(host, emitter, onChangeDetected).catch(() => {
          self.value = undefined
        })
        if (typeof onChangeDetected === 'function') {
          onChangeDetected()
        }
      }
    }
    const result = await super.prepare(host, emitter, wrappedOnChange)
    const intermediaries = this.$intermediaries
    if (intermediaries && intermediaries[0]) {
      const joinRel = intermediaries[0]
      if (typeof joinRel.prepare === 'function') {
        await joinRel.prepare(host, emitter, wrappedOnChange)
      }
      // Subscribe to join table events if not already
      if (!this.#hasJoinTableListener) {
        if (this.#joinTable && this.$swarm) {
          this.#hasJoinTableListener = true
          this.$swarm.on('reactivemodel:saved', (model: string) => {
            if (model === this.#joinTable && typeof wrappedOnChange === 'function') {
              wrappedOnChange()
            }
          })
          this.$swarm.on('reactivemodel:deleted', (model: string) => {
            if (model === this.#joinTable && typeof wrappedOnChange === 'function') {
              wrappedOnChange()
            }
          })
        }
      }
    }
    return result
  }
}
