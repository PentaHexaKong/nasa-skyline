import { expect, test } from 'vitest'
import { daylightSpans } from './DayProfile'
import { hhmm, intervalsOn } from './Intervals'

test('lists the intervals that touch a UTC day and marks edges outside it as open', () => {
  const intervals: [string, string][] = [
    ['2027-02-09T23:30:00Z', '2027-02-10T00:15:00Z'],
    ['2027-02-10T13:16:45Z', '2027-02-10T14:23:59Z'],
    ['2027-02-10T23:50:00Z', '2027-02-11T00:10:00Z'],
    ['2027-02-11T09:00:00Z', '2027-02-11T10:00:00Z'],
  ]
  expect(intervalsOn(intervals, '2027-02-10')).toEqual([
    { start: 'before 00:00', end: '00:15:00', minutes: 15 },
    { start: '13:16:45', end: '14:23:59', minutes: 67.23333333333333 },
    { start: '23:50:00', end: 'after 24:00', minutes: 10 },
  ])
})

test('merges consecutive daylit samples into one span and splits at night', () => {
  const track = {
    t_min: [400, 410, 420, 430, 1000],
    az_deg: [0, 0, 0, 0, 0],
    el_deg: [-0.5, 0.2, 1, 2, 3],
    direct_fraction: [0, 0, 0, 0, 0],
  }
  expect(daylightSpans(track, 10)).toEqual([
    [405, 435],
    [995, 1005],
  ])
})

test('formats minutes as hh:mm without ever showing 60 minutes', () => {
  expect([hhmm(0), hhmm(59.6), hhmm(67.2), hhmm(608)]).toEqual(['00:00', '01:00', '01:07', '10:08'])
})
