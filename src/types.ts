/**
 * Types used by the Reactive Active Record ORM
 * @module @nhtio/web-re-active-record/types
 */

export type { ValidationError, ValidationErrorItem, Context as ValidationErrorContext } from 'joi'
export type { PlainObject, DefaultObjectMap, DataValues, StringKeyOf } from './lib/types'
export type { LogBusEvent, LogBusEventMap, Logger, Severities } from './lib/class_logger'
export type { ErrorHandler } from './lib/class_error_handler'
export type {
  ReactiveDatabaseOptions,
  ReactiveDatabaseInitialOptions,
  ReactiveDatabaseInitialLoggerOptions,
  ReactiveDatabaseModelDefinition,
} from './lib/class_reactive_database'
export type {
  BaseReactiveModel,
  ReactiveModelConstructor,
  ReactiveModel,
  PendingStateChange,
  InferredReactiveModelConstructor,
} from './lib/factory_reactive_model'
export type {
  ReactiveQueryBuilder,
  ReactiveQueryBuilderWhereOperators,
  ReactiveQueryBuilderSubQuery,
} from './lib/class_reactive_query_builder'
export type {
  ReactiveModelChangeEmitterEventMap,
  ReactiveModelChangeEmitterEvent,
  ReactiveModelChangeDelta,
} from './lib/class_reactive_model_change_emitter'
export type { RelationshipBase } from './lib/relationships'
export type { RelatedValueMap } from './lib/types'
export type {
  ReactiveQueryCollection,
  ReactiveQueryResult,
  ReactiveQueryResponse,
  ReactiveQueryResponseEventMap,
} from './lib/reactive_query_responses'

import type { PlainObject, StringKeyOf } from './lib/types'
import type { ReactiveModel } from './lib/factory_reactive_model'
import type { RelationshipConfiguration } from './lib/relationships'
import type { ReactiveQueryCollection, ReactiveQueryResult } from './lib/reactive_query_responses'

/**
 * Generic type for wrapper hooks used in ReactiveDatabaseOptions.hooks.
 * @template Input The input type to be wrapped.
 * @template Output The output (wrapped) type.
 */
export type ReactiveRecordWrapperHook<Input, Output = Input> = (input: Input) => Output

/**
 * Strongly-typed hook for wrapping ReactiveModel instances.
 * @template T Model data type
 * @template PK Primary key type
 * @template R Relationships config
 * @template Output The output (wrapped) type
 */
export type WrapReactiveModelHook<
  T extends PlainObject,
  PK extends StringKeyOf<T>,
  R extends Record<string, RelationshipConfiguration>,
  Output extends ReactiveModel<T, PK, R> = ReactiveModel<T, PK, R>,
> = (model: ReactiveModel<T, PK, R>) => Output

/**
 * Strongly-typed hook for wrapping ReactiveQueryCollection instances.
 * @template T Model data type
 * @template PK Primary key type
 * @template R Relationships config
 * @template M Model instance type
 * @template Output The output (wrapped) type
 */
export type WrapReactiveQueryCollectionHook<
  T extends PlainObject,
  PK extends StringKeyOf<T>,
  R extends Record<string, RelationshipConfiguration>,
  M extends ReactiveModel<T, PK, R>,
  Output extends ReactiveQueryCollection<T, PK, R, any, M> = ReactiveQueryCollection<
    T,
    PK,
    R,
    any,
    M
  >,
> = (collection: ReactiveQueryCollection<T, PK, R, any, M>) => Output

/**
 * Strongly-typed hook for wrapping ReactiveQueryResult instances.
 * @template T Model data type
 * @template PK Primary key type
 * @template R Relationships config
 * @template M Model instance type
 * @template Output The output (wrapped) type
 */
export type WrapReactiveQueryResultHook<
  T extends PlainObject,
  PK extends StringKeyOf<T>,
  R extends Record<string, RelationshipConfiguration>,
  M extends ReactiveModel<T, PK, R>,
  Output extends ReactiveQueryResult<T, PK, R, any, M> = ReactiveQueryResult<T, PK, R, any, M>,
> = (result: ReactiveQueryResult<T, PK, R, any, M>) => Output
