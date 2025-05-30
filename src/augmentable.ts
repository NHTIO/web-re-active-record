/**
 * Typescript Augmentable Interfaces for use with Advanced Integrations.
 * For more information, see [Advanced Integrations](/advanced-integrations).
 * @module @nhtio/web-re-active-record/augmentable
 */

/**
 * Interface for augmenting ReactiveModel instances with additional properties or methods
 * in advanced integrations. Integrations that add new properties to ReactiveModel should
 * extend this interface via declaration merging.
 *
 * @example
 * declare module '@nhtio/web-re-active-record/augmentable' {
 *   interface ReactiveModelAgumentations {
 *     myCustomProp?: string;
 *   }
 * }
 */
export interface ReactiveModelAgumentations {}

/**
 * Interface for augmenting ReactiveQueryCollection instances with additional properties or methods
 * in advanced integrations. Integrations that add new properties to ReactiveQueryCollection should
 * extend this interface via declaration merging.
 *
 * @example
 * declare module '@nhtio/web-re-active-record/augmentable' {
 *   interface ReactiveQueryCollectionAgumentations {
 *     myCollectionFeature?: boolean;
 *   }
 * }
 */
export interface ReactiveQueryCollectionAgumentations {}

/**
 * Interface for augmenting ReactiveQueryResult instances with additional properties or methods
 * in advanced integrations. Integrations that add new properties to ReactiveQueryResult should
 * extend this interface via declaration merging.
 *
 * @example
 * declare module '@nhtio/web-re-active-record/augmentable' {
 *   interface ReactiveQueryResultAgumentations {
 *     myResultMeta?: unknown;
 *   }
 * }
 */
export interface ReactiveQueryResultAgumentations {}
