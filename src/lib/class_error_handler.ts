import type { TypedEventEmitter, EventMap } from '@nhtio/tiny-typed-emitter'

/**
 * The events and the arguments their callbacks receive for the logger.
 */
export interface ErrorBusEvent {
  error: [Error]
}

/**
 * The map of events for the logger.
 */
export type ErrorBusEventMap = EventMap<ErrorBusEvent>

/**
 * A class which allows asyncronously thrown errors to be consumed and handled
 */
export class ErrorHandler {
  #errorBus: TypedEventEmitter<ErrorBusEventMap>

  /** @private */
  constructor(errorBus: TypedEventEmitter<ErrorBusEventMap>) {
    this.#errorBus = errorBus
  }

  /**
   * Subscribe an error handler.
   * @param listener The callback to be called when the error is thrown
   * @param ctx The `this` context to be used when calling the callback
   */
  on(listener: (err: Error) => void, ctx?: any) {
    this.#errorBus.on('error', listener, ctx)
    return this
  }

  /**
   * Subscribe an error handler for only the next error.
   * @param listener The callback to be called when the error is thrown
   * @param ctx The `this` context to be used when calling the callback
   */
  once(listener: (err: Error) => void, ctx?: any) {
    this.#errorBus.once('error', listener, ctx)
    return this
  }

  /**
   * Unsubscribe an error handler.
   * @param listener The callback to be unsubscribed
   */
  off(listener?: (err: Error) => void) {
    this.#errorBus.off('error', listener)
    return this
  }
}
