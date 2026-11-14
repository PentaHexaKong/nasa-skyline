import { type RoverSimInput, simulateRover } from './roverSim'

export type RoverSimMessage =
  | { type: 'progress'; share: number }
  | { type: 'result'; result: ReturnType<typeof simulateRover> }
  | { type: 'error'; message: string }

const post = (message: RoverSimMessage, transfer: Transferable[] = []) => self.postMessage(message, { transfer })

self.onmessage = (event: MessageEvent<RoverSimInput>) => {
  try {
    let last = -1
    const result = simulateRover(event.data, (share) => {
      // A message per percent is plenty for a progress bar.
      const pct = Math.floor(share * 100)
      if (pct > last) {
        last = pct
        post({ type: 'progress', share })
      }
    })
    post({ type: 'result', result }, [result.arrivalS.buffer, result.steep.buffer])
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : 'The rover simulation failed.' })
  }
}
