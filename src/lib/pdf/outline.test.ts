import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadOutline, activeEntry, type TocItem } from './outline'

async function open(name: string) {
  const data = new Uint8Array(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url)))
  return (await getDocument({ data }).promise) as unknown as PDFDocumentProxy
}

describe('loadOutline', () => {
  it('resolves every entry of a nested outline to its page', async () => {
    const items = await loadOutline(await open('sample.pdf'))
    expect(items.map((i) => [i.title, i.page])).toEqual([
      ['Chapter 1: Close Reading', 0],
      ['Two-column layout', 2],
      ['Edit target page', 3],
    ])
    expect(items[0].items.map((i) => [i.id, i.title, i.page])).toEqual([['0.0', 'Across the page break', 1]])
  })

  it('handles a long outline', async () => {
    const items = await loadOutline(await open('long.pdf'))
    expect(items).toHaveLength(12)
    expect(items[11].items.at(-1)).toMatchObject({ title: 'Section 12.5', page: 590 })
  })
})

describe('activeEntry', () => {
  const tree: TocItem[] = [
    { id: '0', title: 'One', page: 0, items: [{ id: '0.0', title: 'One A', page: 2, items: [] }] },
    { id: '1', title: 'Link', page: null, items: [] },
    { id: '2', title: 'Two', page: 5, items: [] },
  ]
  const at = (page: number) => activeEntry(tree, page).map((i) => i.id)

  it('picks the deepest entry that starts on or before the page, with its ancestors', () => {
    expect(at(0)).toEqual(['0'])
    expect(at(3)).toEqual(['0', '0.0'])
    expect(at(5)).toEqual(['2'])
    expect(at(99)).toEqual(['2'])
  })

  it('is empty before the first entry', () => {
    expect(activeEntry([{ id: '0', title: 'Late', page: 4, items: [] }], 1)).toEqual([])
  })
})
