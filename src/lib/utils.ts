import { default as joi } from 'joi'
import { default as slug } from 'slugify'
import { default as pluralize, plural, singular, isPlural, isSingular } from 'pluralize'
import {
  noCase,
  dotCase,
  kebabCase as dashCase,
  camelCase,
  snakeCase,
  capitalCase as titleCase,
  pascalCase,
  capitalCase,
  sentenceCase,
} from 'change-case'
import type {
  ReActiveRecordValidationError,
  ExtendedReActiveRecordValidationErrorConstructor,
} from '@nhtio/web-re-active-record/errors'

const string = {
  noCase,
  dotCase,
  dashCase,
  camelCase,
  snakeCase,
  titleCase,
  pascalCase,
  capitalCase,
  sentenceCase,
  slug,
  pluralize,
  plural,
  singular,
  isPlural,
  isSingular,
  /**
   * Generates cryptographically safe, URL safe random string of a given size
   */
  random(size: number): string {
    const cryptoObj =
      (typeof globalThis !== 'undefined' && (globalThis as any).crypto) ||
      (typeof self !== 'undefined' && (self as any).crypto)
    if (!cryptoObj?.getRandomValues) {
      throw new Error('Secure random number generator not available.')
    }
    const bytesNeeded = Math.ceil((size * 3) / 4)
    const buf = new Uint8Array(bytesNeeded)
    cryptoObj.getRandomValues(buf)
    let binary = ''
    for (const element of buf) {
      binary += String.fromCharCode(element)
    }
    const b64 = globalThis.btoa(binary)
    const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return b64url.substring(0, size)
  },
}

/**
 * Converts a sematic versioning string to an integer.
 * @param semver - A semver string, e.g. "1.2.3"
 * @returns - An integer representation of the semver
 */
export const semverToInt = (semver: string): number => {
  const [major, minor, patch] = semver.split('.').map(Number)
  return (major << 16) | (minor << 8) | patch
}

export const enforceType = <T>(value: unknown, schema: joi.Schema): T | joi.ValidationError => {
  const { error, value: validatedValue } = schema.validate(value, {
    abortEarly: false,
  })
  if (error) {
    return error
  }
  return validatedValue as T
}

export const enforceTypeOrThrow = <T, E extends ReActiveRecordValidationError>(
  value: unknown,
  schema: joi.Schema,
  error: ExtendedReActiveRecordValidationErrorConstructor<E>
): T | never => {
  const res = enforceType(value, schema)
  if (res instanceof joi.ValidationError) {
    throw new error(res)
  }
  return res as T
}

export { string }

/**
 * Creates a reactive model name from a given name.
 * @param name - The name of the model
 * @returns - The name of the reactive model
 *
 * @example
 *
 * `"Example" => "ReactiveExample"`
 * `"MyModel" => "ReactiveMyModel"`
 */
export const makeReactiveModelName = (name: string): string => {
  const parts = ['Reactive', name]
  return string.pascalCase(parts.join(' '))
}

/**
 * Creates a join table name from two model names.
 * @param modelA The name of the first model table
 * @param modelB The name of the second model table
 * @returns The name of the join table
 *
 * @example
 *
 * `"User", "Post"` => `"user_posts"`
 * `"Product", "Category"` => `"product_categories"`
 * `"Order", "Item"` => `"order_items"`
 * `"UserMeta", "User"` => `"user_meta_users"`
 */
export const guessJoinTableName = (modelA: string, modelB: string): string => {
  const names = [modelA, modelB].map((n) => string.snakeCase(n))
  string.pluralize(names[1])
  return names.join('_')
}

/**
 * Creates a foreign key name from a model name and a primary key.
 * @param model The name of the foreign model table
 * @param primaryKey The name of the primary key in the originating model
 * @returns The name of the foreign key
 *
 * @example
 *
 * `"User", "id"` => `"user_id"`
 * `"Product", "id"` => `"product_id"`
 * `"Order", "order_id"` => `"order_order_id"`
 * `"UserMeta", "id"` => `"user_meta_id"`
 */
export const guessForeignKeyName = (model: string, primaryKey: string): string => {
  const parts = [model, primaryKey]
  string.singular(parts[0])
  return string.snakeCase(parts.join('_'))
}

/**
 * Retrieves the global object in the current environment.
 * @returns The global object in the current environment.
 */
export const getGlobal = () => {
  if (typeof globalThis !== 'undefined') {
    return globalThis
  } else if (typeof global !== 'undefined') {
    return global
  } else if (typeof window !== 'undefined') {
    return window
  }
}

/**
 * Checks if the value is an object.
 * @param value - The value to check
 * @returns - True if the value is an object, false otherwise
 */
export const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Checks if the value can be compared quantitatively (i.e. >, <, >=, <=).
 * @param value - The value to check
 * @returns - True if the value is a string, number, or Date object
 */
export const isQuantitivlyComparable = (value: unknown): value is number | string | Date => {
  return (
    typeof value === 'number' ||
    typeof value === 'string' ||
    (typeof value === 'object' && value instanceof Date)
  )
}

/**
 * Tests whether a string matches a SQL‐like pattern.
 *
 * @param value            The string to test.
 * @param pattern          The SQL‐LIKE pattern, using % and _ as wildcards.
 * @param caseSensitive    If true (default), match is case‐sensitive; otherwise case‐insensitive.
 * @returns                True if `value` matches `pattern`.
 */
export const matchesLike = (
  value: string,
  pattern: string,
  caseSensitive: boolean = true
): boolean => {
  // 1. Escape regex‐special chars in the pattern, except for % and _
  const escaped = pattern.replace(/([.+^${}()|[\]\\])/g, '\\$1')
  // 2. Replace SQL wildcards with regex equivalents
  const regexBody = escaped
    .replace(/%/g, '.*') // % → .*
    .replace(/_/g, '.') // _ → .
  // 3. Anchor to start/end and build the RegExp
  const flags = caseSensitive ? '' : 'i'
  const regex = new RegExp(`^${regexBody}$`, flags)
  // 4. Test it
  const result = regex.test(value)
  return result
}

/**
 * Checks whether a value falls within a given range.
 *
 * Supports numbers, strings, and Date objects.
 * Returns false if types differ or are not comparable.
 *
 * @param value  – The value to test (number, string, or Date).
 * @param range  – A tuple [start, end] defining the inclusive range.
 * @returns      – True if value ∈ [start, end], false otherwise.
 */
export const isInRange = <T>(value: T, range: [T, T]): boolean => {
  const [start, end] = range

  // Number comparison
  if (typeof value === 'number' && typeof start === 'number' && typeof end === 'number') {
    return value >= start && value <= end
  }

  // Date comparison
  if (value instanceof Date && start instanceof Date && end instanceof Date) {
    return value.getTime() >= start.getTime() && value.getTime() <= end.getTime()
  }

  // String comparison (using localeCompare)
  if (typeof value === 'string' && typeof start === 'string' && typeof end === 'string') {
    // start <= value <= end
    return start.localeCompare(value) <= 0 && value.localeCompare(end) <= 0
  }

  // Not comparable or mixed types
  return false
}

/**
 * Compares two values for sorting.
 * @param a The first value to compare
 * @param b The second value to compare
 * @returns A number indicating the comparison result:
 *          -1 if a < b
 *           0 if a == b
 *           1 if a > b
 */
export const compareValues = (a: unknown, b: unknown): number => {
  // 1. If both are arrays or both are (non‑null) objects → equal
  const isObj = (v: unknown): v is object =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
  if (Array.isArray(a) && Array.isArray(b)) return 0
  if (isObj(a) && isObj(b)) return 0

  // 2. If types differ, handle undefined/null ordering
  if (typeof a !== typeof b) {
    // undefined sorts last
    if (a === undefined && b !== undefined) return 1
    if (b === undefined && a !== undefined) return -1
    // null sorts just before undefined
    if (a === null && b !== null) return 1
    if (b === null && a !== null) return -1
    // other type mismatches → treat as equal
    return 0
  }

  // 3. Same‐type comparisons
  switch (typeof a) {
    case 'string':
      return (a as string).localeCompare(b as string)
    case 'number':
      return (a as number) - (b as number)
    case 'boolean':
      // false (0) < true (1)
      return Number(a) - Number(b)
    case 'object':
      // Date objects compare by timestamp
      if (a instanceof Date && b instanceof Date) {
        return a.getTime() - b.getTime()
      }
      // any other object (shouldn't reach here) → equal
      return 0
    default:
      // symbols, functions, etc. → equal
      return 0
  }
}
