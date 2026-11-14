import { afterEach, describe, expect, it, vi } from 'vitest'
import { postScience } from './scienceRequest'

const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('postScience', () => {
  it('shares one call between two identical requests', async () => {
    const fetch = vi.fn(() => reply({ dataState: 'computed' }))
    vi.stubGlobal('fetch', fetch)
    const [a, b] = await Promise.all([postScience('/x', { site: 'CR1' }), postScience('/x', { site: 'CR1' })])
    expect(a).toEqual({ dataState: 'computed' })
    expect(b).toBe(a)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('waits and asks again while the service is busy', async () => {
    vi.useFakeTimers()
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => reply({ dataState: 'unavailable', error: { code: 'busy', message: 'One at a time' } }))
      .mockImplementationOnce(() => reply({ dataState: 'computed' }))
    vi.stubGlobal('fetch', fetch)
    const pending = postScience('/y', { site: 'SR1' })
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toEqual({ dataState: 'computed' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
