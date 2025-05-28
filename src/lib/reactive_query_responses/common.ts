import { Subject, Subscription } from 'rxjs'
import { serialize } from '@nhtio/web-serialization'
import { TypedEventEmitter } from '@nhtio/tiny-typed-emitter'
import {
  ReactiveQueryResponsePendingValueException,
  ReactiveQueryResponseOperationException,
} from '@nhtio/web-re-active-record/errors'
import type { EventMap } from '@nhtio/tiny-typed-emitter'
import type { UnifiedEventBus } from '../class_unified_event_bus'
import type { ReactiveQueryBuilder } from '../class_reactive_query_builder'

/**
 * Events emitted by a {@link ReactiveQueryResponse} instance.
 *
 * @template T The type of the query result value.
 */
export interface ReactiveQueryResponseEvents<T = any> {
  /**
   * Emitted when new query results are available.
   * @param value The latest query result value.
   */
  next: [T]
  /**
   * Emitted when an error occurs during query execution or reactivity.
   * @param error The error encountered.
   */
  error: [Error]
  /**
   * Emitted when the response is unmounted and will no longer emit events.
   */
  complete: []
}

/**
 * Event map for {@link ReactiveQueryResponse} events.
 *
 * @template T The type of the query result value.
 * @interface
 */
export type ReactiveQueryResponseEventMap<T = any> = EventMap<ReactiveQueryResponseEvents<T>>

/**
 * Provides a reactive, observable response to a query, automatically re-fetching results
 * when relevant model events occur on the provided {@link UnifiedEventBus}.
 *
 * This class listens for model save and delete events, and only re-fetches query results
 * if the event is relevant to the current query (e.g., the model/table matches and the row
 * matches the query's where clause). Consumers can subscribe to value changes, errors, and
 * completion events. The response can be unmounted to clean up all resources and event listeners.
 *
 * @template T The type of the query result value.
 *
 * @example
 * // Use the query builder's .reactive() method to get a reactive response
 * const usersQuery = db.model('users').where(...)
 * const reactive = await usersQuery.reactive()
 * const response = await reactive.fetch() // or .first(), .last(), etc.
 * response.on('next', (value) => { ... })
 * response.on('error', (err) => { ... })
 * response.on('complete', () => { ... })
 * // ...
 * response.unmount()
 */
export abstract class ReactiveQueryResponse<T = any> extends TypedEventEmitter<
  ReactiveQueryResponseEventMap<T>
> {
  readonly #query: ReactiveQueryBuilder<any, any, any, any, any>
  readonly #model: string
  // @ts-ignore
  readonly #primaryKey: string
  readonly #bus: UnifiedEventBus
  readonly #observable: Subject<T>
  readonly #subscription: Subscription
  // @ts-ignore
  readonly #evaluateWhere: (item: any) => boolean
  readonly #abortControllers: Set<AbortController>
  readonly #resolve: () => void
  #value: T | undefined
  #queryHasRun: boolean
  #unmounted: boolean
  // Add private fields for bound handlers
  #boundOnSaved?: (modelName: string, _pk: string, values: any) => void
  #boundOnDeleted?: (modelName: string, pk: string) => void

  /**
   * Constructs a new ReactiveQueryResponse.
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
    query: ReactiveQueryBuilder<any, any, any, any, any>,
    model: string,
    primaryKey: string,
    bus: UnifiedEventBus,
    evaluateWhere: (item: any) => boolean,
    addCleanupCallback: (cb: () => Promise<void>) => void,
    resolve: () => void
  ) {
    super()
    this.#query = query
    this.#model = model
    this.#primaryKey = primaryKey
    this.#bus = bus
    this.#evaluateWhere = evaluateWhere
    this.#abortControllers = new Set<AbortController>()
    this.#observable = new Subject<T>()
    this.#subscription = this.#observable.subscribe({
      next: (value: T) => {
        const was = this.#value
        this.#value = value
        if ('undefined' === typeof this.#value || this.#wasChanged(value, was)) {
          super.emit('next', value)
        }
      },
      error: (error: Error) => {
        super.emit('error', error)
      },
      complete: () => {
        super.emit('complete')
      },
    })
    this.#queryHasRun = false
    this.#unmounted = false
    this.#resolve = resolve
    this.#next()

    // Bind event handlers to this instance
    this.#boundOnSaved = this.#onSaved.bind(this)
    this.#boundOnDeleted = this.#onDeleted.bind(this)
    this.#bus.on('reactivemodel:saved', this.#boundOnSaved)
    this.#bus.on('reactivemodel:deleted', this.#boundOnDeleted)
    Object.defineProperty(this, 'value', {
      get: () => {
        if (!this.#queryHasRun) {
          throw new ReactiveQueryResponsePendingValueException()
        }
        return this.#value as T
      },
      enumerable: true,
      configurable: false,
    })
    addCleanupCallback(async () => {
      this.unmount()
    })
  }

  /**
   * Handles model save events from the UnifiedEventBus.
   * Triggers a re-fetch if the saved model matches the query's model and where conditions.
   *
   * @param modelName - The name of the model that was saved.
   * @param _pk - The primary key of the saved model instance.
   * @param values - The saved model values.
   * @private
   */
  #onSaved(modelName: string, _pk: string, _values: any) {
    if (this.#unmounted) {
      return
    }
    if (modelName === this.#model) {
      // Always trigger a re-fetch for any save on the relevant model
      this.#next()
    }
  }

  /**
   * Handles model delete events from the UnifiedEventBus.
   * Triggers a re-fetch if the deleted model matches the query's model and is present in the current result set.
   *
   * @param modelName - The name of the model that was deleted.
   * @param pk - The primary key of the deleted model instance.
   * @private
   */
  #onDeleted(modelName: string, _pk: string) {
    if (this.#unmounted) {
      return
    }
    if (modelName === this.#model) {
      // Always trigger a re-fetch for any delete on the relevant model
      this.#next()
    }
  }

  #wasChanged(is: any, was: any): boolean {
    const serializableCurrentValue = Array.isArray(was)
      ? was.map((i) => i.toObject())
      : 'undefined' !== typeof was && null !== was
        ? // @ts-ignore
          was.toObject()
        : undefined
    const serializableNewValue = Array.isArray(is)
      ? is.map((i) => i.toObject())
      : 'undefined' !== typeof is && null !== is
        ? // @ts-ignore
          is.toObject()
        : undefined
    const serializedCurrentValue = JSON.stringify(serialize(serializableCurrentValue))
    const serializedNewValue = JSON.stringify(serialize(serializableNewValue))
    return serializedCurrentValue !== serializedNewValue
  }

  async #next() {
    if (this.#unmounted) {
      return
    }
    this.#abortControllers.forEach((controller) => controller.abort())
    const abortController = new AbortController()
    this.#abortControllers.add(abortController)
    const cloned = this.#query.clone()
    try {
      const value: T = await cloned.fetch()
      if (abortController.signal.aborted) {
        return
      }
      this.#observable.next(value)
    } catch (error: unknown) {
      if (abortController.signal.aborted) {
        return
      }
      if (error instanceof Error) {
        this.#observable.error(error)
      } else {
        this.#observable.error(new ReactiveQueryResponseOperationException())
      }
    } finally {
      if (!abortController.signal.aborted) {
        this.#queryHasRun = true
        this.#resolve()
      }
      this.#abortControllers.delete(abortController)
    }
  }

  /**
   * Returns the latest query result value. Throws if the initial query has not yet completed.
   *
   * @throws {ReactiveQueryResponsePendingValueException} If the query has not yet run.
   */
  declare value: T

  /**
   * Unmounts the response, aborting any in-flight requests, unsubscribing from all events,
   * and cleaning up all resources. After unmount, no further events will be emitted.
   */
  unmount(): void {
    if (this.#unmounted) return
    this.#unmounted = true
    this.#observable.complete()
    this.#subscription.unsubscribe()
    this.#abortControllers.forEach((controller) => controller.abort())
    this.#abortControllers.clear()
    if (this.#boundOnSaved) this.#bus.off('reactivemodel:saved', this.#boundOnSaved)
    if (this.#boundOnDeleted) this.#bus.off('reactivemodel:deleted', this.#boundOnDeleted)
  }

  /**
   * @hidden
   * @deprecated Do not use. Emitting events externally is not supported for ReactiveQueryResponse.
   * @throws {Error} Always throws if called.
   */
  public override emit(): never {
    throw new Error(
      'ReactiveQueryResponse does not support external emit. Use event listeners only.'
    )
  }
}
