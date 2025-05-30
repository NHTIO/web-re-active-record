import { ReactiveQueryResponse } from './common'
import type { PlainObject, StringKeyOf } from '../types'
import type { ReactiveModel } from '../factory_reactive_model'
import type { ReactiveQueryResponseInterface } from './common'
import type { UnifiedEventBus } from '../class_unified_event_bus'
import type { ReactiveDatabaseOptions } from '../class_reactive_database'
import type { ReactiveQueryBuilder } from '../class_reactive_query_builder'
import type { RelationshipConfiguration } from '@nhtio/web-re-active-record/relationships'
import type { ReactiveQueryCollectionAgumentations } from '@nhtio/web-re-active-record/augmentable'

/**
 * Provides a reactive, observable response for a query that returns a collection of models.
 *
 * This class is used for queries that return multiple results (e.g., `.fetch()` or `.all()`),
 * and will automatically re-fetch the collection when relevant model events occur on the event bus.
 *
 * @typeParam T - The type of the model's data.
 * @typeParam PK - The type of the primary key field.
 * @typeParam R - The relationships configuration for the model.
 * @typeParam M - The model instance type (defaults to {@link ReactiveModel}).
 *
 * @example
 * // Use the query builder's .reactive() method to get a ReactiveQueryCollection
 * const usersQuery = db.model('users').where(...)
 * const reactive = await usersQuery.reactive()
 * const response = await reactive.fetch() // returns a ReactiveQueryCollection
 * response.on('next', (users) => { ... })
 * response.on('error', (err) => { ... })
 * response.on('complete', () => { ... })
 * // ...
 * response.unmount()
 */
export class ReactiveQueryCollection<
    T extends PlainObject,
    PK extends StringKeyOf<T>,
    R extends Record<string, RelationshipConfiguration>,
    H extends Required<ReactiveDatabaseOptions['hooks']>,
    M extends ReactiveModel<T, PK, R> = ReactiveModel<T, PK, R>,
  >
  extends ReactiveQueryResponse<Array<M>>
  implements ReactiveQueryResponseInterface<Array<M>>, ReactiveQueryCollectionAgumentations
{
  /**
   * Constructs a new ReactiveQueryCollection.
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
      'wrapReactiveQueryCollection' in hooks &&
      typeof hooks.wrapReactiveQueryCollection === 'function'
    ) {
      return hooks.wrapReactiveQueryCollection(this)
    }
  }
}
