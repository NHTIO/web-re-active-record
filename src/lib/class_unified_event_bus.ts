import { Swarm } from '@nhtio/swarm'
import { TypedEventEmitter } from '@nhtio/tiny-typed-emitter'

import type { ReactiveStateTypedEventMap } from './types'

export class UnifiedEventBus extends TypedEventEmitter<ReactiveStateTypedEventMap> {
  #swarm: Swarm<ReactiveStateTypedEventMap>
  constructor(swarm: Swarm<ReactiveStateTypedEventMap>) {
    super()
    this.#swarm = swarm
    // Forward Swarm events to this bus
    this.#swarm.on('reactivemodel:saved', (model, pk, values) => {
      super.emit('reactivemodel:saved', model, pk, values)
    })
    this.#swarm.on('reactivemodel:deleted', (model, pk) => {
      super.emit('reactivemodel:deleted', model, pk)
    })
  }

  emit<K extends keyof ReactiveStateTypedEventMap>(
    event: K,
    ...args: ReactiveStateTypedEventMap[K]
  ): this {
    // console.log('UnifiedEventBus.emit', event, args, '\n')
    ;(super.emit as any).call(this, event, ...args)
    ;(this.#swarm.emit as any).call(this.#swarm, event, ...args)
    return this
  }
}
