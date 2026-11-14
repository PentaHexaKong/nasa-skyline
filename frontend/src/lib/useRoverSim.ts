import { useEffect, useState } from 'react'
import type { RoverSimInput, RoverSimResult } from './roverSim'
import type { RoverSimMessage } from './roverSim.worker'

export type RoverSimState =
  | { status: 'idle' | 'running'; progress: number }
  | { status: 'ready'; result: RoverSimResult }
  | { status: 'error'; message: string }

/** Runs the rover simulation off the main thread. A new input (by identity) restarts it, so callers memoise the input. */
export function useRoverSim(input: RoverSimInput | undefined): RoverSimState {
  const [state, setState] = useState<RoverSimState>({ status: 'idle', progress: 0 })
  useEffect(() => {
    if (!input) {
      setState({ status: 'idle', progress: 0 })
      return
    }
    const worker = new Worker(new URL('./roverSim.worker.ts', import.meta.url), { type: 'module' })
    setState({ status: 'running', progress: 0 })
    worker.onmessage = (event: MessageEvent<RoverSimMessage>) => {
      const m = event.data
      if (m.type === 'progress') setState({ status: 'running', progress: m.share })
      else if (m.type === 'result') setState({ status: 'ready', result: m.result })
      else setState({ status: 'error', message: m.message })
    }
    worker.onerror = (event) => setState({ status: 'error', message: event.message || 'The rover simulation failed.' })
    worker.postMessage(input)
    return () => worker.terminate()
  }, [input])
  return state
}
