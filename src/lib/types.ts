import { HasOne } from './relationships/class_relationship_has_one'
import { HasMany } from './relationships/class_relationship_has_many'
import { MorphTo } from './relationships/class_relationship_morph_to'
import { MorphOne } from './relationships/class_relationship_morph_one'
import { BelongsTo } from './relationships/class_relationship_belongs_to'
import { MorphMany } from './relationships/class_relationship_morph_many'
import { ManyToMany } from './relationships/class_relationship_many_to_many'
import { HasManyThrough } from './relationships/class_relationship_has_many_through'
import type { Serializable } from '@nhtio/web-serialization'
import type { Dexie, EntityTable, ObservabilitySet } from 'dexie'
import type { TypedEventMap as SwarmEventMap } from '@nhtio/swarm/types'
import type { RelationshipConfiguration } from './relationships/abstract_class_relationship_base'

type EntityTables<T extends Record<string, any>> = {
  [K in keyof T]: EntityTable<T[K]>
}

export type ReActiveDatabaseDexie<T extends BaseObjectMap> = Dexie & EntityTables<T>

export interface ReactiveStateTypedEventMap extends SwarmEventMap {
  /** model, primary key, values */
  'reactivemodel:saved': [string, string, Serializable]
  /** model, primary key */
  'reactivemodel:deleted': [string, string]
  /** model */
  'reactivemodel:truncated': [string]
  /** part */
  'reactivedatabase:storagemutated': [ObservabilitySet]
}

/**
 * The base model type.
 */
export interface BaseModel {}

/**
 * The shape of the default object map for the ReactiveDatabase.
 * @remarks This should be replaced with the actual object map for your application.
 */
export interface DefaultObjectMap {
  [key: string]: PlainObject
}

export type IsStrictlyAny<T> = (T extends never ? true : false) extends false ? false : true

export type NonMethodKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K
}[keyof T]

export type OnlyMethodKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never
}[keyof T]

/**
 * The shape of the data properties for a model.
 * @interface
 */
export type DataProps<T> = Pick<T, NonMethodKeys<T>>

/**
 * Describes a non-class, non-null, non-function object which can be used
 * as the properties of a model.
 */
export type PlainObject = Record<string, unknown>

/**
 * The shape of the non-primary key properties for a model.
 */
export type DataValues<T extends PlainObject, PK extends keyof T> = Pick<
  T,
  Exclude<NonMethodKeys<T>, PK>
>

export interface BaseObjectMap {
  [key: string]: PlainObject
}

/**
 * Helper types for each relationship configuration tuple
 */
export type HasOneValue<T> = T extends [typeof HasOne<any, any, any, any, any>, ...any[]]
  ? ReturnType<HasOne<any, any, any, any, any>['prepare']> extends Promise<infer V>
    ? V
    : unknown
  : never
export type BelongsToValue<T> = T extends [typeof BelongsTo<any, any, any, any, any>, ...any[]]
  ? ReturnType<BelongsTo<any, any, any, any, any>['prepare']> extends Promise<infer V>
    ? V
    : unknown
  : never
export type HasManyValue<T> = T extends [typeof HasMany<any, any, any, any, any>, ...any[]]
  ? ReturnType<HasMany<any, any, any, any, any>['prepare']> extends Promise<infer V>
    ? V
    : unknown
  : never
export type ManyToManyValue<T> = T extends [
  typeof ManyToMany<any, any, any, any, any, any, any, any>,
  ...any[],
]
  ? ReturnType<ManyToMany<any, any, any, any, any, any, any, any>['prepare']> extends Promise<
      infer V
    >
    ? V
    : unknown
  : never
export type MorphToValue<T> = T extends [typeof MorphTo<any, any, any, any, any, any>, ...any[]]
  ? ReturnType<MorphTo<any, any, any, any, any, any>['prepare']> extends Promise<infer V>
    ? V
    : unknown
  : never
export type MorphOneValue<T> = T extends [typeof MorphOne<any, any, any, any, any, any>, ...any[]]
  ? ReturnType<MorphOne<any, any, any, any, any, any>['prepare']> extends Promise<infer V>
    ? V
    : unknown
  : never
export type MorphManyValue<T> = T extends [typeof MorphMany<any, any, any, any, any, any>, ...any[]]
  ? ReturnType<MorphMany<any, any, any, any, any, any>['prepare']> extends Promise<infer V>
    ? V
    : unknown
  : never
export type HasManyThroughValue<T> = T extends [
  typeof HasManyThrough<any, any, any, any, any, any, any, any>,
  ...any[],
]
  ? ReturnType<HasManyThrough<any, any, any, any, any, any, any, any>['prepare']> extends Promise<
      infer V
    >
    ? V
    : unknown
  : never

export type RelationshipValueType<RC> =
  HasOneValue<RC> extends never
    ? BelongsToValue<RC> extends never
      ? HasManyValue<RC> extends never
        ? ManyToManyValue<RC> extends never
          ? HasManyThroughValue<RC> extends never
            ? MorphToValue<RC> extends never
              ? MorphOneValue<RC> extends never
                ? MorphManyValue<RC> extends never
                  ? unknown
                  : MorphManyValue<RC>
                : MorphOneValue<RC>
              : MorphToValue<RC>
            : HasManyThroughValue<RC>
          : ManyToManyValue<RC>
        : HasManyValue<RC>
      : BelongsToValue<RC>
    : HasOneValue<RC>

/**
 * Maps all relationships to their value types.
 */
export type RelatedValueMap<R extends Record<string, RelationshipConfiguration>> = {
  [K in keyof R]: RelationshipValueType<R[K]>
}

/**
 * Utility type to get string keys of an object type.
 */
export type StringKeyOf<T> = Extract<keyof T, string>
