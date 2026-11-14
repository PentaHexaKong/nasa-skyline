import { afterEach, beforeEach, expect, test, vi } from 'vitest'

let system: EventTarget & { matches: boolean }
let browser: EventTarget & { matchMedia: ReturnType<typeof vi.fn>; localStorage: Storage }
let dataset: Record<string, string>

beforeEach(() => {
  vi.resetModules()
  system = Object.assign(new EventTarget(), { matches: true })
  browser = Object.assign(new EventTarget(), {
    matchMedia: vi.fn(() => system),
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn() } as unknown as Storage,
  })
  dataset = {}
  vi.stubGlobal('window', browser)
  vi.stubGlobal('document', { documentElement: { dataset } })
})

afterEach(() => vi.unstubAllGlobals())

test('respects the OS by default, but an explicit full preference enables motion', async () => {
  const { reducedMotion, setMotionPreference } = await import('./motion')
  const motion = reducedMotion()
  expect(motion.matches).toBe(true)
  setMotionPreference('full')
  expect(motion.matches).toBe(false)
  expect(dataset.motion).toBe('full')
  expect(browser.localStorage.setItem).toHaveBeenCalledWith('skyline-motion', 'full')
  setMotionPreference('system')
  expect(motion.matches).toBe(true)
})

test('an explicit reduced preference stops motion even when the OS allows it', async () => {
  system.matches = false
  const { reducedMotion, setMotionPreference } = await import('./motion')
  expect(reducedMotion().matches).toBe(false)
  setMotionPreference('reduced')
  expect(reducedMotion().matches).toBe(true)
})

test('restores the saved preference on a later visit', async () => {
  vi.mocked(browser.localStorage.getItem).mockReturnValue('full')
  const { reducedMotion, getMotionPreference } = await import('./motion')
  expect(getMotionPreference()).toBe('full')
  expect(reducedMotion().matches).toBe(false)
})

test('wakes renderers on site and OS changes, and removes listeners on cleanup', async () => {
  const { reducedMotion, setMotionPreference } = await import('./motion')
  const motion = reducedMotion()
  const changed = vi.fn()
  motion.addEventListener('change', changed)
  setMotionPreference('full')
  expect(changed).toHaveBeenCalledTimes(1)
  system.dispatchEvent(new Event('change'))
  expect(changed).toHaveBeenCalledTimes(2)
  motion.removeEventListener('change', changed)
  setMotionPreference('system')
  system.dispatchEvent(new Event('change'))
  expect(changed).toHaveBeenCalledTimes(2)
})

test('the site preference still works when storage is blocked', async () => {
  vi.mocked(browser.localStorage.getItem).mockImplementation(() => {
    throw new Error('Blocked')
  })
  vi.mocked(browser.localStorage.setItem).mockImplementation(() => {
    throw new Error('Blocked')
  })
  const { reducedMotion, setMotionPreference } = await import('./motion')
  expect(reducedMotion().matches).toBe(true)
  setMotionPreference('full')
  expect(reducedMotion().matches).toBe(false)
})
