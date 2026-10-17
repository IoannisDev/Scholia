import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as mupdf from 'mupdf'
import { openPdf, findLine, replaceLine, savePdf, getLines, matchBase14, lineAt } from './textEdit'

const sample = readFileSync(new URL('../../../fixtures/sample.pdf', import.meta.url))
const EDIT_PAGE = 3

function pageText(data: Uint8Array, index: number) {
  const doc = new mupdf.PDFDocument(data)
  return doc.loadPage(index).toStructuredText('preserve-whitespace').asText()
}

describe('replaceLine (Spike B)', () => {
  it('removes the old text, writes the new text and leaves neighbours intact', () => {
    const doc = openPdf(sample)
    const page = doc.loadPage(EDIT_PAGE)
    const target = findLine(page, 'The quick brown fox')!
    expect(target).toBeDefined()
    const result = replaceLine(doc, EDIT_PAGE, target, 'Scholia edited this line (and kept its place).')
    expect(result.fontUsed).toBe('Helvetica')
    expect(result.unsupportedChars).toEqual([])

    const out = savePdf(doc)
    const text = pageText(out, EDIT_PAGE)
    expect(text).not.toContain('quick brown fox')
    expect(text).toContain('Scholia edited this line (and kept its place).')
    expect(text).toContain('Line above the target stays untouched.')
    expect(text).toContain('Line below the target stays untouched.')
    expect(text).toContain('A serif line for font matching checks.')

    // New line sits on the original baseline.
    const reopened = new mupdf.PDFDocument(out).loadPage(EDIT_PAGE)
    const edited = findLine(reopened, 'Scholia edited')!
    expect(edited.origin[1]).toBeCloseTo(target.origin[1], 0)
    expect(edited.origin[0]).toBeCloseTo(target.origin[0], 0)
    expect(edited.size).toBeCloseTo(target.size, 1)
  })

  it('matches serif fonts to Times and keeps other pages unchanged', () => {
    const doc = openPdf(sample)
    const serif = findLine(doc.loadPage(EDIT_PAGE), 'A serif line')!
    expect(matchBase14(serif)).toBe('Times-Roman')
    const before = pageText(new Uint8Array(sample), 0)
    replaceLine(doc, EDIT_PAGE, serif, 'Serif replacement – café')
    const out = savePdf(doc)
    expect(pageText(out, 0)).toBe(before)
    expect(pageText(out, EDIT_PAGE)).toContain('Serif replacement – café')
  })

  it('reports characters the fallback font cannot encode', () => {
    const doc = openPdf(sample)
    const target = findLine(doc.loadPage(EDIT_PAGE), 'The quick brown fox')!
    const r = replaceLine(doc, EDIT_PAGE, target, 'Greek σχόλια')
    expect(r.unsupportedChars.length).toBeGreaterThan(0)
  })

  it('sample fixture has a sentence spanning pages 1 and 2', () => {
    const doc = openPdf(sample)
    const p1 = getLines(doc.loadPage(0)).map((l) => l.text).join(' ')
    const p2 = getLines(doc.loadPage(1)).map((l) => l.text).join(' ')
    const s = 'This sentence deliberately crosses the page break'
    const joined = (p1 + ' ' + p2).replace(/\s+/g, ' ')
    expect(joined).toContain(s)
    expect(p1.includes('deliberately crosses the page break so that a highlight must span two pages')).toBe(false)
  })
})

describe('lineAt', () => {
  it('finds the line under a point', () => {
    const page = openPdf(sample).loadPage(EDIT_PAGE)
    const target = findLine(page, 'The quick brown fox')!
    const [x0, y0, x1, y1] = target.bbox
    expect(lineAt(page, [(x0 + x1) / 2, (y0 + y1) / 2])?.text).toContain('quick brown fox')
    expect(lineAt(page, [x1 + 50, (y0 + y1) / 2])).toBeUndefined()
  })
})
