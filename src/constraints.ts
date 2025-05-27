/**
 * Constraints for the NHTIO Web Re-Active Record library.
 * @module @nhtio/web-re-active-record/constraints
 */

import { default as Joi } from 'joi'
import { tlds as allTlds } from '@hapi/tlds'
import type { PlainObject, StringKeyOf } from './lib/types'
import type { Root as JoiConstraintValidator, Schema, ObjectSchema } from 'joi'

/**
 * The `joi` library compatible with the NHTIO Web Re-Active Record library
 * @info This library is bundled together with `@nhtio/web-re-active-record` to prevent version discrepancies.
 */
export const joi = Joi as JoiConstraintValidator

/**
 * A list of top-level domains (TLDs) for email validation] imported from `@hapi/tlds`
 * @info This list is bundled together with `@nhtio/web-re-active-record` to prevent version discrepancies.
 */
export const tlds = allTlds

export type { JoiConstraintValidator as Joi }

/**
 * Model validation constraints schema
 */
export type ModelConstraints<Model extends PlainObject> = ObjectSchema<
  Record<StringKeyOf<Model>, Schema>
>

/**
 * Creates a model validation constraints schema
 * @param constraints An object where the keys are the model's properties and the values are the validation constraints
 * @param strict If true, the model will not allow any additional properties that are not defined in the constraints
 * @returns A Joi object schema that can be used to validate the model
 */
export const makeModelConstraints = <Model extends PlainObject>(
  constraints: Record<StringKeyOf<Model>, Schema>,
  strict: boolean = false
): ModelConstraints<Model> => {
  return Joi.object<Record<StringKeyOf<Model>, Schema>>(constraints).unknown(!strict)
}
