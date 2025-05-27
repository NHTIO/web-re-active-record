/** Error thrown when attempting to reinitialize an already initialized introspector */
export const ERROR_CANNOT_REINITIALIZE = new Error('You cannot re-initialize the introspector')
/** Error thrown when attempting to access properties before initialization */
export const ERROR_CANNOT_ACCESS_BEFORE_INITIALIZATION = new Error(
  'You cannot access introspected properties until the introspector has been passed to a ReactiveModel constructor'
)
