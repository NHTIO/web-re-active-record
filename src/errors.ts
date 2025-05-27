/**
 * Errors used by the Reactive Active Record ORM
 * @module @nhtio/web-re-active-record/errors
 */

import type { ValidationError } from 'joi'

/**
 * Describes the options for the ReActiveRecordError class.
 */
export interface ReActiveRecordErrorOptions {
  /**
   * The cause data property of an Error instance indicates the specific original cause of the error.
   */
  cause?: Error
  /**
   * How many rows to trim from the stack trace.
   * This is useful for removing the stack trace of the current function from the error.
   */
  trim?: number
}

/**
 * Base class for all ReActiveRecord errors.
 * @extends Error
 */
class ReActiveRecordError extends Error {
  /** @private */
  readonly $__name: string
  /** @private */
  readonly $__message: string

  /**
   * Creates a new ReActiveRecordError instance.
   * @param message The error message.
   * @param options The error options.
   */
  constructor(name: string, message: string, options?: ReActiveRecordErrorOptions) {
    const superOptions = options ? { cause: options.cause } : {}
    super(message, superOptions)
    const ErrorConstructor = this.constructor
    Object.setPrototypeOf(this, ErrorConstructor)
    this.$__name = name
    this.$__message = message
    if ('function' === typeof Error.captureStackTrace) {
      Error.captureStackTrace(this, ErrorConstructor)
    }
    if ('string' !== typeof this.stack) {
      Object.defineProperty(this, 'stack', {
        value: '',
        writable: true,
        enumerable: false,
        configurable: true,
      })
    }
    if (this.stack && options && options.trim && options.trim > 0) {
      const stackLines = this.stack.split('\n')
      stackLines.splice(0, options.trim)
      this.stack = stackLines.join('\n')
    }
    Object.defineProperty(this, 'name', {
      get: () => this.$__name,
      enumerable: true,
      configurable: false,
    })
    Object.defineProperty(this, 'message', {
      get: () => this.$__message,
      enumerable: true,
      configurable: false,
    })
  }

  /** @private */
  get name() {
    return this.$__name
  }

  /** @private */
  get message() {
    return this.$__message
  }

  /** @private */
  get [Symbol.toStringTag]() {
    return this.constructor.name
  }

  /** @private */
  toString() {
    return `${this.name}: ${this.message}`
  }

  /** @private */
  [Symbol.toPrimitive](hint: 'number' | 'string' | 'default') {
    switch (hint) {
      case 'string':
        return this.toString()
      default:
        return true
    }
  }

  /** @private */
  static [Symbol.hasInstance](instance: unknown) {
    if ((typeof instance === 'object' && instance !== null) || typeof instance === 'function') {
      const proto = Object.getPrototypeOf(instance)
      return proto.name === this.name || proto === this
    }
    return false
  }
}

export type { ReActiveRecordError }

const messageFromJoiValidationError = (reason: ValidationError | undefined, fallback: string) => {
  return reason ? reason.details.map((d) => d.message).join(' and ') : fallback
}

/**
 * Base class for all ReActiveRecord validation errors.
 */
export class ReActiveRecordValidationError extends ReActiveRecordError {
  /** @private  */
  constructor(
    name: string,
    reason: ValidationError,
    fallback: string,
    options?: ReActiveRecordErrorOptions
  ) {
    const message = messageFromJoiValidationError(reason, fallback)
    super(name, message, {
      ...options,
      cause: reason,
    })
  }
}

/**
 * A utility type for the constructor of an error which extends ReActiveRecordValidationError.
 */
export interface ExtendedReActiveRecordValidationErrorConstructor<
  T extends ReActiveRecordValidationError,
> {
  new (reason: ValidationError): T
}

/**
 * Throw by {@link @nhtio/web-re-active-record!ReactiveDatabase | ReactiveDatabase} when the options provided to the ReactiveDatabase are invalid.
 */
export class InvalidReactiveDatabaseOptionsError extends ReActiveRecordValidationError {
  constructor(reason: ValidationError) {
    super('InvalidReactiveDatabaseOptionsError', reason, 'The options provided are invalid', {
      trim: 2,
    })
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record!ReactiveDatabase | ReactiveDatabase} when an error occurs while initializing the database.
 */
export class ReactiveDatabaseInitializationException extends ReActiveRecordError {
  constructor(reason: unknown) {
    super(
      'ReactiveDatabaseInitializationException',
      'An exception occured while inititializing the ReActiveDatabase',
      {
        cause: reason instanceof Error ? reason : new Error(String(reason)),
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record!ReactiveDatabase | ReactiveDatabase} when a non-existent model is requested.
 */
export class ReactiveDatabaseNoSuchModelException extends ReActiveRecordError {
  constructor(model: string | number | symbol) {
    super(
      'ReactiveDatabaseNoSuchModelException',
      `There is no such model "${String(model)}" defined in the ReActiveDatabase`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveModel | ReactiveModel} when attempting to set the value of a property that does not exist on the model.
 */
export class ReactiveModelNoSuchPropertyException extends ReActiveRecordError {
  constructor(property: string | number | symbol, model: string) {
    super(
      'ReactiveModelNoSuchPropertyException',
      `There is no such property defined on the  "${String(property)}" defined in the ${String(model)}`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveModel | ReactiveModel} when attempting to set the value of a property to a value which cannot be serialized.
 */
export class ReactiveModelUnacceptableValueException extends ReActiveRecordError {
  constructor(property: string | number | symbol, value: any) {
    super(
      'ReactiveModelUnacceptableValueException',
      `Unable to set the property of "${String(property)}" to "${String(value)} because it cannot be serialized`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveModel | ReactiveModel} when attempting to override the primary key of a model instance
 */
export class ReactiveModelCannotOverridePrimaryKeyException extends ReActiveRecordError {
  constructor(property: string | number | symbol, model: string) {
    super(
      'ReactiveModelCannotOverridePrimaryKeyException',
      `You are not allowed to override the primary key property  "${String(property)}" in an instance of ${String(model)}`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveModel | ReactiveModel} when using `findOrFail` or `findByOrFail` methods and no matching instance is found.
 */
export class MissingReactiveModelRecordError extends ReActiveRecordError {
  constructor(property: string | number | symbol, value: any, model: string) {
    super(
      'MissingReactiveModelRecordError',
      `No matching instances of ${String(model)} could be found with "${String(property)}" equal to "${String(value)}"`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveModel | ReactiveModel} when using `firstOrFail`and no matching instances are found.
 */
export class NoReactiveModelRecordError extends ReActiveRecordError {
  constructor(model: string) {
    super('NoReactiveModelRecordError', `No instances of ${String(model)} could be found`, {
      trim: 2,
    })
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveModel | ReactiveModel} when an error occurs while performing a database operation.
 */
export class ReactiveModelQueryException extends ReActiveRecordError {
  constructor(reason: unknown) {
    super(
      'ReactiveModelQueryException',
      'An exception occured while performing the requested operation',
      {
        cause: reason instanceof Error ? reason : new Error(String(reason)),
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveQueryBuilder | ReactiveQueryBuilder} when trying to append a clause to the query builder which is too complex (mixing `and` and `or` clauses).
 */
export class ReactiveQueryBuilderClauseTooComplexError extends ReActiveRecordError {
  constructor() {
    super(
      'ReactiveQueryBuilderClauseTooComplexError',
      'You cannot mix and & or clauses in the same query',
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveModel | ReactiveModel} when trying to update a property on a deleted model instance.
 */
export class ReactiveModelDeletedException extends ReActiveRecordError {
  constructor() {
    super('ReactiveModelDeletedException', 'You cannot update a deleted model instance', {
      trim: 2,
    })
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveModel | ReactiveModel} when trying to subscribe to events on a model instance which is deleted.
 */
export class ReactiveModelUnsubscribableException extends ReActiveRecordError {
  constructor() {
    super(
      'ReactiveModelUnsubscribableException',
      'This model instance has been deleted. No further changes will be made to it and no futher events will be emitted.',
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw when trying to boot relationships for models which do not exist
 */
export class MissingModelException extends ReActiveRecordError {
  constructor(model: string, table: string) {
    super(
      'MissingModelException',
      `Unable to boot relationship. Model ${String(model)} is not defined. Please ensure that you have defined "${String(table)}" in your database configuration.`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw when trying to access the related model instance which has not been prepared first
 */
export class UnpreparedRelationshipException extends ReActiveRecordError {
  constructor(originating: string, related: string) {
    super(
      'UnpreparedRelationshipException',
      `You must prepare the relationship before accessing the related model instance. Please ensure that you have called "prepare" on the "${String(originating)}" model before accessing the "${String(related)}" relationship.`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw when trying to prepare a relationship which has not been booted first
 */
export class RelationshipNotBootedException extends ReActiveRecordError {
  constructor() {
    super('RelationshipNotBootedException', `You must boot the relationship before preparing it.`, {
      trim: 2,
    })
  }
}

/**
 * Throw when trying to create a *Through relationship with no intermediate relationships defined
 */
export class MissingGlueException extends ReActiveRecordError {
  constructor() {
    super(
      'MissingGlueException',
      `Your relationship is missing intermediate relationship definitions`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw when trying to create a relationship on a model's property
 */
export class RelationshipCannotOverridePropertyException extends ReActiveRecordError {
  constructor(model: string, property: string) {
    super(
      'RelationshipCannotOverridePropertyException',
      `The property ${String(property)} on model ${String(model)} is defined as a property and cannot be used as the property of a relationship`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw when trying to execute a query on a query builder from a ReactiveDatabase which has been shut down
 */
export class QueryBuilderUnreffedException extends ReActiveRecordError {
  constructor() {
    super(
      'QueryBuilderUnreffedException',
      `The ReactiveDatabase has been shut down. You cannot execute queries on a query builder from a database which has been shut down`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw when trying to execute static methods on a model from a ReactiveDatabase which has been shut down
 */
export class ShutdownDatabaseException extends ReActiveRecordError {
  constructor() {
    super(
      'ShutdownDatabaseException',
      `The ReactiveDatabase has been shut down. You cannot execute static methods on a model from a database which has been shut down`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveModel | ReactiveModel} when an some properties are missing during a creation operation.
 */
export class ReactiveModelUncreatableException extends ReActiveRecordError {
  constructor(missing: string[]) {
    super(
      'ReactiveModelUncreatableException',
      `The following properties are required to create a new instance of the model: ${missing
        .map((m) => `"${String(m)}"`)
        .join(', ')}`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveModel | ReactiveModel} when trying to save a model instance with values which do not match the constraints.
 */
export class ReactiveModelFailedConstraintsException extends ReActiveRecordValidationError {
  constructor(reason: ValidationError) {
    super(
      'ReactiveModelFailedConstraintsException',
      reason,
      'Some of the properties did not satisfy the constraints of the model',
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveQueryBuilder | ReactiveQueryBuilder} when trying to append a clause to the query builder which is not a valid where operation.
 */
export class ReactiveQueryBuilderInvalidWhereOperationException extends ReActiveRecordError {
  constructor(operator: unknown) {
    super(
      'ReactiveQueryBuilderInvalidWhereOperationException',
      `The operator "${String(operator)}" is not a valid where operation`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveQueryBuilder | ReactiveQueryBuilder} when trying to append a clause to the query builder which is not a valid where operation.
 */
export class ReactiveQueryBuilderNotQuantitivlyComparableValueException extends ReActiveRecordError {
  constructor(value: unknown) {
    super(
      'ReactiveQueryBuilderNotQuantitivlyComparableValueException',
      `The value "${String(value)}" cannot be used in a quantitive comparison. Please use a number, string or date value.`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveQueryBuilder | ReactiveQueryBuilder} when trying to append a clause to the query builder with an unlikable value in a like comparison.
 */
export class ReactiveQueryBuilderNotLikeableException extends ReActiveRecordError {
  constructor(value: unknown) {
    super(
      'ReactiveQueryBuilderNotLikeableException',
      `The value "${String(value)}" cannot be used in a "like" comparison. Please use a string value.`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveQueryBuilder | ReactiveQueryBuilder} when trying to append a clause to the query builder with an uninable value in an inable comparison.
 */
export class ReactiveQueryBuilderNotInnableException extends ReActiveRecordError {
  constructor(value: unknown) {
    super(
      'ReactiveQueryBuilderNotInnableException',
      `The value "${String(value)}" cannot be used in an "in" comparison. Please use an array value.`,
      {
        trim: 2,
      }
    )
  }
}

/**
 * Throw by {@link @nhtio/web-re-active-record/types!ReactiveQueryBuilder | ReactiveQueryBuilder} when trying to append a clause to the query builder with an unbetweenable value in an inable comparison.
 */
export class ReactiveQueryBuilderNotBetweenableException extends ReActiveRecordError {
  constructor(value: unknown) {
    super(
      'ReactiveQueryBuilderNotBetweenableException',
      `The value "${String(value)}" cannot be used in an "between" comparison. Please use an array value.`,
      {
        trim: 2,
      }
    )
  }
}

export class ReactiveQueryResponsePendingValueException extends ReActiveRecordError {
  constructor() {
    super(
      'ReactiveQueryResponsePendingValueException',
      `The query response is still pending. Please wait for the query to complete before accessing the value.`,
      {
        trim: 2,
      }
    )
  }
}

export class ReactiveQueryResponseOperationException extends ReActiveRecordError {
  constructor() {
    super(
      'ReactiveQueryResponseOperationException',
      `An unknown exception occured while trying to retrieve the query response.`,
      {
        trim: 2,
      }
    )
  }
}
