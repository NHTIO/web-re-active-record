import { TypedEventEmitter } from '@nhtio/tiny-typed-emitter'
import { ReactiveQueryBuilderIntrospector } from '@nhtio/web-re-active-record/testing'
import { ReactiveQueryCollection, ReactiveQueryResult } from './reactive_query_responses'
import { isObject, isQuantitivlyComparable, matchesLike, isInRange, compareValues } from './utils'
import {
  ReactiveModelQueryException,
  QueryBuilderUnreffedException,
  ReactiveQueryBuilderInvalidWhereOperationException,
  ReactiveQueryBuilderNotQuantitivlyComparableValueException,
  ReactiveQueryBuilderNotInnableException,
  ReactiveQueryBuilderNotBetweenableException,
} from '@nhtio/web-re-active-record/errors'
import type { EntityTable } from 'dexie'
import type { LogBusEventMap } from './class_logger'
import type { Collection, WhereClause } from 'dexie'
import type { Key, EventMap } from '@nhtio/tiny-typed-emitter'
import type { UnifiedEventBus } from './class_unified_event_bus'
import type { ReactiveDatabaseOptions } from './class_reactive_database'
import type { PlainObject, StringKeyOf, OnlyMethodKeys, BaseObjectMap } from './types'
import type { ReactiveModelConstructor, ReactiveModel } from './factory_reactive_model'
import type { RelationshipConfiguration } from '@nhtio/web-re-active-record/relationships'

export interface ReactiveQueryBuilderClause {
  method: OnlyMethodKeys<Collection<any>>
  args: any[]
}

export interface DexieWhereClause<T> {
  key: StringKeyOf<T>
  method: OnlyMethodKeys<WhereClause>
  args: any[]
}

export interface WhereCondition<T> {
  type: 'and' | 'or'
  filter: (item: T) => item is T
  dexified?: DexieWhereClause<T>
  operation?: ReactiveQueryBuilderWhereOperators
}

export interface ReactiveQueryBuilderSubQuery<
  OM extends BaseObjectMap,
  T extends PlainObject,
  PK extends StringKeyOf<T>,
  R extends Record<string, RelationshipConfiguration>,
  H extends Required<ReactiveDatabaseOptions<any>['hooks']>,
> {
  (query: ReactiveQueryBuilder<OM, T, PK, R, H>): void
}

export interface BoundReactiveQueryBuilderSubQuery {
  (): void
}

export enum ReactiveQueryBuilderWhereOperators {
  '=' = '=', // Equal
  'is' = 'is', // Is
  '!=' = '!=', // Not equal
  'is not' = 'is not', // Is not
  '<' = '<', // Less than
  '<=' = '<=', // Less than or equal to
  '>' = '>', // Greater than
  '>=' = '>=', // Greater than or equal to
  'like' = 'like', // Like
  'not like' = 'not like', // Not like
  '<>' = '<>', // Not like
  'in' = 'in', // In
  'not in' = 'not in', // Not in
  'between' = 'between', // Between
  'not between' = 'not between', // Not between
  'null' = 'null', // Null
  'not null' = 'not null', // Not null
  'exists' = 'exists', // Exists
  'not exists' = 'not exists', // Not exists
  'ilike' = 'ilike', // ILIKE
  'not ilike' = 'not ilike', // NOT ILIKE
}

interface PromiseBusEvents {
  resolve: []
}

type PromiseBusEventMap = EventMap<PromiseBusEvents>

interface ReactiveQueryBuilderSortByClause extends ReactiveQueryBuilderClause {
  method: 'sortBy'
  args: [string, 'asc' | 'desc']
}

/**
 * A fluent query builder for ReactiveModel that provides SQL-like query functionality.
 *
 * @typeParam T - The type of the model being queried
 * @typeParam PK - The type of the primary key of the model
 * @typeParam R - The type of relationships configuration
 *
 * @remarks
 * This class provides a chainable API for building complex database queries including:
 * - Where clauses with various operators (`=`, `!=`, `>`, `<`, `LIKE`, etc.)
 * - Logical combinations (**AND**, **OR**)
 * - Ordering and pagination
 * - Relationship eager loading
 * - Data modifications ({@link update}, {@link delete}, {@link increment}, {@link decrement})
 *
 * @example
 * ```typescript
 * // Basic query with where clause
 * const users = await User.query()
 *   .where('age', '>', 18)
 *   .orderBy('name')
 *   .fetch()
 *
 * // Complex query with relationships
 * const posts = await Post.query()
 *   .where('published', true)
 *   .whereBetween('views', [100, 1000])
 *   .with('author')
 *   .forPage(1, 20)
 * ```
 */
export class ReactiveQueryBuilder<
  OM extends BaseObjectMap,
  T extends PlainObject,
  PK extends StringKeyOf<T>,
  R extends Record<string, RelationshipConfiguration>,
  H extends Required<ReactiveDatabaseOptions<any>['hooks']>,
  IT extends ReactiveModel<T, PK, R> = InstanceType<ReactiveModelConstructor<OM, T, PK, R, H>>,
> implements PromiseLike<any>
{
  readonly #hooks: H
  readonly #clauses: ReactiveQueryBuilderClause[]
  readonly #ctor: ReactiveModelConstructor<OM, T, PK, R, H>
  readonly #relatable: StringKeyOf<R>[]
  readonly #table: EntityTable<T>
  readonly #relations: Set<StringKeyOf<R>>
  readonly #primaryKey: PK
  readonly #logBus: TypedEventEmitter<LogBusEventMap>
  readonly #eventBus: UnifiedEventBus
  readonly #addCleanupCallback: (cb: () => Promise<void>) => void
  readonly #abortController: AbortController
  readonly #whereConditions: WhereCondition<T>[]
  readonly #whereWrappedBindingMap: WeakMap<
    ReactiveQueryBuilderSubQuery<OM, T, PK, R, H>,
    BoundReactiveQueryBuilderSubQuery
  >
  #unreffed: boolean
  #cachedResult?: IT | IT[] | undefined
  #hasCachedResult: boolean

  /** @private */
  constructor(
    hooks: H,
    ctor: ReactiveModelConstructor<OM, T, PK, R, H>,
    table: EntityTable<T>,
    relatable: StringKeyOf<R>[],
    primaryKey: PK,
    logBus: TypedEventEmitter<LogBusEventMap>,
    eventBus: UnifiedEventBus,
    addCleanupCallback: (cb: () => Promise<void>) => void,
    clauses?: ReactiveQueryBuilderClause[],
    withRelations?: StringKeyOf<R>[],
    whereConditions?: WhereCondition<T>[],
    introspector?: ReactiveQueryBuilderIntrospector<OM, T, PK, R, H>
  ) {
    this.#hooks = hooks
    this.#clauses = []
    this.#ctor = ctor
    this.#relatable = relatable
    this.#table = table
    this.#relations = new Set()
    this.#primaryKey = primaryKey
    this.#logBus = logBus
    this.#eventBus = eventBus
    this.#addCleanupCallback = addCleanupCallback
    this.#abortController = new AbortController()
    this.#whereConditions = []
    this.#whereWrappedBindingMap = new WeakMap()
    this.#addCleanupCallback(() => {
      this.#log('debug', 'Cleaning up query builder')
      this.#unreffed = true
      this.#abortController.abort()
      return Promise.resolve()
    })
    this.#unreffed = false
    this.#hasCachedResult = false
    if (clauses) {
      this.#clauses.push(...clauses)
    }
    if (withRelations) {
      withRelations.forEach((relation) => {
        this.#relations.add(relation)
      })
    }
    if (whereConditions) {
      this.#whereConditions.push(...whereConditions)
    }
    if (introspector instanceof ReactiveQueryBuilderIntrospector) {
      introspector.$init(
        () => this.#clauses,
        () => this.#whereConditions,
        () => this.#ctor,
        () => this.#relatable,
        () => this.#table,
        () => this.#primaryKey,
        () => this.#relations,
        () => this.#logBus,
        () => this.#addCleanupCallback,
        () => this.#abortController,
        this.#log.bind(this),
        this.#execute.bind(this),
        this.#getReturnableArray.bind(this),
        this.#getReturnable.bind(this)
      )
    }
  }

  #log<K>(level: Key<K, LogBusEventMap>, ...args: any[]) {
    this.#logBus.emit(level, ...args)
  }

  get #dexieIndexes() {
    return this.#table.schema.indexes.filter((i) => !Array.isArray(i.keyPath)).map((i) => i.keyPath)
  }

  #canUseDexieWhereClauses(conditions: WhereCondition<T>[]): boolean {
    return (
      // must have at least one condition
      conditions.length >= 1 &&
      // all must have dexified defined
      conditions.some((cond) => cond.dexified !== undefined) &&
      // all types must match "and"
      conditions.every((cond) => cond.type === 'and')
    )
  }

  #sortArrayBySortClauses(items: T[], clauses: ReactiveQueryBuilderSortByClause[]) {
    return [...items].sort((a, b) => {
      for (const clause of clauses) {
        const [key, direction] = clause.args
        const aVal = (a as any)[key]
        const bVal = (b as any)[key]
        const result = direction === 'asc' ? compareValues(aVal, bVal) : compareValues(bVal, aVal)
        if (result !== 0) {
          return result
        }
      }
      return 0 // If all clauses are equal, maintain original order
    })
  }

  async #execute() {
    if (this.#unreffed) {
      this.#log('warning', 'Query builder has been unreffed, aborting query')
      throw new QueryBuilderUnreffedException()
    }
    const clauses = [...this.#clauses]
    const wheres = [...this.#whereConditions]
    // we will be reassigning the collection since collections are immutable
    let collection: Collection

    /**
     * Filter and Query Composition
     * @remarks If thre is only one condition and it is dexified, we can use Dexie's where clauses
     * This is a performance optimization to avoid having to filter the collection in JS
     */
    if (this.#canUseDexieWhereClauses(wheres)) {
      if (this.#hasCachedResult) {
        this.#log('debug', 'Using cached result')
        return this.#cachedResult
      }
      const foundFirstDexifidCondition = wheres.find((c) => c.dexified !== undefined)!
      const firstDexifiedConditionIndex = wheres.indexOf(foundFirstDexifidCondition)
      const firstDexifidCondition = wheres.splice(firstDexifiedConditionIndex, 1)[0]
      const { key, method, args } = firstDexifidCondition.dexified!
      const remainingConditions = wheres
      const dexieWhereClause = this.#table.where(key)
      // @ts-ignore
      collection = dexieWhereClause[method].call(dexieWhereClause, ...args)
      if (remainingConditions.length > 0) {
        const evaluator = this.#evaluateConditionsFor.bind(this, remainingConditions)
        collection = collection.filter(evaluator)
      }
    } else {
      collection = this.#table.toCollection()
      collection = collection.filter(this.#evaluateWhereConditions.bind(this))
    }
    const finalIndex = clauses.length - 1
    const finalClause = clauses[finalIndex]
    /**
     * If dealing with a count clause, no sorting or ordering is needed
     */
    if (finalClause && finalClause.method === 'count') {
      return collection.count()
    }
    /**
     * Sorting / Ordering
     */
    const sortByClauses = clauses.filter(
      (c) => c.method === 'sortBy'
    ) as ReactiveQueryBuilderSortByClause[]
    const sortByClause = clauses.find((c) => c.method === 'sortBy')
    const sortByArgs = sortByClause ? sortByClause.args : []
    const [sortByKey, sortByDirection] = sortByArgs as [StringKeyOf<T>, 'asc' | 'desc'] | []
    const canSortByDexie =
      sortByKey && this.#isDexieIndexedKey(sortByKey) && sortByClauses.length === 1
    const canSort = sortByClauses.length > 0

    /**
     * When dealing with first or last, because we cannot run sorting functions before returning the first or last
     * we need to run the sort after we have the collection, and then return the first or last
     */
    if (finalClause && (finalClause.method === 'first' || finalClause.method === 'last')) {
      if (canSort) {
        const asArray = await collection.toArray()
        const sorted = this.#sortArrayBySortClauses(asArray as T[], sortByClauses)
        const item = finalClause.method === 'first' ? sorted[0] : sorted[sorted.length - 1]
        this.#cachedResult = item ? await this.#getReturnable(item) : undefined
        this.#hasCachedResult = true
        return this.#cachedResult
      }
      switch (finalClause.method) {
        case 'first': {
          const first = await collection.first()
          this.#cachedResult = first ? await this.#getReturnable(first) : undefined
          this.#hasCachedResult = true
          return this.#cachedResult
        }

        case 'last': {
          const last = await collection.last()
          this.#cachedResult = last ? await this.#getReturnable(last) : undefined
          this.#hasCachedResult = true
          return this.#cachedResult
        }
      }
    }
    const offsetClause = clauses.find((c) => c.method === 'offset')
    const limitClause = clauses.find((c) => c.method === 'limit')
    if (offsetClause) {
      collection = collection.offset(offsetClause.args[0])
    }
    if (limitClause) {
      collection = collection.limit(limitClause.args[0])
    }
    let results: Array<T>
    if (canSortByDexie) {
      const remainingSortByClauses = sortByClauses.filter(
        (c) => c.args[0] !== sortByKey || c.args[1] !== sortByDirection
      )
      if ('desc' === sortByDirection) {
        collection = collection.reverse()
      }
      results = await collection.sortBy(sortByKey)
      results = this.#sortArrayBySortClauses(results, remainingSortByClauses)
    } else {
      results = await collection.toArray()
      if (canSort) {
        results = this.#sortArrayBySortClauses(results as T[], sortByClauses)
      }
    }
    this.#cachedResult = await this.#getReturnableArray(results)
    this.#hasCachedResult = true
    return this.#cachedResult
  }

  async #getReturnableArray(records: (T | IT)[]): Promise<IT[]> {
    if (this.#unreffed) {
      this.#log('warning', 'Query builder has been unreffed, aborting query')
      throw new QueryBuilderUnreffedException()
    }

    // Convert plain objects to ReactiveModels if needed
    const models = records.map((record) =>
      record instanceof this.#ctor ? record : new this.#ctor(record as any)
    )

    if (this.#relations.size > 0) {
      this.#log('debug', `Loading relationships: ${Array.from(this.#relations).join(', ')}`)
      await Promise.all(models.map((model) => model.loadMany(Array.from(this.#relations))))
    }

    return models as IT[]
  }

  async #getReturnable(record: T | IT): Promise<IT> {
    if (this.#unreffed) {
      this.#log('warning', 'Query builder has been unreffed, aborting query')
      throw new QueryBuilderUnreffedException()
    }

    // Convert plain object to ReactiveModel if needed
    const model = record instanceof this.#ctor ? record : new this.#ctor(record as any)

    if (this.#relations.size > 0) {
      await model.loadMany(Array.from(this.#relations))
    }

    return model as IT
  }

  #evaluateConditionsFor(conditions: WhereCondition<T>[], item: T): item is T {
    if (conditions.length === 0) return true
    const evaluated = conditions.map((c) => ({
      type: c.type,
      result: c.filter(item),
      operation: c.operation,
    }))
    const stringified = evaluated
      .map(
        (c, i) =>
          `${i > 0 ? (c.type === 'and' ? '&&' : '||') : ''} 1 === ${c.result === true ? 1 : 0}`
      )
      .join(' ')
    const evaluatable = new Function(`return ${stringified}`)
    const result = evaluatable()
    return result
  }

  /**
   * Evaluate all where conditions for a given item
   * @private
   */
  #evaluateWhereConditions(item: T): item is T {
    return this.#evaluateConditionsFor(this.#whereConditions, item)
  }

  /**
   * Gets the total number of records that match the query conditions.
   * Can be used with where clauses to count filtered results.
   *
   * @returns Promise resolving to the count of matching records
   *
   * @example
   * ```typescript
   * // Count all records
   * const total = await query.count()
   *
   * // Count filtered records
   * const highScores = await query
   *   .where('score', '>', 80)
   *   .count()
   * ```
   */
  count(): Promise<number> {
    this.#clauses.push({ method: 'count', args: [] })
    return this.#execute() as Promise<number>
  }

  /**
   * Deletes all records that match the current query conditions.
   * @danger This operation cannot be undone.
   *
   * @returns Promise that resolves when all matching records have been deleted
   *
   * @example
   * ```typescript
   * // Delete all inactive users
   * await query.where('active', false).delete()
   *
   * // Delete users with specific roles
   * await query
   *   .whereIn('role', ['guest', 'blocked'])
   *   .delete()
   * ```
   */
  async delete(): Promise<void> {
    if (this.#unreffed) {
      this.#log('warning', 'Query builder has been unreffed, aborting query')
      throw new QueryBuilderUnreffedException()
    }
    this.#log('info', 'Executing delete operation on query results')
    const records = await this.fetch()
    if (Array.isArray(records)) {
      this.#log('debug', `Deleting ${records.length} records`)
      await Promise.all(records.map((record) => record.delete()))
      this.#log('info', `Successfully deleted ${records.length} records`)
    }
  }

  /**
   * Updates all records that match the current query conditions with the given data.
   * Only modifies the specified fields, leaving others unchanged.
   *
   * @param data - Partial data containing fields to update
   * @returns Promise resolving to array of updated records
   *
   * @example
   * ```typescript
   * // Update status of all active users
   * const updated = await query
   *   .where('active', true)
   *   .update({ status: 'verified' })
   *
   * // Update multiple fields with conditions
   * const updated = await query
   *   .where('score', '>', 90)
   *   .update({
   *     rank: 'expert',
   *     verified: true
   *   })
   * ```
   */
  async update(data: Partial<T>): Promise<Array<IT>> {
    if (this.#unreffed) {
      this.#log('warning', 'Query builder has been unreffed, aborting query')
      throw new QueryBuilderUnreffedException()
    }
    this.#log('info', 'Executing update operation on query results')
    const records = await this.fetch()
    if (Array.isArray(records)) {
      this.#log('debug', `Updating ${records.length} records`)
      records.forEach((record: IT) => {
        record.merge(data)
      })
      await Promise.all(records.map((record) => record.save()))
      this.#log('info', `Successfully updated ${records.length} records`)
    }
    return records as Array<IT>
  }

  #isDexieIndexedKey(key: StringKeyOf<T>) {
    return this.#dexieIndexes.includes(key)
  }

  #isDexieIndexableType(value: unknown): boolean {
    if (
      'number' === typeof value ||
      'string' === typeof value ||
      value instanceof Date ||
      value instanceof ArrayBuffer
    ) {
      return true
    }
    if (Array.isArray(value)) {
      return value.every((v) => this.#isDexieIndexableType(v))
    }
    return false
  }

  #whereWrapped(
    callback: ReactiveQueryBuilderSubQuery<OM, T, PK, R, H>,
    type: WhereCondition<T>['type'] = 'and',
    not: boolean = false
  ): this {
    const introspector = new ReactiveQueryBuilderIntrospector<OM, T, PK, R, H>()
    const subQuery = new ReactiveQueryBuilder<OM, T, PK, R, H>(
      this.#hooks,
      this.#ctor,
      this.#table,
      this.#relatable,
      this.#primaryKey,
      this.#logBus,
      this.#eventBus,
      this.#addCleanupCallback,
      [],
      [],
      [],
      introspector
    )
    const bound = this.#whereWrappedBindingMap.get(callback) || callback.bind(null, subQuery)
    this.#whereWrappedBindingMap.set(callback, bound)
    this.#whereConditions.push({
      type,
      filter: (item: T): item is T => {
        bound()
        const evaluated = introspector.whereConditions.map((c) => ({
          type: c.type,
          result: c.filter(item),
        }))
        const stringified = evaluated
          .map(
            (c, i) =>
              `${i > 0 ? (c.type === 'and' ? '&&' : '||') : ''} 1 === ${c.result === true ? 1 : 0}`
          )
          .join(' ')
        const evaluatable = new Function(`return ${stringified}`)
        const result = evaluatable()
        return not ? !result : result
      },
    })
    return this
  }

  #whereObject(
    condition: Record<string, unknown>,
    type: WhereCondition<T>['type'] = 'and',
    not: boolean = false
  ): this {
    return this.#whereWrapped((sub) => {
      for (const [key, value] of Object.entries(condition)) {
        sub.where(key as Extract<keyof T, string>, not ? '!=' : '=', value)
      }
    }, type)
  }

  #where(key: any, operator?: any, value?: any, type: WhereCondition<T>['type'] = 'and'): this {
    // Support "where true || where false"
    if (key === false || key === true) {
      return this.#where(this.#primaryKey, key === true ? 'exists' : 'not exists', undefined, type)
    }
    // Check if the column is a function, in which case it's
    // a where statement wrapped in parens.
    if (typeof key === 'function') {
      return this.#whereWrapped(key, type)
    }
    // Allows `where({ key: value })` syntax
    if (isObject(key)) {
      return this.#whereObject(key, type)
    }
    // Enable the where('key', value) syntax, only when there
    // are explicitly two arguments passed, so it's not possible to
    // do where('key', '!=') and have that turn into where key != null
    if (
      'string' === typeof key &&
      'undefined' !== typeof operator &&
      'undefined' === typeof value &&
      !Object.keys(ReactiveQueryBuilderWhereOperators).includes(operator)
    ) {
      value = operator
      operator = '='

      // If the value is null, and it's a two argument query,
      // we assume we're going for a `whereNull`.
      if (value === null) {
        return this.#where(key, '=', null, type)
      } else {
        return this.#where(key, operator, value, type)
      }
    }

    // lower case the operator for comparison purposes
    const checkOperator = `${operator}`.toLowerCase().trim()

    switch (checkOperator) {
      case '=':
      case 'is':
        this.#whereConditions.push({
          operation: operator,
          type,
          filter: (item: T): item is T => {
            return item[key] === value
          },
          dexified:
            this.#isDexieIndexedKey(key) && this.#isDexieIndexableType(value)
              ? { key, method: 'equals', args: [value] }
              : undefined,
        })
        break

      case '!=':
      case 'is not':
        this.#whereConditions.push({
          operation: operator,
          type,
          filter: (item: T): item is T => {
            return item[key] !== value
          },
          dexified:
            this.#isDexieIndexedKey(key) && this.#isDexieIndexableType(value)
              ? { key, method: 'notEqual', args: [value] }
              : undefined,
        })
        break

      /**
       * @remarks: In cases where the value on the model for the key is not quantitively comparable,
       * this clause will always return false.
       * In cases where both values are strings, the comparison will be done using localeCompare.
       */
      case '<':
        if (!isQuantitivlyComparable(value)) {
          throw new ReactiveQueryBuilderNotQuantitivlyComparableValueException(value)
        }
        this.#whereConditions.push({
          operation: operator,
          type,
          filter: (item: T): item is T => {
            if (!isQuantitivlyComparable(item[key])) {
              return false
            }
            if ('string' === typeof item[key] && 'string' === typeof value) {
              return item[key].localeCompare(value) < 0
            }
            return item[key] < value
          },
          dexified:
            this.#isDexieIndexedKey(key) && this.#isDexieIndexableType(value)
              ? { key, method: 'below', args: [value] }
              : undefined,
        })
        break
      case '<=':
        if (!isQuantitivlyComparable(value)) {
          throw new ReactiveQueryBuilderNotQuantitivlyComparableValueException(value)
        }
        this.#whereConditions.push({
          operation: operator,
          type,
          filter: (item: T): item is T => {
            if (!isQuantitivlyComparable(item[key])) {
              return false
            }
            if ('string' === typeof item[key] && 'string' === typeof value) {
              return item[key].localeCompare(value) <= 0
            }
            return item[key] <= value
          },
          dexified:
            this.#isDexieIndexedKey(key) && this.#isDexieIndexableType(value)
              ? { key, method: 'belowOrEqual', args: [value] }
              : undefined,
        })
        break
      case '>':
        if (!isQuantitivlyComparable(value)) {
          throw new ReactiveQueryBuilderNotQuantitivlyComparableValueException(value)
        }
        this.#whereConditions.push({
          operation: operator,
          type,
          filter: (item: T): item is T => {
            if (!isQuantitivlyComparable(item[key])) {
              return false
            }
            if ('string' === typeof item[key] && 'string' === typeof value) {
              return item[key].localeCompare(value) > 0
            }
            return item[key] > value
          },
          dexified:
            this.#isDexieIndexedKey(key) && this.#isDexieIndexableType(value)
              ? { key, method: 'above', args: [value] }
              : undefined,
        })
        break
      case '>=':
        if (!isQuantitivlyComparable(value)) {
          throw new ReactiveQueryBuilderNotQuantitivlyComparableValueException(value)
        }
        this.#whereConditions.push({
          operation: operator,
          type,
          filter: (item: T): item is T => {
            if (!isQuantitivlyComparable(item[key])) {
              return false
            }
            if ('string' === typeof item[key] && 'string' === typeof value) {
              return item[key].localeCompare(value) >= 0
            }
            return item[key] >= value
          },
          dexified:
            this.#isDexieIndexedKey(key) && this.#isDexieIndexableType(value)
              ? { key, method: 'aboveOrEqual', args: [value] }
              : undefined,
        })
        break
      case 'like':
        if ('string' !== typeof value) {
          this.#whereConditions.push({
            type,
            filter: (item: T): item is T => {
              return item[key] === value
            },
          })
        } else {
          this.#whereConditions.push({
            type,
            filter: (item: T): item is T => {
              if ('string' !== typeof item[key]) {
                if ('number' === typeof item[key]) {
                  return matchesLike(String(item[key]), value)
                }
                return item[key] === value
              }
              return matchesLike(item[key], value)
            },
          })
        }
        break
      case 'not like':
      case '<>':
        if ('string' !== typeof value) {
          this.#whereConditions.push({
            type,
            filter: (item: T): item is T => {
              return item[key] !== value
            },
          })
        } else {
          this.#whereConditions.push({
            type,
            filter: (item: T): item is T => {
              if ('string' !== typeof item[key]) {
                if ('number' === typeof item[key]) {
                  return !matchesLike(String(item[key]), value)
                }
                return item[key] !== value
              }
              return !matchesLike(item[key], value)
            },
          })
        }
        break
      case 'exists':
        this.#whereConditions.push({
          operation: operator,
          type,
          filter: (item: T): item is T => {
            return item[key] !== undefined && item[key] !== null
          },
        })
        break
      case 'not exists':
        this.#whereConditions.push({
          operation: operator,
          type,
          filter: (item: T): item is T => {
            return item[key] === undefined || item[key] === null
          },
        })
        break
      case 'ilike':
        if ('string' !== typeof value) {
          this.#whereConditions.push({
            type,
            filter: (item: T): item is T => {
              return item[key] === value
            },
          })
        } else {
          this.#whereConditions.push({
            type,
            filter: (item: T): item is T => {
              if ('string' !== typeof item[key]) {
                if ('number' === typeof item[key]) {
                  return matchesLike(String(item[key]), value, false)
                }
                return item[key] === value
              }
              return matchesLike(item[key], value, false)
            },
          })
        }
        break
      case 'not ilike':
        if ('string' !== typeof value) {
          this.#whereConditions.push({
            type,
            filter: (item: T): item is T => {
              return item[key] !== value
            },
          })
        } else {
          this.#whereConditions.push({
            type,
            filter: (item: T): item is T => {
              if ('string' !== typeof item[key]) {
                if ('number' === typeof item[key]) {
                  return !matchesLike(String(item[key]), value, false)
                }
                return item[key] !== value
              }
              return !matchesLike(item[key], value, false)
            },
          })
        }
        break

      case 'in':
        if (Array.isArray(value)) {
          this.#whereConditions.push({
            type,
            filter: (item: T): item is T => {
              return value.includes(item[key])
            },
            dexified:
              this.#isDexieIndexedKey(key) && this.#isDexieIndexableType(value)
                ? { key, method: 'anyOf', args: [value] }
                : undefined,
          })
        } else {
          throw new ReactiveQueryBuilderNotInnableException(value)
        }
        break

      case 'not in':
        if (Array.isArray(value)) {
          this.#whereConditions.push({
            type,
            filter: (item: T): item is T => {
              return !value.includes(item[key])
            },
            dexified:
              this.#isDexieIndexedKey(key) && this.#isDexieIndexableType(value)
                ? { key, method: 'noneOf', args: [value] }
                : undefined,
          })
        } else {
          throw new ReactiveQueryBuilderNotInnableException(value)
        }
        break

      case 'between':
        if (Array.isArray(value) && value.length === 2) {
          this.#whereConditions.push({
            type,
            filter: (item: T): item is T => {
              return isInRange(item[key], value as [any, any])
            },
            dexified:
              this.#isDexieIndexedKey(key) && this.#isDexieIndexableType(value)
                ? { key, method: 'between', args: [value[0], value[1], true, true] }
                : undefined,
          })
        } else {
          throw new ReactiveQueryBuilderNotBetweenableException(value)
        }
        break

      case 'not between':
        if (Array.isArray(value) && value.length === 2) {
          this.#whereConditions.push({
            type,
            filter: (item: T): item is T => {
              return !isInRange(item[key], value as [any, any])
            },
          })
        } else {
          throw new ReactiveQueryBuilderNotBetweenableException(value)
        }
        break

      default:
        throw new ReactiveQueryBuilderInvalidWhereOperationException(checkOperator)
    }
    return this
  }

  #whereNot(key: any, operator?: any, value?: any, type: WhereCondition<T>['type'] = 'and'): this {
    // Support "where not true || where not false"
    if (key === false || key === true) {
      return this.#where(this.#primaryKey, key === true ? 'not exists' : 'exists', undefined, type)
    }
    // Check if the column is a function, in which case it's
    // a where statement wrapped in parens.
    if (typeof key === 'function') {
      return this.#whereWrapped(key, type, true)
    }
    // Allows `whereNot({ key: value })` syntax
    if (isObject(key)) {
      return this.#whereObject(key, type, true)
    }
    // Enable the whereNot('key', value) syntax, only when there
    // are explicitly two arguments passed, so it's not possible to
    // do whereNot('key', '!=') and have that turn into where not key != null
    if (
      'string' === typeof key &&
      'undefined' !== typeof operator &&
      'undefined' === typeof value &&
      !Object.keys(ReactiveQueryBuilderWhereOperators).includes(operator)
    ) {
      value = operator
      operator = '!='
      // If the value is null, and it's a two argument query,
      // we assume we're going for a `whereNull`.
      if (value === null) {
        return this.#where(key, '!=', null, type)
      } else {
        return this.#where(key, '!=', value, type)
      }
    }
    const checkOperator = `${operator}`.toLowerCase().trim()
    switch (checkOperator) {
      case '=':
      case 'is':
        return this.#where(key, '!=', value, type)
      case '!=':
      case 'is not':
        return this.#where(key, '=', value, type)
      case '<':
        return this.#where(key, '>=', value, type)
      case '<=':
        return this.#where(key, '>', value, type)
      case '>':
        return this.#where(key, '<=', value, type)
      case '>=':
        return this.#where(key, '<', value, type)
      case 'like':
        return this.#where(key, 'not like', value, type)
      case 'not like':
      case '<>':
        return this.#where(key, 'like', value, type)
      case 'exists':
        return this.#where(key, 'not exists', value, type)
      case 'not exists':
        return this.#where(key, 'exists', value, type)
      case 'ilike':
        return this.#where(key, 'not ilike', value, type)
      case 'not ilike':
        return this.#where(key, 'ilike', value, type)
      case 'in':
        return this.#where(key, 'not in', value, type)
      case 'not in':
        return this.#where(key, 'in', value, type)
      case 'between':
        return this.#where(key, 'not between', value, type)
      case 'not between':
        return this.#where(key, 'between', value, type)
      default:
        throw new ReactiveQueryBuilderInvalidWhereOperationException(checkOperator)
    }
  }

  /**
   * Base where clause for filtering query results.
   * This method has multiple overloads for different filtering scenarios.
   */

  /**
   * Filter records using a callback function for grouped conditions.
   * Allows for complex nested queries with multiple conditions.
   *
   * @param callback - Function that builds a group of conditions
   * @example
   * ```typescript
   * query.where(q =>
   *   q.where('role', 'admin')
   *    .orWhere('permissions', 'includes', 'manage_users')
   * )
   * ```
   */
  where(callback: ReactiveQueryBuilderSubQuery<OM, T, PK, R, H>): this

  /**
   * Filter records using an object of key-value pairs.
   * All conditions are combined with **AND** logic.
   *
   * @param conditions - Object where keys are column names and values are the expected values
   * @example
   * ```typescript
   * query.where({
   *   status: 'active',
   *   type: 'premium',
   *   verified: true
   * })
   * ```
   */
  where(conditions: Record<StringKeyOf<T>, unknown>): this

  /**
   * Filter records by comparing a column value for equality.
   * Shorthand for ``where(key, '=', value)``.
   *
   * @param key - Column name to check
   * @param value - Value to compare against
   * @example
   * ```typescript
   * query.where('status', 'active')
   * ```
   */
  where<K extends StringKeyOf<T>>(key: K, value: T[K]): this

  /**
   * Filter records using a comparison operator.
   * Supports various operators like `>`, `<`, `>=`, `<=`, `!=`, `like`, etc.
   *
   * @param key - Column name to check
   * @param operator - Comparison operator
   * @param value - Value to compare against
   * @example
   * ```typescript
   * query.where('age', '>=', 18)
   * query.where('name', 'like', 'John%')
   * ```
   */
  where<K extends StringKeyOf<T>>(
    key: K,
    operator: keyof typeof ReactiveQueryBuilderWhereOperators,
    value: any
  ): this

  /**
   * Filter records using a `boolean` value.
   * `true` is equivalent to {@link whereExists}, `false` to {@link whereNotExists}.
   *
   * @param value - `boolean` condition
   */
  where(value: boolean): this

  // Implementation signature
  where(
    keyOrConditions:
      | StringKeyOf<T>
      | ReactiveQueryBuilderSubQuery<OM, T, PK, R, H>
      | Record<StringKeyOf<T>, unknown>
      | boolean,
    operator?: keyof typeof ReactiveQueryBuilderWhereOperators | T[StringKeyOf<T>],
    value?: any
  ): this {
    return this.#where(keyOrConditions, operator, value, 'and')
  }

  /**
   * Base AND where clause for chaining multiple conditions.
   * This method has multiple overloads for different filtering scenarios.
   * @see {@link where} for base filtering functionality
   */

  /**
   * Add an AND condition using a callback function for grouped conditions.
   * Allows for complex nested queries with multiple conditions.
   *
   * @param callback - Function that builds a group of conditions
   * @see {@link ReactiveQueryBuilderSubQuery} for callback function type
   * @see {@link where} for base query building
   * @example
   * ```typescript
   * query.where('active', true)
   *     .andWhere(q =>
   *       q.where('role', 'admin')
   *        .where('permissionLevel', '>=', 5)
   *     )
   * ```
   */
  andWhere(callback: ReactiveQueryBuilderSubQuery<OM, T, PK, R, H>): this

  /**
   * Add an AND condition using an object of key-value pairs.
   * All conditions in the object are combined with AND logic.
   *
   * @param conditions - Object where keys are column names and values are the expected values
   * @example
   * ```typescript
   * query.where('active', true)
   *     .andWhere({
   *       verified: true,
   *       accountType: 'premium'
   *     })
   * ```
   */
  andWhere(conditions: Record<StringKeyOf<T>, unknown>): this

  /**
   * Add an AND condition comparing a column value for equality.
   * Shorthand for `andWhere(key, '=', value)`.
   *
   * @param key - Column name to check
   * @param value - Value to compare against
   * @example
   * ```typescript
   * query.where('active', true)
   *     .andWhere('department', 'sales')
   * ```
   */
  andWhere<K extends StringKeyOf<T>>(key: K, value: T[K]): this

  /**
   * Add an AND condition using a comparison operator.
   * Supports various operators like >, <, >=, <=, !=, like, etc.
   *
   * @param key - Column name to check
   * @param operator - Comparison operator
   * @param value - Value to compare against
   * @example
   * ```typescript
   * query.where('active', true)
   *     .andWhere('experience', '>=', 5)
   *     .andWhere('rating', '>', 4.5)
   * ```
   */
  andWhere<K extends StringKeyOf<T>>(
    key: K,
    operator: keyof typeof ReactiveQueryBuilderWhereOperators,
    value: any
  ): this

  /**
   * Add an AND condition using a `boolean` value.
   * `true` is equivalent to {@link whereExists}, `false` to {@link whereNotExists}.
   *
   * @param value - `boolean` condition
   */
  andWhere(value: boolean): this

  // Implementation signature
  andWhere(
    keyOrConditions:
      | StringKeyOf<T>
      | ReactiveQueryBuilderSubQuery<OM, T, PK, R, H>
      | Record<StringKeyOf<T>, unknown>
      | boolean,
    operator?: keyof typeof ReactiveQueryBuilderWhereOperators | T[StringKeyOf<T>],
    value?: any
  ): this {
    return this.#where(keyOrConditions as any, operator, value, 'and')
  }

  /**
   * Base OR where clause for alternative filtering conditions.
   * This method has multiple overloads for different filtering scenarios.
   */

  /**
   * Add an OR condition using a callback function for grouped conditions.
   * Allows for complex nested queries with multiple conditions.
   *
   * @param callback - Function that builds a group of conditions
   * @example
   * ```typescript
   * query.where('status', 'active')
   *     .orWhere(q =>
   *       q.where('role', 'admin')
   *        .where('permissionLevel', '>=', 5)
   *     )  // status = 'active' OR (role = 'admin' AND permissionLevel >= 5)
   * ```
   */
  orWhere(callback: ReactiveQueryBuilderSubQuery<OM, T, PK, R, H>): this

  /**
   * Add an OR condition using an object of key-value pairs.
   * All conditions in the object are combined with AND logic, then joined with OR.
   *
   * @param conditions - Object where keys are column names and values are the expected values
   * @example
   * ```typescript
   * query.where('status', 'active')
   *     .orWhere({
   *       role: 'admin',
   *       verified: true
   *     })  // status = 'active' OR (role = 'admin' AND verified = true)
   * ```
   */
  orWhere(conditions: Record<StringKeyOf<T>, unknown>): this

  /**
   * Add an OR condition comparing a column value for equality.
   * Shorthand for `orWhere(key, '=', value)`.
   *
   * @param key - Column name to check
   * @param value - Value to compare against
   * @example
   * ```typescript
   * query.where('role', 'user')
   *     .orWhere('department', 'IT')  // role = 'user' OR department = 'IT'
   * ```
   */
  orWhere<K extends StringKeyOf<T>>(key: K, value: T[K]): this

  /**
   * Add an OR condition using a comparison operator.
   * Supports various operators like >, <, >=, <=, !=, like, etc.
   *
   * @param key - Column name to check
   * @param operator - Comparison operator
   * @param value - Value to compare against
   * @example
   * ```typescript
   * query.where('status', 'active')
   *     .orWhere('score', '>=', 100)
   *     .orWhere('rating', '>', 4.5)  // status = 'active' OR score >= 100 OR rating > 4.5
   * ```
   */
  orWhere<K extends StringKeyOf<T>>(
    key: K,
    operator: keyof typeof ReactiveQueryBuilderWhereOperators,
    value: any
  ): this

  /**
   * Add an OR condition using a `boolean` value.
   * `true` is equivalent to {@link orWhereExists}, `false` to {@link orWhereNotExists}.
   *
   * @param value - `boolean` condition
   */
  orWhere(value: boolean): this

  // Implementation signature
  orWhere(
    keyOrConditions:
      | StringKeyOf<T>
      | ReactiveQueryBuilderSubQuery<OM, T, PK, R, H>
      | Record<StringKeyOf<T>, unknown>
      | boolean,
    operator?: keyof typeof ReactiveQueryBuilderWhereOperators | T[StringKeyOf<T>],
    value?: any
  ): this {
    return this.#where(keyOrConditions as any, operator, value, 'or')
  }

  /**
   * Adds a where clause that negates the condition.
   * Useful for finding records that don't match specific criteria.
   *
   * @example
   * ```typescript
   * // Find non-admin users
   * const users = await query
   *   .whereNot('role', 'admin')
   *   .fetch()
   *
   * // Complex negation
   * const products = await query
   *   .whereNot(query =>
   *     query.where('status', 'discontinued')
   *         .orWhere('stock', '<=', 0)
   *   )
   *   .fetch()
   *
   * // Multiple conditions
   * const orders = await query
   *   .whereNot({
   *     status: 'cancelled',
   *     paymentFailed: true
   *   })
   *   .fetch()
   * ```
   */
  whereNot(callback: ReactiveQueryBuilderSubQuery<OM, T, PK, R, H>): this
  whereNot(conditions: Partial<T>): this
  whereNot<K extends StringKeyOf<T>>(key: K, value: T[K]): this
  whereNot<K extends StringKeyOf<T>>(
    key: K,
    operator: keyof typeof ReactiveQueryBuilderWhereOperators,
    value: any
  ): this
  whereNot(value: boolean): this
  whereNot(key: any, operator?: any, value?: any): this {
    return this.#whereNot(key, operator, value, 'and')
  }

  /**
   * Adds a where clause that negates the condition.
   * Useful for finding records that don't match specific criteria.
   *
   * @example
   * ```typescript
   * // Find non-admin users
   * const users = await query
   *   .whereNot('role', 'admin')
   *   .fetch()
   *
   * // Complex negation
   * const products = await query
   *   .whereNot(query =>
   *     query.where('status', 'discontinued')
   *         .orWhere('stock', '<=', 0)
   *   )
   *   .fetch()
   *
   * // Multiple conditions
   * const orders = await query
   *   .whereNot({
   *     status: 'cancelled',
   *     paymentFailed: true
   *   })
   *   .fetch()
   * ```
   */
  andWhereNot(callback: ReactiveQueryBuilderSubQuery<OM, T, PK, R, H>): this
  andWhereNot(conditions: Partial<T>): this
  andWhereNot<K extends StringKeyOf<T>>(key: K, value: T[K]): this
  andWhereNot<K extends StringKeyOf<T>>(
    key: K,
    operator: keyof typeof ReactiveQueryBuilderWhereOperators,
    value: any
  ): this
  andWhereNot(value: boolean): this
  andWhereNot(key: any, operator?: any, value?: any): this {
    return this.#whereNot(key, operator, value, 'and')
  }

  /**
   * Adds an OR where clause that negates the condition.
   * Matches records that satisfy either the previous conditions OR do NOT match this condition.
   *
   * @example
   * ```typescript
   * // Find active users OR non-basic accounts
   * const users = await query
   *   .where('active', true)
   *   .orWhereNot('accountType', 'basic')
   *   .fetch()
   *
   * // Complex OR NOT conditions
   * const products = await query
   *   .where('featured', true)
   *   .orWhereNot(query =>
   *     query.where('price', '<', 100)
   *         .where('rating', '<', 4)
   *   )
   *   .fetch()
   * ```
   */
  orWhereNot(callback: ReactiveQueryBuilderSubQuery<OM, T, PK, R, H>): this
  orWhereNot(conditions: Partial<T>): this
  orWhereNot<K extends StringKeyOf<T>>(key: K, value: T[K]): this
  orWhereNot<K extends StringKeyOf<T>>(
    key: K,
    operator: keyof typeof ReactiveQueryBuilderWhereOperators,
    value: any
  ): this
  orWhereNot(value: boolean): this
  orWhereNot(key: any, operator?: any, value?: any): this {
    return this.#whereNot(key, operator, value, 'or')
  }

  /**
   * Filters records where a column's value is in the given array.
   * Uses Dexie's native anyOf method for better performance when possible.
   *
   * @param key - The column name to check
   * @param value - Array of values to match against
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * // Find users with specific roles
   * const admins = await query
   *   .whereIn('role', ['admin', 'superadmin'])
   *   .fetch()
   *
   * // Find products in specific categories
   * const products = await query
   *   .whereIn('categoryId', [1, 2, 3])
   *   .fetch()
   * ```
   */
  whereIn(key: StringKeyOf<T>, value: Array<any>): this {
    return this.#where(key, 'in', value)
  }

  /**
   * Alias for whereIn that makes queries more readable when chaining conditions.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('active', true)
   *   .andWhereIn('status', ['pending', 'processing'])
   *   .fetch()
   * ```
   */
  andWhereIn(key: StringKeyOf<T>, value: any): this {
    return this.whereIn(key, value)
  }

  /**
   * Adds an OR condition checking if a column's value is in the given array.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('department', 'sales')
   *   .orWhereIn('role', ['manager', 'lead'])
   *   .fetch()
   * ```
   */
  orWhereIn(key: StringKeyOf<T>, value: any): this {
    return this.#where(key, 'in', value, 'or')
  }

  /**
   * Filters records where a column's value is NOT in the given array.
   * Uses Dexie's native noneOf method for better performance when possible.
   *
   * @param key - The column name to check
   * @param value - Array of values to exclude
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * // Find users excluding specific roles
   * const users = await query
   *   .whereNotIn('role', ['guest', 'blocked'])
   *   .fetch()
   *
   * // Find orders excluding certain statuses
   * const orders = await query
   *   .whereNotIn('status', ['cancelled', 'refunded'])
   *   .fetch()
   * ```
   */
  whereNotIn(key: StringKeyOf<T>, value: any): this {
    return this.#where(key, 'not in', value)
  }

  /**
   * Alias for whereNotIn that makes queries more readable when chaining conditions.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('active', true)
   *   .andWhereNotIn('category', ['archived', 'deleted'])
   *   .fetch()
   * ```
   */
  andWhereNotIn(key: StringKeyOf<T>, value: any): this {
    return this.whereNotIn(key, value)
  }

  /**
   * Adds an OR condition checking if a column's value is NOT in the given array.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('department', 'sales')
   *   .orWhereNotIn('status', ['inactive', 'suspended'])
   *   .fetch()
   * ```
   */
  orWhereNotIn(key: StringKeyOf<T>, value: any): this {
    return this.#where(key, 'not in', value, 'or')
  }

  /**
   * Filters records where a column's value is `NULL`.
   * Useful for finding records with missing or unset values.
   *
   * @param key - The column name to check for `NULL`
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * // Find users with no email set
   * const users = await query
   *   .whereNull('email')
   *   .fetch()
   *
   * // Find orders with no completion date
   * const orders = await query
   *   .whereNull('completedAt')
   *   .fetch()
   * ```
   */
  whereNull(key: StringKeyOf<T>): this {
    return this.#where(key, 'is', null)
  }

  /**
   * Alias for whereNull that makes queries more readable when chaining conditions.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('active', true)
   *   .andWhereNull('deletedAt')
   *   .fetch()
   * ```
   */
  andWhereNull(key: StringKeyOf<T>): this {
    return this.whereNull(key)
  }

  /**
   * Adds an OR condition checking if a column's value is `NULL`.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('status', 'pending')
   *   .orWhereNull('processedAt')
   *   .fetch()
   * ```
   */
  orWhereNull(key: StringKeyOf<T>): this {
    return this.#where(key, 'is', null, 'or')
  }

  /**
   * Filters records where a column's value is NOT `NULL`.
   * Useful for finding records with populated or set values.
   *
   * @param key - The column name to check for NOT `NULL`
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * // Find users with email set
   * const users = await query
   *   .whereNotNull('email')
   *   .fetch()
   *
   * // Find completed orders
   * const orders = await query
   *   .whereNotNull('completedAt')
   *   .fetch()
   * ```
   */
  whereNotNull(key: StringKeyOf<T>): this {
    return this.#where(key, 'is not', null)
  }

  /**
   * Alias for whereNotNull that makes queries more readable when chaining conditions.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('active', true)
   *   .andWhereNotNull('verifiedAt')
   *   .fetch()
   * ```
   */
  andWhereNotNull(key: StringKeyOf<T>): this {
    return this.whereNotNull(key)
  }

  /**
   * Adds an OR condition checking if a column's value is NOT `NULL`.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('status', 'pending')
   *   .orWhereNotNull('processedAt')
   *   .fetch()
   * ```
   */
  orWhereNotNull(key: StringKeyOf<T>): this {
    return this.#where(key, 'is not', null, 'or')
  }

  /**
   * Filters records where a column's value is between two values (inclusive).
   * Uses Dexie's native between method for better performance when possible.
   *
   * @param key - The column name to check
   * @param value - Array containing [min, max] values
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * // Find users with age between 18 and 30
   * const users = await query
   *   .whereBetween('age', [18, 30])
   *   .fetch()
   *
   * // Find orders within a date range
   * const orders = await query
   *   .whereBetween('createdAt', [startDate, endDate])
   *   .fetch()
   * ```
   */
  whereBetween(key: StringKeyOf<T>, value: [any, any]): this {
    return this.#where(key, 'between', value)
  }

  /**
   * Alias for whereBetween that makes queries more readable when chaining conditions.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('active', true)
   *   .andWhereBetween('price', [10, 100])
   *   .fetch()
   * ```
   */
  andWhereBetween(key: StringKeyOf<T>, value: any): this {
    return this.whereBetween(key, value)
  }

  /**
   * Adds an OR condition checking if a column's value is between two values.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('category', 'electronics')
   *   .orWhereBetween('rating', [4, 5])
   *   .fetch()
   * ```
   */
  orWhereBetween(key: StringKeyOf<T>, value: any): this {
    return this.#where(key, 'between', value, 'or')
  }

  /**
   * Filters records where a column's value is NOT between two values.
   * Useful for finding records outside a specific range.
   *
   * @param key - The column name to check
   * @param value - Array containing [min, max] values to exclude
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * // Find users with age outside 18-30
   * const users = await query
   *   .whereNotBetween('age', [18, 30])
   *   .fetch()
   *
   * // Find orders outside a date range
   * const orders = await query
   *   .whereNotBetween('createdAt', [startDate, endDate])
   *   .fetch()
   * ```
   */
  whereNotBetween(key: StringKeyOf<T>, value: any): this {
    return this.#where(key, 'not between', value)
  }

  /**
   * Alias for whereNotBetween that makes queries more readable when chaining conditions.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('active', true)
   *   .andWhereNotBetween('price', [0, 10])
   *   .fetch()
   * ```
   */
  andWhereNotBetween(key: StringKeyOf<T>, value: any): this {
    return this.whereNotBetween(key, value)
  }

  /**
   * Adds an OR condition checking if a column's value is NOT between two values.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('category', 'premium')
   *   .orWhereNotBetween('rating', [1, 3])
   *   .fetch()
   * ```
   */
  orWhereNotBetween(key: StringKeyOf<T>, value: any): this {
    return this.#where(key, 'not between', value, 'or')
  }

  /**
   * Filters records where a column's value matches a pattern (case-sensitive).
   * Supports SQL LIKE patterns: % for any characters, _ for single character.
   *
   * @param key - The column name to check
   * @param value - The pattern to match against
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * // Find users with email ending in @gmail.com
   * const users = await query
   *   .whereLike('email', '%@gmail.com')
   *   .fetch()
   *
   * // Find products with names starting with 'iPhone'
   * const products = await query
   *   .whereLike('name', 'iPhone%')
   *   .fetch()
   * ```
   */
  whereLike(key: StringKeyOf<T>, value: any): this {
    return this.#where(key, 'like', value)
  }

  /**
   * Alias for whereLike that makes queries more readable when chaining conditions.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('active', true)
   *   .andWhereLike('name', 'John%')
   *   .fetch()
   * ```
   */
  andWhereLike(key: StringKeyOf<T>, value?: any): this {
    return this.whereLike(key, value)
  }

  /**
   * Adds an OR condition checking if a column matches a pattern (case-sensitive).
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('category', 'phones')
   *   .orWhereLike('description', '%wireless%')
   *   .fetch()
   * ```
   */
  orWhereLike(key: StringKeyOf<T>, value?: any): this {
    return this.#where(key, 'like', value, 'or')
  }

  /**
   * Filters records where a column's value matches a pattern (case-insensitive).
   * Supports SQL LIKE patterns: % for any characters, _ for single character.
   *
   * @param key - The column name to check
   * @param value - The pattern to match against
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * // Find users with name containing 'john' (any case)
   * const users = await query
   *   .whereILike('name', '%john%')
   *   .fetch()
   *
   * // Find products with description containing 'premium'
   * const products = await query
   *   .whereILike('description', '%premium%')
   *   .fetch()
   * ```
   */
  whereILike(key: StringKeyOf<T>, value?: any): this {
    return this.#where(key, 'ilike', value)
  }

  /**
   * Alias for whereILike that makes queries more readable when chaining conditions.
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('active', true)
   *   .andWhereILike('tags', '%featured%')
   *   .fetch()
   * ```
   */
  andWhereILike(key: StringKeyOf<T>, value?: any): this {
    return this.whereILike(key, value)
  }

  /**
   * Adds an OR condition checking if a column matches a pattern (case-insensitive).
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('category', 'electronics')
   *   .orWhereILike('brand', '%apple%')
   *   .fetch()
   * ```
   */
  orWhereILike(key: StringKeyOf<T>, value?: any): this {
    return this.#where(key, 'ilike', value, 'or')
  }

  /**
   * Filters records where a column's value exists (is not {@link null} or {@link undefined}).
   *
   * @param key - {@link StringKeyOf} the column name to check for existence
   * @returns The query builder instance for chaining
   *
   * @see {@link where}
   *
   * @example
   * ```typescript
   * // Find records where 'email' field exists
   * const results = await query
   *   .whereExists('email')
   *   .fetch()
   * ```
   */
  whereExists(key: StringKeyOf<T>): this {
    return this.#where(key, 'exists', true)
  }

  /**
   * Filters records where a column's value does not exist (is {@link null} or {@link undefined}).
   *
   * @param key - {@link StringKeyOf} the column name to check for non-existence
   * @returns The query builder instance for chaining
   *
   * @see {@link whereNot}
   *
   * @example
   * ```typescript
   * // Find records where 'deletedAt' field is not set
   * const results = await query
   *   .whereNotExists('deletedAt')
   *   .fetch()
   * ```
   */
  whereNotExists(key: StringKeyOf<T>): this {
    return this.#where(key, 'not exists', true)
  }

  /**
   * Alias for {@link whereExists} that makes queries more readable when chaining conditions.
   *
   * @param key - {@link StringKeyOf} the column name to check for existence
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('active', true)
   *   .andWhereExists('email')
   *   .fetch()
   * ```
   */
  andWhereExists(key: StringKeyOf<T>): this {
    return this.whereExists(key)
  }

  /**
   * Alias for {@link whereNotExists} that makes queries more readable when chaining conditions.
   *
   * @param key - {@link StringKeyOf} the column name to check for non-existence
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('active', true)
   *   .andWhereNotExists('deletedAt')
   *   .fetch()
   * ```
   */
  andWhereNotExists(key: StringKeyOf<T>): this {
    return this.whereNotExists(key)
  }

  /**
   * Adds an OR condition filtering records where a column's value exists.
   *
   * @param key - {@link StringKeyOf} the column name to check for existence
   * @returns The query builder instance for chaining
   *
   * @see {@link orWhere}
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('status', 'pending')
   *   .orWhereExists('processedAt')
   *   .fetch()
   * ```
   */
  orWhereExists(key: StringKeyOf<T>): this {
    return this.#where(key, 'exists', true, 'or')
  }

  /**
   * Adds an OR condition filtering records where a column's value does not exist.
   *
   * @param key - {@link StringKeyOf} the column name to check for non-existence
   * @returns The query builder instance for chaining
   *
   * @see {@link orWhereNot}
   *
   * @example
   * ```typescript
   * const results = await query
   *   .where('status', 'pending')
   *   .orWhereNotExists('processedAt')
   *   .fetch()
   * ```
   */
  orWhereNotExists(key: StringKeyOf<T>): this {
    return this.#where(key, 'not exists', true, 'or')
  }

  /**
   * Increments a numeric column value for all matching records.
   * Only affects columns with number values.
   *
   * @param column - Name of the numeric column to increment
   * @param amount - Amount to increment by (default: 1)
   * @returns Promise resolving to array of updated records
   *
   * @example
   * ```typescript
   * // Increment score by 1 for all active users
   * const updated = await query
   *   .where('active', true)
   *   .increment('score')
   *
   * // Increment points by 10 for high scorers
   * const updated = await query
   *   .where('score', '>', 90)
   *   .increment('points', 10)
   * ```
   */
  async increment(column: StringKeyOf<T>, amount = 1): Promise<Array<IT>> {
    if (this.#unreffed) {
      this.#log('warning', 'Query builder has been unreffed, aborting query')
      throw new QueryBuilderUnreffedException()
    }
    this.#log('info', 'Executing update operation on query results')
    const records = await this.fetch()
    if (Array.isArray(records)) {
      this.#log('debug', `Updating ${records.length} records`)
      records.forEach((record: IT) => {
        if (typeof record[column] === 'number') {
          // @ts-ignore
          record[column] = record[column] + amount
        }
      })
      await Promise.all(records.map((record) => record.save()))
      this.#log('info', `Successfully updated ${records.length} records`)
    }
    return records as Array<IT>
  }

  /**
   * Decrements a numeric column value for all matching records.
   * Only affects columns with number values.
   *
   * @param column - Name of the numeric column to decrement
   * @param amount - Amount to decrement by (default: 1)
   * @returns Promise resolving to array of updated records
   *
   * @example
   * ```typescript
   * // Decrement lives by 1 for all active players
   * const updated = await query
   *   .where('active', true)
   *   .decrement('lives')
   *
   * // Decrement stock by 5 for specific products
   * const updated = await query
   *   .whereIn('productId', ['A1', 'B2'])
   *   .decrement('stock', 5)
   * ```
   */
  async decrement(column: StringKeyOf<T>, amount = 1): Promise<Array<IT>> {
    if (this.#unreffed) {
      this.#log('warning', 'Query builder has been unreffed, aborting query')
      throw new QueryBuilderUnreffedException()
    }
    this.#log('info', 'Executing update operation on query results')
    const records = await this.fetch()
    if (Array.isArray(records)) {
      this.#log('debug', `Updating ${records.length} records`)
      records.forEach((record: IT) => {
        if (typeof record[column] === 'number') {
          // @ts-ignore
          record[column] = record[column] - amount
        }
      })
      await Promise.all(records.map((record) => record.save()))
      this.#log('info', `Successfully updated ${records.length} records`)
    }
    return records as Array<IT>
  }

  /**
   * Paginates through records by applying offset and limit internally.
   * Returns a subset of records for the requested page.
   *
   * @param page - The page number (1-based)
   * @param perPage - Number of records per page (default: 20)
   * @returns Promise resolving to array of records for the requested page
   *
   * @example
   * ```typescript
   * // Get first page with 2 records per page
   * const page1 = await query.orderBy('score').forPage(1, 2)
   * // Returns first 2 records: ['Test1', 'Test2']
   *
   * // Get second page with 2 records per page
   * const page2 = await query.orderBy('score').forPage(2, 2)
   * // Returns next 2 records: ['Test3', 'Test4']
   * ```
   */
  async forPage(page: number, perPage: number = 20) {
    const offset = (page - 1) * perPage
    this.offset(offset).limit(perPage)
    return await this.fetch()
  }

  /**
   * Gets the first record that matches the query.
   * Commonly used with orderBy() to get the record with the lowest value.
   *
   * @returns Promise resolving to the first matching record or undefined if none found
   *
   * @example
   * ```typescript
   * // Get record with lowest score
   * const lowest = await query.orderBy('score').first()
   * // Returns: 'Test1'
   * ```
   */
  first(): Promise<IT | undefined> {
    this.#clauses.push({ method: 'first', args: [] })
    return this.#execute() as Promise<IT | undefined>
  }

  /**
   * Gets the last record that matches the query.
   * Commonly used with orderBy() to get the record with the highest value.
   *
   * @returns Promise resolving to the last matching record or undefined if none found
   *
   * @example
   * ```typescript
   * // Get record with highest score
   * const highest = await query.orderBy('score').last()
   * // Returns: 'Test4'
   * ```
   */
  last(): Promise<IT | undefined> {
    this.#clauses.push({ method: 'last', args: [] })
    return this.#execute() as Promise<IT | undefined>
  }

  /**
   * Limits the number of records returned by the query.
   * Used internally by forPage() for pagination.
   *
   * @param limit - The maximum number of records to return
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * // Get only the first 2 records
   * const records = await query.orderBy('score').limit(2).fetch()
   * // Returns: ['Test1', 'Test2']
   * ```
   */
  limit(limit: number) {
    this.#clauses.push({
      method: 'limit',
      args: [limit],
    })
    return this
  }

  /**
   * Skips a specified number of records before starting to return results.
   * Used internally by forPage() for pagination.
   *
   * @param offset - The number of records to skip
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * // Skip first 2 records and get next 2
   * const records = await query.orderBy('score').offset(2).limit(2).fetch()
   * // Returns: ['Test3', 'Test4']
   * ```
   */
  offset(offset: number) {
    this.#clauses.push({
      method: 'offset',
      args: [offset],
    })
    return this
  }

  /**
   * Orders the query results by a specified column.
   * Uses Dexie's native orderBy functionality for better performance when possible.
   *
   * @param key - The column name to sort by
   * @param direction - The sort direction ('asc' or 'desc')
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * // Sort by score ascending
   * const records = await query.orderBy('score').fetch()
   * // Returns: ['Test1', 'Test2', 'Test3', 'Test4']
   *
   * // Sort by score descending
   * const records = await query.orderBy('score', 'desc').fetch()
   * // Returns: ['Test4', 'Test3', 'Test2', 'Test1']
   * ```
   */
  orderBy(key: StringKeyOf<T>, direction: 'asc' | 'desc' = 'asc') {
    // Use Dexie's native orderBy method
    this.#clauses.push({
      method: 'sortBy',
      args: [String(key), direction],
    })

    return this
  }

  /**
   * Preload the relationship(s) for the model when the results are fetched.
   * @param relationship The relationship to preload.
   * @returns the query builder instance for chaining.
   */
  with(relationship: StringKeyOf<R>, ...relationships: StringKeyOf<R>[]) {
    if (!this.#relatable.includes(relationship)) {
      throw new ReactiveModelQueryException(
        new Error(`The relationship ${relationship} is not defined for this model`)
      )
    }
    this.#relations.add(relationship)
    relationships.forEach((relation) => {
      if (!this.#relatable.includes(relation)) {
        throw new ReactiveModelQueryException(
          new Error(`The relationship ${relation} is not defined for this model`)
        )
      }
      this.#relations.add(relation)
    })
    return this
  }

  /**
   * Preload all relationships for the model when the results are fetched.
   * @returns the query builder instance for chaining.
   */
  withAll() {
    this.#relatable.forEach((relation) => {
      this.#relations.add(relation)
    })
    return this
  }

  /**
   * Clears all query conditions and clauses, resetting the query builder to its initial state.
   * Removes all where conditions, ordering, limits, and offsets.
   *
   * @returns The query builder instance for chaining
   *
   * @example
   * ```typescript
   * // Build a complex query
   * const query = Model.query()
   *   .where('score', '>', 80)
   *   .orderBy('name')
   *   .limit(10)
   *
   * // Clear all conditions and start fresh
   * query.clear()
   * const count = await query.count() // counts all records
   * ```
   */
  clear() {
    while (this.#clauses.length) {
      this.#clauses.pop()
    }
    while (this.#whereConditions.length) {
      this.#whereConditions.pop()
    }
    return this
  }

  /**
   * Creates a copy of the current query builder with all its conditions and clauses.
   * Useful when you want to reuse a base query but add different conditions.
   *
   * @param introspector - Optional introspector for testing and debugging
   * @returns A new query builder instance with the same conditions
   *
   * @example
   * ```typescript
   * // Create a base query
   * const baseQuery = Model.query().where('active', true)
   *
   * // Clone and add more conditions
   * const adminQuery = baseQuery.clone().where('role', 'admin')
   * const userQuery = baseQuery.clone().where('role', 'user')
   *
   * // Original query remains unchanged
   * const activeRecords = await baseQuery.fetch()
   * ```
   */
  clone(introspector?: ReactiveQueryBuilderIntrospector<OM, T, PK, R, H>) {
    return new ReactiveQueryBuilder<OM, T, PK, R, H>(
      this.#hooks,
      this.#ctor,
      this.#table,
      this.#relatable,
      this.#primaryKey,
      this.#logBus,
      this.#eventBus,
      this.#addCleanupCallback,
      [...this.#clauses],
      Array.from(this.#relations),
      [...this.#whereConditions],
      introspector
    )
  }

  /**
   * Executes the query and returns the results.
   * Used internally by pagination methods like forPage(), first(), and last().
   *
   * @returns Promise resolving to an array of matching records
   *
   * @example
   * ```typescript
   * // Basic fetch of all records
   * const all = await query.fetch()
   *
   * // Fetch with filtering and sorting
   * const filtered = await query
   *   .where('score', '>', 80)
   *   .orderBy('name')
   *   .fetch()
   * ```
   */
  fetch() {
    return this.#execute()
  }

  /** @private */
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: (value: Array<IT>) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2> {
    // @ts-ignore
    return this.#execute().then(onfulfilled, onrejected)
  }

  /**
   * Returns a set of reactive query response factories for this query builder.
   *
   * The returned object provides methods to create reactive query responses for
   * fetching collections, single results (first/last), and paginated results.
   *
   * Each method returns a new instance of a reactive response class that will
   * automatically update when relevant changes occur in the underlying data.
   *
   * @returns An object with methods to create reactive query responses:
   * - `fetch`: Returns a reactive collection response for the current query.
   * - `first`: Returns a reactive response for the first matching record.
   * - `last`: Returns a reactive response for the last matching record.
   * - `forPage`: Returns a reactive collection response for a specific page.
   * - `count`: Returns a reactive response for the count of matching records.
   *
   * @example
   * ```typescript
   * // Get a reactive collection
   * const collection = await query.where('active', true).reactive().fetch()
   * collection.value // Array of matching records
   * collection.on('next', users => { ... })
   *
   * // Get a reactive first result
   * const firstUser = await query.where('active', true).reactive().first()
   * firstUser.value // First matching record or undefined
   * firstUser.on('next', user => { ... })
   *
   * // Get a reactive paginated collection
   * const page1 = await query.where('active', true).reactive().forPage(1, 10)
   * page1.value // First 10 matching records
   * page1.on('next', users => { ... })
   * ```
   */
  reactive() {
    if (this.#unreffed) {
      this.#log('warning', 'Query builder has been unreffed, aborting query')
      throw new QueryBuilderUnreffedException()
    }
    const modelName = this.#ctor.name
    const modelPrimaryKey = this.#primaryKey
    const evaluateWhere = this.#evaluateConditionsFor.bind(this, [...this.#whereConditions])
    /**
     * An object containing factory methods for creating reactive query responses.
     *
     * @property fetch - Creates a reactive response for the current query collection.
     * @property first - Creates a reactive response for the first matching record.
     * @property last - Creates a reactive response for the last matching record.
     * @property forPage - Creates a reactive response for a specific page of results.
     * @property count - Creates a reactive response for the count of matching records.
     */
    const reactiveResults = {
      /**
       * Creates a reactive response for the current query collection.
       * @returns A ReactiveQueryCollection instance that emits updates when the result set changes.
       */
      fetch: async () => {
        const promiseBus = new TypedEventEmitter<PromiseBusEventMap>()
        const promise = new Promise<void>((resolve) => {
          promiseBus.once('resolve', resolve)
        })
        const response = new ReactiveQueryCollection<T, PK, R, H>(
          this,
          modelName,
          modelPrimaryKey,
          this.#eventBus,
          evaluateWhere,
          this.#addCleanupCallback,
          () => promiseBus.emit('resolve'),
          this.#hooks
        )
        await promise
        return response
      },
      /**
       * Creates a reactive response for the first matching record.
       * @returns A ReactiveQueryResult instance that emits updates for the first result.
       */
      first: async () => {
        this.#clauses.push({ method: 'first', args: [] })
        const promiseBus = new TypedEventEmitter<PromiseBusEventMap>()
        const promise = new Promise<void>((resolve) => {
          promiseBus.once('resolve', resolve)
        })
        const response = new ReactiveQueryResult<T, PK, R, H>(
          this,
          modelName,
          modelPrimaryKey,
          this.#eventBus,
          evaluateWhere,
          this.#addCleanupCallback,
          () => promiseBus.emit('resolve'),
          this.#hooks
        )
        await promise
        return response
      },
      /**
       * Creates a reactive response for the last matching record.
       * @returns A ReactiveQueryResult instance that emits updates for the last result.
       */
      last: async () => {
        this.#clauses.push({ method: 'last', args: [] })
        const promiseBus = new TypedEventEmitter<PromiseBusEventMap>()
        const promise = new Promise<void>((resolve) => {
          promiseBus.once('resolve', resolve)
        })
        const response = new ReactiveQueryResult<T, PK, R, H>(
          this,
          modelName,
          modelPrimaryKey,
          this.#eventBus,
          evaluateWhere,
          this.#addCleanupCallback,
          () => promiseBus.emit('resolve'),
          this.#hooks
        )
        await promise
        return response
      },
      /**
       * Creates a reactive response for a specific page of results.
       * @param page - The page number (1-based)
       * @param perPage - The number of records per page (default: 20)
       * @returns A ReactiveQueryCollection instance for the specified page.
       */
      forPage: async (page: number, perPage: number = 20) => {
        const offset = (page - 1) * perPage
        this.offset(offset).limit(perPage)
        const promiseBus = new TypedEventEmitter<PromiseBusEventMap>()
        const promise = new Promise<void>((resolve) => {
          promiseBus.once('resolve', resolve)
        })
        const response = new ReactiveQueryCollection<T, PK, R, H>(
          this,
          modelName,
          modelPrimaryKey,
          this.#eventBus,
          evaluateWhere,
          this.#addCleanupCallback,
          () => promiseBus.emit('resolve'),
          this.#hooks
        )
        await promise
        return response
      },
      /**
       * Creates a reactive response for the count of matching records.
       * @returns A ReactiveQueryResult instance that emits updates for the count.
       */
      count: async () => {
        this.#clauses.push({ method: 'count', args: [] })
        const promiseBus = new TypedEventEmitter<PromiseBusEventMap>()
        const promise = new Promise<void>((resolve) => {
          promiseBus.once('resolve', resolve)
        })
        const response = new ReactiveQueryResult<T, PK, R, H, number>(
          this,
          modelName,
          modelPrimaryKey,
          this.#eventBus,
          evaluateWhere,
          this.#addCleanupCallback,
          () => promiseBus.emit('resolve'),
          this.#hooks
        )
        await promise
        return response
      },
    }
    Object.freeze(reactiveResults)
    return reactiveResults
  }
}
