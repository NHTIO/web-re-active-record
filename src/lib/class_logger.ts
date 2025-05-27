import type { TypedEventEmitter, EventMap, Key, Listener } from '@nhtio/tiny-typed-emitter'

/**
 * The events and the arguments their callbacks receive for the logger.
 */
export interface LogBusEvent {
  /**
   * Emitted when a log with the level `emerg` is created
   * @event
   */
  emerg: [...any[]]
  /**
   * Emitted when a log with the level `alert` is created
   * @event
   */
  alert: [...any[]]
  /**
   * Emitted when a log with the level `crit` is created
   * @event
   */
  crit: [...any[]]
  /**
   * Emitted when a log with the level `error` is created
   * @event
   */
  error: [...any[]]
  /**
   * Emitted when a log with the level `warning` is created
   * @event
   */
  warning: [...any[]]
  /**
   * Emitted when a log with the level `notice` is created
   * @event
   */
  notice: [...any[]]
  /**
   * Emitted when a log with the level `info` is created
   * @event
   */
  info: [...any[]]
  /**
   * Emitted when a log with the level `debug` is created
   * @event
   */
  debug: [...any[]]
}

/**
 * The map of events for the logger.
 */
export type LogBusEventMap = EventMap<LogBusEvent>

/**
 * The numeric values of the log levels, used to calculate if a message should be consumed based on the desired minimum log level.
 *
 * @tip The "lower" the numeric value of the log level, the more severe the log is.
 */
export enum Severities {
  /**
   * Emergency: system is unusable
   */
  emerg = 0,
  /**
   * Alert: action must be taken immediately
   */
  alert = 1,
  /**
   * Critical: critical conditions
   */
  crit = 2,
  /**
   * Error: error conditions
   */
  error = 3,
  /**
   * Warning: warning conditions
   */
  warning = 4,
  /**
   * Notice: normal but significant condition
   */
  notice = 5,
  /**
   * Informational: informational messages
   */
  info = 6,
  /**
   * Debug: debug-level messages
   */
  debug = 7,
}

/**
 * A class which allows log events to be subscribed to.
 */
export class Logger {
  #logBus: TypedEventEmitter<LogBusEventMap>

  /** @private */
  constructor(logbus: TypedEventEmitter<LogBusEventMap>) {
    this.#logBus = logbus
  }

  /**
   * Subscribe to a log event.
   * @param event The level of the log to listen to
   * @param listener The callback to be called when the log is created
   * @param ctx The `this` context to be used when calling the callback
   * @typeParam K The level of the log to listen to
   */
  on<K>(event: Key<K, LogBusEventMap>, listener: Listener<K, LogBusEventMap>, ctx?: any): this {
    this.#logBus.on(event, listener, ctx)
    return this
  }

  /**
   * Subscribe to a log event once.
   * @param event The level of the log to listen to
   * @param listener The callback to be called when the log is created
   * @param ctx The `this` context to be used when calling the callback
   * @typeParam K The level of the log to listen to
   */
  once<K>(event: Key<K, LogBusEventMap>, listener: Listener<K, LogBusEventMap>, ctx?: any): this {
    this.#logBus.once(event, listener, ctx)
    return this
  }

  /**
   * Unsubscribe from a log event.
   * @param event The level of the log to stop listen to
   * @param listener The callback to be unsubscribed from the log event
   * @typeParam K The level of the log to stop listen to
   */
  off<K>(event: Key<K, LogBusEventMap>, listener?: Listener<K, LogBusEventMap>): this {
    this.#logBus.off(event, listener)
    return this
  }

  /**
   * Subscribe to log events with a severity level greater than or equal to the specified level.
   * @param event The level of the log to listen to
   * @param listener The callback to be called when the log is created
   * @param ctx The `this` context to be used when calling the callback
   * @typeParam K The level of the log to listen to
   *
   * @remarks See {@link Severities} for the list of available log levels and their numeric equivalents.
   */
  subscribe<K>(
    event: Key<K, LogBusEventMap>,
    listener: Listener<K, LogBusEventMap>,
    ctx?: any
  ): this {
    const levelOfEvent = Severities[event as keyof typeof Severities]
    const greaterSeverityLevels = Object.entries(Severities).filter(
      ([_key, value]) => typeof value === 'number' && value <= levelOfEvent
    ) as [keyof typeof Severities, number][]
    for (const [key] of greaterSeverityLevels) {
      this.#logBus.on(key, listener, ctx)
    }
    return this
  }

  /**
   * Subscribe to log events with a severity level greater than or equal to the specified level once.
   * @param event The level of the log to listen to
   * @param listener The callback to be called when the log is created
   * @param ctx The `this` context to be used when calling the callback
   * @typeParam K The level of the log to listen to
   *
   * @remarks See {@link Severities} for the list of available log levels and their numeric equivalents.
   */
  subscribeOnce<K>(
    event: Key<K, LogBusEventMap>,
    listener: Listener<K, LogBusEventMap>,
    ctx?: any
  ): this {
    const levelOfEvent = Severities[event as keyof typeof Severities]
    const greaterSeverityLevels = Object.entries(Severities).filter(
      ([_key, value]) => typeof value === 'number' && value <= levelOfEvent
    ) as [keyof typeof Severities, number][]
    for (const [key] of greaterSeverityLevels) {
      this.#logBus.once(key, listener, ctx)
    }
    return this
  }

  /**
   * Unsubscribe from log events with a severity level greater than or equal to the specified level once.
   * @param event The minimum level of the log to stop listening to
   * @param listener The callback to be unsubscribed from the log event
   * @typeParam K The level of the log to top listen to
   *
   * @remarks See {@link Severities} for the list of available log levels and their numeric equivalents.
   */
  unsubscribe<K>(event: Key<K, LogBusEventMap>, listener: Listener<K, LogBusEventMap>): this {
    const levelOfEvent = Severities[event as keyof typeof Severities]
    const greaterSeverityLevels = Object.entries(Severities).filter(
      ([_key, value]) => typeof value === 'number' && value <= levelOfEvent
    ) as [keyof typeof Severities, number][]
    for (const [key] of greaterSeverityLevels) {
      this.#logBus.off(key, listener)
    }
    return this
  }
}
