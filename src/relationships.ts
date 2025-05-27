/**
 * The relationships which can be defined for models
 * @module @nhtio/web-re-active-record/relationships
 */

export {
  BelongsTo,
  HasMany,
  HasManyThrough,
  HasOne,
  ManyToMany,
  MorphTo,
  MorphOne,
  MorphMany,
} from './lib/relationships'
export type {
  Relationship,
  RelationshipCtor,
  RelationshipConfiguration,
  ChainableRelationship,
  ChainableRelationshipConfiguration,
  BelongsToConfiguration,
  HasOneConfiguration,
  HasManyConfiguration,
  HasManyThroughConfiguration,
  ManyToManyConfiguration,
  MorphToConfiguration,
  MorphOneConfiguration,
  MorphManyConfiguration,
} from './lib/relationships'
