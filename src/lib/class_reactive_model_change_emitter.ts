import { serialize } from '@nhtio/web-serialization'
import { TypedEventEmitter } from '@nhtio/tiny-typed-emitter'
import type { LogBusEventMap } from './class_logger'
import type { PlainObject, StringKeyOf } from './types'
import type { ReactiveModel } from './factory_reactive_model'
import type { EventMap, Listener } from '@nhtio/tiny-typed-emitter'
import type { RelationshipConfiguration } from '@nhtio/web-re-active-record/relationships'

/**
 * The shape of the value of a reactive model change event.
 */
export interface ReactiveModelChangeDelta<T, K extends StringKeyOf<T>> {
  is: T[K] | undefined
  was: T[K] | undefined
}

/**
 * The events and the arguments their callbacks receive for the reactive model change emitter.
 * @interface
 */
export type ReactiveModelChangeEmitterEvent<T extends PlainObject> = {
  /**
   * Represents an event which emits the full list of reactive properties and their values for "is" and "was" when a change is detected for any property
   * @event
   * @typeParam T - The type of the object being observed
   */
  change: [Partial<T>, Partial<T> | undefined]
  /**
   * Represents an event which emits only the changed properties and their values for "is" and "was" when a change is detected for any property
   * @event
   * @typeParam T - The type of the object being observed
   * @typeParam K - The key of the property that changed
   */
  delta: [Record<StringKeyOf<T>, ReactiveModelChangeDelta<T, StringKeyOf<T>>>]
  /**
   * Represents an event which emits the change for a specific property of the object
   * @event
   * @typeParam T - The type of the object being observed
   */
  [key: `change:${string}`]: [unknown, unknown | undefined]
  /**
   * Represents an event which is emitted when an error is thrown in one of the listeners
   */
  error: [unknown]
}

/**
 * The map of events for the reactive model change emitter.
 * @interface
 */
export type ReactiveModelChangeEmitterEventMap<T extends PlainObject> = EventMap<
  ReactiveModelChangeEmitterEvent<T>
>

export class ReactiveModelChangeEmitter<
  T extends PlainObject,
  PK extends StringKeyOf<T>,
  R extends Record<string, RelationshipConfiguration>,
> {
  readonly #bus: TypedEventEmitter<ReactiveModelChangeEmitterEventMap<T>>
  readonly #is: Map<StringKeyOf<T>, T[StringKeyOf<T>]>
  readonly #was: Map<StringKeyOf<T>, T[StringKeyOf<T>] | undefined>
  readonly #ctx: ReactiveModel<T, PK, R>
  readonly #wrappedListenerWrapper: WeakMap<
    Listener<StringKeyOf<T>, ReactiveModelChangeEmitterEventMap<T>>,
    Listener<StringKeyOf<T>, ReactiveModelChangeEmitterEventMap<T>>
  >

  readonly #pendingChanged: Set<StringKeyOf<T>> = new Set()
  readonly #logBus: TypedEventEmitter<LogBusEventMap>

  constructor(ctx: ReactiveModel<T, PK, R>, logBus: TypedEventEmitter<LogBusEventMap>) {
    this.#ctx = ctx
    this.#is = new Map()
    this.#was = new Map()
    this.#pendingChanged = new Set()
    this.#bus = new TypedEventEmitter<ReactiveModelChangeEmitterEventMap<T>>()
    this.#wrappedListenerWrapper = new WeakMap()
    this.#logBus = logBus
  }

  /**
   * Process the latest state of the object being observed and emit change events if any properties have changed.
   * @param values - The latest state of the object being observed
   */
  next(values: Partial<T>) {
    this.#logBus.emit(
      'debug',
      '[ReactiveModelChangeEmitter] next: Processing state changes for model',
      values
    )
    for (const [key, value] of Object.entries(values)) {
      const changed = this.#wasChanged(key as StringKeyOf<T>, value)
      if (changed) {
        this.#logBus.emit('debug', `Detected change in property "${String(key)}"`)
        this.#pendingChanged.add(key as StringKeyOf<T>)
        const currentValue = this.#is.get(key as StringKeyOf<T>)
        this.#was.set(key as StringKeyOf<T>, currentValue)
        this.#is.set(key as StringKeyOf<T>, value)
      }
    }
    // Do not emit here; batching until flush()
  }

  /**
   * Emit all batched change events and clear the batch. Should be called after save().
   */
  flush() {
    this.#logBus.emit(
      'debug',
      '[ReactiveModelChangeEmitter] flush: Called, pendingChanged:',
      Array.from(this.#pendingChanged)
    )
    if (this.#pendingChanged.size === 0) return
    this.#logBus.emit(
      'debug',
      `Detected ${this.#pendingChanged.size} changed properties: ${Array.from(this.#pendingChanged).join(', ')}`
    )
    this.#onChanged(this.#pendingChanged)
    this.#pendingChanged.clear()
  }

  /**
   * Process the `onChange` event of a related model and emit change events if any properties have changed.
   * @param relationship - The relationship that changed
   * @param is - The new value of the relationship
   * @param was - The old value of the relationship
   */
  nextRelatedChange(
    relationship: StringKeyOf<R> | `${StringKeyOf<R>}.${number}`,
    is: any,
    was: any | undefined
  ) {
    this.#logBus.emit(
      'debug',
      `Processing related change for relationship: ${String(relationship)}`
    )
    this.#bus.emit(
      'change',
      { [relationship]: is },
      was ? { [relationship]: was } : { [relationship]: undefined }
    )
    // Emit property-specific event for reactivity
    this.#bus.emit(`change:${String(relationship)}`, is, was)
  }

  /**
   * Process the `onDelta` event of a related model and emit change events if any properties have changed.
   * @param relationship The relationship that changed
   * @param delta The delta of the relationship
   */
  nextRelatedDelta(
    relationship: StringKeyOf<R> | `${StringKeyOf<R>}.${number}`,
    delta: Record<string, ReactiveModelChangeDelta<any, string>>
  ) {
    this.#logBus.emit('debug', `Processing related delta for relationship: ${String(relationship)}`)
    const is: Record<string, any> = {}
    const was: Record<string, any> = {}
    for (const [key, value] of Object.entries(delta)) {
      is[key] = value.is
      was[key] = value.was
      this.#bus.emit(`change:${String(relationship)}.${key}`, value.is, value.was)
    }
    this.#bus.emit('delta', { [relationship]: is }, { [relationship]: was })
  }

  #wasChanged(key: StringKeyOf<T>, value: T[StringKeyOf<T>]): boolean
  #wasChanged(key: StringKeyOf<R>, value: any): boolean
  #wasChanged(key: any, value: any): boolean {
    const currentValue = this.#is.get(key)
    // Always use serialize, then stringify the result for comparison
    const serializedCurrentValue = JSON.stringify(serialize(currentValue))
    const serializedNextValue = JSON.stringify(serialize(value))
    const hasChanged = serializedCurrentValue !== serializedNextValue
    this.#logBus.emit(
      'debug',
      `#wasChanged: key=${String(key)}, currentValue=${JSON.stringify(currentValue)}, newValue=${JSON.stringify(value)}, serializedCurrentValue=${serializedCurrentValue}, serializedNextValue=${serializedNextValue}, hasChanged=${hasChanged}`
    )
    if (hasChanged) {
      this.#logBus.emit('debug', `Detected change in property "${String(key)}"`)
    }
    return hasChanged
  }

  #onChanged(changed: Set<StringKeyOf<T>>) {
    this.#logBus.emit(
      'debug',
      '[ReactiveModelChangeEmitter] #onChanged: Called with changed:',
      Array.from(changed)
    )
    const partialIsForChangeEvent: Partial<T> = {}
    const wasForChangeEvent: Partial<T> = {}
    const delta: Record<StringKeyOf<T>, ReactiveModelChangeDelta<T, StringKeyOf<T>>> = {} as Record<
      StringKeyOf<T>,
      ReactiveModelChangeDelta<T, StringKeyOf<T>>
    >
    this.#is.forEach((value, key) => {
      partialIsForChangeEvent[key] = value
    })
    this.#was.forEach((value, key) => {
      wasForChangeEvent[key] = value
    })
    changed.forEach((key) => {
      const isForKey = this.#is.get(key)
      const wasForKey = this.#was.get(key)
      delta[key] = {
        is: isForKey,
        was: wasForKey,
      }
    })
    const is: T = partialIsForChangeEvent as T
    const was: Partial<T> | undefined = Object.values(wasForChangeEvent).some(
      (v) => v !== undefined
    )
      ? wasForChangeEvent
      : undefined

    // Manually emit to all listeners for each event, catching errors
    const emitSafe = (event: string, ...args: any[]) => {
      const listeners = (this.#bus.e[event] || []).slice()
      for (const { fn, ctx } of listeners) {
        try {
          fn.apply(ctx, args)
        } catch (error) {
          this.#logBus.emit(
            'debug',
            '[ReactiveModelChangeEmitter] #onChanged: Listener threw error:',
            error
          )
          // Always forward errors to the error event
          const errorListeners = (this.#bus.e['error'] || []).slice()
          for (const { fn: errorFn, ctx: errorCtx } of errorListeners) {
            try {
              errorFn.call(errorCtx, error)
            } catch {}
          }
        }
      }
    }

    emitSafe('change', is, was)
    emitSafe('delta', delta)
    changed.forEach((key) => {
      const isForKey = this.#is.get(key)
      const wasForKey = this.#was.get(key)
      emitSafe(`change:${String(key)}`, isForKey, wasForKey)
    })
  }

  #getWrappedListener(
    listener: Listener<StringKeyOf<T>, ReactiveModelChangeEmitterEventMap<T>>,
    ctx?: any
  ): Listener<StringKeyOf<T>, ReactiveModelChangeEmitterEventMap<T>> {
    const cached = this.#wrappedListenerWrapper.get(listener)
    if (cached) {
      return cached
    }
    const wrapped = (event: StringKeyOf<T>, ...args: any[]) => {
      try {
        if (ctx) {
          listener.call(ctx, event, ...args)
        } else {
          listener(event, ...args)
        }
      } catch (error) {
        this.#logBus.emit(
          'debug',
          '[ReactiveModelChangeEmitter] #getWrappedListener: Listener threw error:',
          error
        )
        // Always forward errors to the error event, do not check event type
        this.#bus.emit('error', error)
      }
    }
    this.#wrappedListenerWrapper.set(listener, wrapped)
    return wrapped
  }

  /**
   * Subscribe a listener to events emitted when any of the properties of the model change.
   * @param listener The callback to be called when the model's properties are changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   */
  onChange(
    listener: Listener<'change', ReactiveModelChangeEmitterEventMap<T>>,
    ctx?: any
  ): ReactiveModel<T, PK, R> {
    this.#bus.on('change', this.#getWrappedListener(listener), ctx)
    return this.#ctx
  }

  /**
   * Subscribe a listener to events emitting the delta of the model when any of the properties change.
   * @param listener The callback to be called when the model's properties are changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   */
  onDelta(
    listener: Listener<'delta', ReactiveModelChangeEmitterEventMap<T>>,
    ctx?: any
  ): ReactiveModel<T, PK, R> {
    this.#bus.on('delta', this.#getWrappedListener(listener), ctx)
    return this.#ctx
  }

  /**
   * Subscribe a listener to events emitted when a specific property of the model changes.
   * @param key The property of the model to listen to
   * @param listener The callback to be called when the model's property is changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   */
  onPropertyChange(
    key: StringKeyOf<T> | StringKeyOf<R>,
    listener: Listener<`change:${string}`, ReactiveModelChangeEmitterEventMap<T>>,
    ctx?: any
  ): ReactiveModel<T, PK, R> {
    this.#bus.on(`change:${String(key)}`, this.#getWrappedListener(listener), ctx)
    return this.#ctx
  }

  /**
   * Subscribe a listener once to events emitted when any of the properties of the model change.
   * @param listener The callback to be called when the model's properties are changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   */
  onceChange(
    listener: Listener<'change', ReactiveModelChangeEmitterEventMap<T>>,
    ctx?: any
  ): ReactiveModel<T, PK, R> {
    this.#bus.once('change', this.#getWrappedListener(listener), ctx)
    return this.#ctx
  }

  /**
   * Subscribe a listener once to events emitting the delta of the model when any of the properties change.
   * @param listener The callback to be called when the model's properties are changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   */
  onceDelta(
    listener: Listener<'delta', ReactiveModelChangeEmitterEventMap<T>>,
    ctx?: any
  ): ReactiveModel<T, PK, R> {
    this.#bus.once('delta', this.#getWrappedListener(listener), ctx)
    return this.#ctx
  }

  /**
   * Subscribe a listener once to events emitted when a specific property of the model changes.
   * @param key The property of the model to listen to
   * @param listener The callback to be called when the model's property is changed
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   */
  oncePropertyChange(
    key: StringKeyOf<T> | StringKeyOf<R>,
    listener: Listener<`change:${string}`, ReactiveModelChangeEmitterEventMap<T>>,
    ctx?: any
  ): ReactiveModel<T, PK, R> {
    this.#bus.once(`change:${String(key)}`, this.#getWrappedListener(listener), ctx)
    return this.#ctx
  }

  /**
   * Unsubscribe a listener or all listeners from events emitted when any of the properties of the model change.
   * @param listener The callback to be called when the model's properties are changed
   * @returns The current ReactiveModel instance
   */
  offChange(
    listener?: Listener<'change', ReactiveModelChangeEmitterEventMap<T>>
  ): ReactiveModel<T, PK, R> {
    if (listener) {
      const wrapped = this.#wrappedListenerWrapper.get(listener)
      this.#bus.off('change', listener)
      this.#bus.off('change', wrapped)
    } else {
      this.#bus.off('change')
    }
    return this.#ctx
  }

  /**
   * Unsubscribe a listener or all listeners from events emitted when the delta of the model changes.
   * @param listener The callback to be called when the model's properties are changed
   * @returns The current ReactiveModel instance
   */
  offDelta(
    listener?: Listener<'delta', ReactiveModelChangeEmitterEventMap<T>>
  ): ReactiveModel<T, PK, R> {
    if (listener) {
      const wrapped = this.#wrappedListenerWrapper.get(listener)
      this.#bus.off('delta', listener)
      this.#bus.off('delta', wrapped)
    } else {
      this.#bus.off('delta')
    }
    return this.#ctx
  }

  /**
   * Unsubscribe a listener or all listeners from events emitted when a specific property of the model changes.
   * @param key The property of the model to listen to
   * @param listener The callback to be called when the model's property is changed
   * @returns The current ReactiveModel instance
   */
  offPropertyChange(
    key: StringKeyOf<T> | StringKeyOf<R>,
    listener?: Listener<`change:${string}`, ReactiveModelChangeEmitterEventMap<T>>
  ): ReactiveModel<T, PK, R> {
    if (listener) {
      const wrapped = this.#wrappedListenerWrapper.get(listener)
      this.#bus.off(`change:${String(key)}`, listener)
      this.#bus.off(`change:${String(key)}`, wrapped)
    } else {
      this.#bus.off(`change:${String(key)}`)
    }
    return this.#ctx
  }

  /**
   * Unsubscribe all listeners from all events
   */
  clear() {
    for (const event in this.#bus.e) {
      this.#bus.off(event as keyof ReactiveModelChangeEmitterEventMap<T>)
    }
  }

  /**
   * Subscribe a listener to events emitted when an error is thrown in one of the listeners.
   * @param listener The callback to be called when an error is thrown
   * @param ctx The `this` context to be used when calling the callback
   * @returns The current ReactiveModel instance
   */
  onError(
    listener: Listener<'error', ReactiveModelChangeEmitterEventMap<T>>,
    ctx?: any
  ): ReactiveModel<T, PK, R> {
    // Register error listeners directly, do not wrap
    this.#bus.on('error', listener, ctx)
    return this.#ctx
  }
}
