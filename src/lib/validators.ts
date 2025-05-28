import { default as joi } from 'joi'
import {
  BelongsTo,
  HasManyThrough,
  HasMany,
  HasOne,
  ManyToMany,
  MorphMany,
  MorphOne,
  MorphTo,
} from '@nhtio/web-re-active-record/relationships'
import type {
  WrapReactiveModelHook,
  WrapReactiveQueryCollectionHook,
  WrapReactiveQueryResultHook,
} from '../types'

/**
 * Custom validator for Dexie store schema
 */

const dexieKeyPathPattern = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/
const dexieCompoundPattern = new RegExp(
  // e.g. "[foo+bar.baz+qux]"
  '^\\[' + dexieKeyPathPattern.source + '(?:\\+' + dexieKeyPathPattern.source + ')*' + '\\]$'
)

export const dexieStoreSchema = joi.string().custom((value, helpers) => {
  const parts = value.split(',')
  if (parts.length === 0) {
    return helpers.error('any.required', { message: 'Schema must not be empty' })
  }

  for (const [i, trimmablePart] of parts.entries()) {
    const part = trimmablePart.trim()

    // --- Primary key (first entry) ---
    if (i === 0) {
      // 1) empty = hidden non-auto PK
      if (part === '') continue

      // 2) "++" = hidden auto-increment PK
      if (part === '++') continue

      // 3) "++keyPath" = auto-incremented PK
      if (part.startsWith('++') && dexieKeyPathPattern.test(part.slice(2))) continue

      // 4) "[a+b]" = compound PK
      if (dexieCompoundPattern.test(part)) continue

      // 5) "keyPath" = non-auto PK
      if (dexieKeyPathPattern.test(part)) continue

      return helpers.error('any.custom', {
        message: `Invalid primary key definition: "${part}"`,
      })
    }

    // --- Secondary indexes ---
    // 1) compound index "[a+b+c]"
    if (dexieCompoundPattern.test(part)) continue

    // 2) unique "&keyPath" or multi "*keyPath"
    if ((part.startsWith('&') || part.startsWith('*')) && dexieKeyPathPattern.test(part.slice(1))) {
      continue
    }

    // 3) normal index "keyPath"
    if (dexieKeyPathPattern.test(part)) continue

    return helpers.error('any.invalid', {
      message: `Invalid index definition: "${part}"`,
    })
  }

  return value
}, 'Dexie store schema validation')

type AnyRelationshipCtor =
  | typeof BelongsTo<any, any, any, any, any>
  | typeof HasMany<any, any, any, any, any>
  | typeof HasManyThrough<any, any, any, any, any, any, any, any>
  | typeof HasOne<any, any, any, any, any>
  | typeof ManyToMany<any, any, any, any, any, any, any, any>
  | typeof MorphTo<any, any, any, any, any, any>
  | typeof MorphOne<any, any, any, any, any, any>
  | typeof MorphMany<any, any, any, any, any, any>

/**
 * Custom validator for a single relationship‐configuration tuple.
 */
export const relationshipConfig = joi.array().custom((value, helpers) => {
  if (!Array.isArray(value) || value.length === 0) {
    return helpers.error('any.invalid', { message: 'Relationship must be a non‐empty array tuple' })
  }

  const [Ctor, ...rest] = value as [AnyRelationshipCtor, ...any[]]

  // only allow one of our relationship classes
  if (
    ![
      BelongsTo,
      HasMany,
      HasOne,
      ManyToMany,
      HasManyThrough,
      MorphTo,
      MorphOne,
      MorphMany,
    ].includes(Ctor)
  ) {
    return helpers.error('any.invalid', { message: `Unknown relationship type: ${String(Ctor)}` })
  }
  // @ts-ignore
  if ([BelongsTo, HasMany, HasOne].includes(Ctor)) {
    if (rest.length < 1 || rest.length > 2) {
      return helpers.error('any.invalid', { message: `${Ctor.name} expects 1 or 2 args` })
    }
    if (typeof rest[0] !== 'string') {
      return helpers.error('any.invalid', { message: `${Ctor.name} table name must be a string` })
    }
    if (rest[1] !== undefined && typeof rest[1] !== 'string') {
      return helpers.error('any.invalid', { message: `${Ctor.name} foreign-key must be a string` })
    }
    return value
  }
  if (Ctor === ManyToMany) {
    if (rest.length < 1 || rest.length > 5) {
      return helpers.error('any.invalid', { message: 'ManyToMany expects 1–5 args' })
    }
    if (typeof rest[0] !== 'string') {
      return helpers.error('any.invalid', { message: 'ManyToMany foreign-table must be a string' })
    }
    for (let i = 1; i < rest.length; i++) {
      if (typeof rest[i] !== 'string') {
        return helpers.error('any.invalid', { message: 'ManyToMany key args must be strings' })
      }
    }
    return value
  }
  if (Ctor === HasManyThrough) {
    if (rest.length !== 2) {
      return helpers.error('any.invalid', {
        message: 'HasManyThrough expects [Ctor, table, glueArray]',
      })
    }
    if (typeof rest[0] !== 'string') {
      return helpers.error('any.invalid', {
        message: 'HasManyThrough foreign-table must be a string',
      })
    }
    if (!Array.isArray(rest[1])) {
      return helpers.error('any.invalid', {
        message: 'HasManyThrough glue must be an array of tuples',
      })
    }
    for (const t of rest[1]) {
      const result = relationshipConfig.validate(t)
      if (result.error) {
        return helpers.error('any.invalid', {
          message: `Invalid glue entry: ${result.error.message}`,
        })
      }
    }
    return value
  }
  // @ts-ignore
  if ([MorphTo, MorphOne, MorphMany].includes(Ctor)) {
    if (rest.length !== 3) {
      return helpers.error('any.invalid', {
        message: `${Ctor.name} expects [Ctor, table, typeKey, idKey]`,
      })
    }
    if (typeof rest[0] !== 'string') {
      return helpers.error('any.invalid', { message: `${Ctor.name} target-table must be a string` })
    }
    if (typeof rest[1] !== 'string' || typeof rest[2] !== 'string') {
      return helpers.error('any.invalid', { message: `${Ctor.name} keys must be strings` })
    }
    return value
  }
  return helpers.error('any.invalid', { message: 'Unexpected relationship tuple shape' })
}, 'Relationship configuration validation')

export const hooksSchema = joi
  .object({
    wrapReactiveModel: joi.function().arity(1).optional(),
    wrapReactiveQueryCollection: joi.function().arity(1).optional(),
    wrapReactiveQueryResult: joi.function().arity(1).optional(),
  })
  .default({
    wrapReactiveModel: ((model: any) => model) as WrapReactiveModelHook<any, any, any, any>,
    wrapReactiveQueryCollection: ((collection: any) =>
      collection) as WrapReactiveQueryCollectionHook<any, any, any, any, any>,
    wrapReactiveQueryResult: ((result: any) => result) as WrapReactiveQueryResultHook<
      any,
      any,
      any,
      any,
      any
    >,
  })
