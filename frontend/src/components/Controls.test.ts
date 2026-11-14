import { expect, test } from 'vitest'
import { parseField } from './Controls'

const stay = { min: 1, max: 60 }

test('a number in range is applied', () => {
  expect(parseField('7', stay)).toBe(7)
})

test('a number out of range or a blank required field cannot be applied', () => {
  expect(parseField('999', stay)).toBe(null)
  expect(parseField('', stay)).toBe(null)
})

test('a blank optional field clears the value', () => {
  expect(parseField('', { ...stay, optional: true })).toBe(undefined)
})
