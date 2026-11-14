import { expect, test } from 'vitest'
import { loadSummary, loadTracks } from './data'
import { dayToMoment, differences, hiddenSunDay, INVESTIGATIONS, investigationRecord, observe } from './investigation'

test('slider days count from midnight UTC of the computed window’s first day', () => {
  expect(dayToMoment('2026-11-04', 0)).toEqual({ date: '2026-11-04', minute: 0 })
  expect(dayToMoment('2026-11-04', 8.5)).toEqual({ date: '2026-11-12', minute: 720 })
  expect(dayToMoment('2026-11-04', 29.5)).toEqual({ date: '2026-12-03', minute: 720 })
})

test('the ridge opens on a moment the data says the Sun is up but hidden', async () => {
  const data = await loadSummary('connecting-ridge')
  const tracks = await loadTracks('connecting-ridge')
  const day = hiddenSunDay(data, tracks)
  expect(day).not.toBeNull()
  const o = observe(data, tracks[dayToMoment(data.params.start, day ?? 0).date], day ?? 0)
  expect(o.sun.inView).toBe(false)
  expect(o.sun.el).toBeGreaterThan(0.5)
  // Hidden by terrain: the ridge stands above the Sun in its direction.
  expect(o.sun.clearance).toBeLessThan(0)
})

test('two observations name what changed, and the record carries the evidence and the claims line', async () => {
  const data = await loadSummary('shackleton-rim')
  const tracks = await loadTracks('shackleton-rim')
  const a = observe(data, tracks[dayToMoment(data.params.start, 2).date], 2)
  const b = observe(data, tracks[dayToMoment(data.params.start, 3).date], 3)
  expect(differences(a, b)[0]).toMatch(/^Time: /)
  const md = investigationRecord({
    investigation: INVESTIGATIONS[0],
    prediction: 'The ridge hides it.',
    observations: [a, a, b],
    explanation: 'Because the ridge is higher than the Sun.',
    sources: [
      {
        site: data.site.name,
        algorithm: data.provenance.algorithm_version,
        provenance: data.provenance,
      },
    ],
    link: 'https://example.test/understand/lab',
  })
  expect(md).toContain('# Can a mountain hide the Sun?')
  expect(md).toContain('The ridge hides it.')
  expect(md).toContain(data.provenance.algorithm_version)
  expect(md).toContain('What changed between the last two:')
  expect(md).toContain(`- ${differences(a, b)[0]}`)
  expect(md).toContain(data.provenance.frame)
  expect(md).toContain(data.provenance.kernels[0]!.file)
  expect(md).toContain(data.provenance.kernels[0]!.sha256)
  expect(md).toContain('not delivered power or a working radio link')
})
