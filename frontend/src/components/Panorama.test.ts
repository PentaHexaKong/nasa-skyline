import { expect, test } from 'vitest'
import { segments } from './Panorama'

test('splits a Sun track at shadow changes and joins the pieces end to end', () => {
  const track = {
    t_min: [0, 10, 20, 30],
    az_deg: [100, 110, 120, 130],
    el_deg: [1, 2, 3, 4],
    direct_fraction: [0, 1, 1, 0],
  }
  expect(segments(track).map((s) => [s.lit, s.points])).toEqual([
    [
      false,
      [
        [100, 1],
        [110, 2],
      ],
    ],
    [
      true,
      [
        [110, 2],
        [120, 3],
        [130, 4],
      ],
    ],
    [false, [[130, 4]]],
  ])
})

test('does not draw a line across the 0/360 azimuth wrap', () => {
  const track = { t_min: [0, 10], az_deg: [355, 5], el_deg: [-0.5, -0.4], direct_fraction: [0, 0] }
  expect(segments(track).map((s) => s.points)).toEqual([[[355, -0.5]], [[5, -0.4]]])
})
