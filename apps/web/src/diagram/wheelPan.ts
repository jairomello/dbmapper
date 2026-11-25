export type WheelAction =
  | { kind: 'zoom'; deltaY: number }
  | { kind: 'pan'; x: number; y: number }

type WheelLike = Pick<WheelEvent, 'deltaX' | 'deltaY' | 'ctrlKey' | 'shiftKey'>

/**
 * Traduz a roda do mouse: sem modificador rola verticalmente, Shift rola
 * horizontalmente e Ctrl dá zoom no canvas.
 */
export function wheelActionFor(event: WheelLike): WheelAction {
  if (event.ctrlKey) return { kind: 'zoom', deltaY: event.deltaY }
  if (event.shiftKey) return { kind: 'pan', x: -(event.deltaX || event.deltaY), y: 0 }
  return { kind: 'pan', x: 0, y: -event.deltaY }
}
