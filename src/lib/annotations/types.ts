import type { Rect } from '../pdf/coords'

// Soft paper tints. `hex` is drawn on the page (multiplied over the text) and used for swatches; `dot` is a stronger edge.
export const COLORS = [
  { key: 'yellow', label: 'Important', hex: '#f3dd86', dot: '#b8932a' },
  { key: 'green', label: 'Definition', hex: '#cde0c4', dot: '#5b8a4e' },
  { key: 'blue', label: 'Question', hex: '#bcd7e5', dot: '#4a7f9c' },
  { key: 'red', label: 'Disagree', hex: '#edc3bd', dot: '#b0574c' },
  { key: 'purple', label: 'Quote', hex: '#d9cce6', dot: '#7d62a0' },
] as const

export type ColorKey = (typeof COLORS)[number]['key']

export interface Anchor {
  /** 0-based page index. */
  page: number
  /** One rect per line, PDF user space. */
  rects: Rect[]
}

export interface Quote {
  exact: string
  prefix: string
  suffix: string
}

export interface Highlight {
  id: string
  color: ColorKey
  anchors: Anchor[]
  quote: Quote
  createdAt: number
  /** The reader's own comment on the passage. */
  note?: string
}

/** A free-standing note about a page. */
export interface PageNote {
  id: string
  /** 0-based page index. */
  page: number
  text: string
  createdAt: number
}

export function colorHex(key: ColorKey): string {
  return COLORS.find((c) => c.key === key)!.hex
}

export function colorDot(key: ColorKey): string {
  return COLORS.find((c) => c.key === key)!.dot
}
