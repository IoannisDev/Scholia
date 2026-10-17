import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFPageProxy } from 'pdfjs-dist'
import { viewportTransform, screenToPdfRect, pdfToScreenRect, mergeLineRects, type Rect } from './coords'

const LETTER: Rect = [0, 0, 612, 792]

describe('viewportTransform', () => {
  let page: PDFPageProxy
  beforeAll(async () => {
    const data = new Uint8Array(readFileSync(new URL('../../../fixtures/sample.pdf', import.meta.url)))
    page = await (await getDocument({ data }).promise).getPage(1)
  })
  for (const rotation of [0, 90, 180, 270])
    for (const scale of [0.5, 1, 2.25])
      it(`matches pdf.js PageViewport (rotation ${rotation}, scale ${scale})`, () => {
        const vp = page.getViewport({ scale, rotation })
        const ours = viewportTransform(LETTER, scale, rotation)
        ours.forEach((v, i) => expect(v).toBeCloseTo(vp.transform[i], 6))
      })
})

describe('anchoring round trip', () => {
  it('a highlight stored in PDF units lands on the same text at any zoom', () => {
    const at1 = viewportTransform(LETTER, 1)
    const screen: Rect = [72, 100, 300, 116]
    const pdf = screenToPdfRect(at1, screen)
    expect(pdf).toEqual([72, 676, 300, 692])
    for (const scale of [0.5, 1.5, 2, 3]) {
      const s = pdfToScreenRect(viewportTransform(LETTER, scale), pdf)
      s.forEach((v, i) => expect(v).toBeCloseTo(screen[i] * scale, 6))
    }
  })

  it('works for rotated pages', () => {
    const vp = viewportTransform(LETTER, 1.5, 90)
    const pdf: Rect = [72, 600, 200, 612]
    const back = screenToPdfRect(vp, pdfToScreenRect(vp, pdf))
    back.forEach((v, i) => expect(v).toBeCloseTo(pdf[i], 6))
  })
})

describe('mergeLineRects', () => {
  it('merges word rects on one line and keeps lines separate', () => {
    const merged = mergeLineRects([
      [72, 100, 120, 114], [121, 100.5, 200, 113.5], [72, 116, 180, 130], [72, 100, 72.2, 114],
    ])
    expect(merged).toEqual([[72, 100, 200, 114], [72, 116, 180, 130]])
  })

  it('does not merge across a column gutter', () => {
    const merged = mergeLineRects([[72, 100, 290, 114], [314, 100, 540, 114]])
    expect(merged).toHaveLength(2)
  })
})
