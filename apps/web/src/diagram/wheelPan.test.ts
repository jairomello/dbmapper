import { describe, expect, test } from 'bun:test'
import { wheelActionFor } from './wheelPan'

function wheel(overrides: Partial<WheelEvent>): Pick<WheelEvent, 'deltaX' | 'deltaY' | 'ctrlKey' | 'shiftKey'> {
  return {
    deltaX: 0,
    deltaY: 0,
    ctrlKey: false,
    shiftKey: false,
    ...overrides,
  }
}

describe('wheelActionFor', () => {
  test('sem modificador rola verticalmente', () => {
    expect(wheelActionFor(wheel({ deltaY: 120 }))).toEqual({ kind: 'pan', x: 0, y: -120 })
  })

  test('Ctrl dá zoom', () => {
    expect(wheelActionFor(wheel({ deltaY: 120, ctrlKey: true }))).toEqual({ kind: 'zoom', deltaY: 120 })
  })

  test('Shift rola horizontalmente usando deltaY quando não há deltaX', () => {
    expect(wheelActionFor(wheel({ deltaY: 120, shiftKey: true }))).toEqual({ kind: 'pan', x: -120, y: 0 })
  })

  test('Shift usa deltaX do trackpad quando presente', () => {
    expect(wheelActionFor(wheel({ deltaX: 40, deltaY: 10, shiftKey: true }))).toEqual({
      kind: 'pan',
      x: -40,
      y: 0,
    })
  })

  test('Ctrl tem prioridade sobre Shift', () => {
    expect(wheelActionFor(wheel({ deltaX: 40, deltaY: 120, ctrlKey: true, shiftKey: true }))).toEqual({
      kind: 'zoom',
      deltaY: 120,
    })
  })
})
