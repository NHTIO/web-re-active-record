import { ReactiveQueryResponse } from './common'
import type { PlainObject, StringKeyOf } from '../types'
import type { ReactiveModel } from '../factory_reactive_model'
import type { ReactiveQueryResponseInterface } from './common'
import type { UnifiedEventBus } from '../class_unified_event_bus'
import type { ReactiveDatabaseOptions } from '../class_reactive_database'
import type { ReactiveQueryBuilder } from '../class_reactive_query_builder'
import type { RelationshipConfiguration } from '@nhtio/web-re-active-record/relationships'

/**
 * Provides a reactive, observable response for a query that returns a single model instance or undefined.
 *
 * This class is used for queries that return a single result (e.g., `.first()` or `.find()`),
 * and will automatically re-fetch the result when relevant model events occur on the event bus.
 *
 * @typeParam T - The type of the model's data.
 * @typeParam PK - The type of the primary key field.
 * @typeParam R - The relationships configuration for the model.
 * @typeParam M - The model instance type (defaults to {@link ReactiveModel}).
 *
 * @example
 * // Use the query builder's .reactive() method to get a ReactiveQueryResult
 * const userQuery = db.model('users').where(...)
 * const reactive = await userQuery.reactive()
 * const response = await reactive.first() // returns a ReactiveQueryResult
 * response.on('next', (user) => { ... })
 * response.on('error', (err) => { ... })
 * response.on('complete', () => { ... })
 * // ...
 * response.unmount()
 */
export class ReactiveQueryResult<
    T extends PlainObject,
    PK extends StringKeyOf<T>,
    R extends Record<string, RelationshipConfiguration>,
    H extends Required<ReactiveDatabaseOptions['hooks']>,
    M = ReactiveModel<T, PK, R>,
  >
  extends ReactiveQueryResponse<M | undefined>
  implements ReactiveQueryResponseInterface<M | undefined>
{
  /**
   * Constructs a new ReactiveQueryResult.
   *
   * @param query - The query builder instance to execute.
   * @param model - The name of the model/table being queried.
   * @param primaryKey - The primary key field for the model.
   * @param bus - The UnifiedEventBus for event-driven updates.
   * @param evaluateWhere - A function to evaluate if a model instance matches the query's where conditions.
   * @param addCleanupCallback - Registers a cleanup callback for unmounting.
   * @param resolve - A function to resolve the initial query run promise.
   * @private
   */
  constructor(
    query: ReactiveQueryBuilder<any, T, PK, R, H>,
    model: string,
    primaryKey: PK,
    bus: UnifiedEventBus,
    evaluateWhere: (item: any) => boolean,
    addCleanupCallback: (cb: () => Promise<void>) => void,
    resolve: () => void,
    hooks: H
  ) {
    super(query, model, primaryKey, bus, evaluateWhere, addCleanupCallback, resolve)
    if (
      'object' === typeof hooks &&
      hooks !== null &&
      'wrapReactiveQueryResult' in hooks &&
      typeof hooks.wrapReactiveQueryResult === 'function'
    ) {
      return hooks.wrapReactiveQueryResult(this)
    }
  }
}
