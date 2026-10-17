// The PDF's own table of contents (its outline, a.k.a. bookmarks), with every entry resolved to a page index.
import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface TocItem {
  /** Position in the tree, e.g. "0.2.1"; stable for one document. */
  id: string
  title: string
  /** 0-based page index, or null when the entry points nowhere in this document (e.g. a web link). */
  page: number | null
  items: TocItem[]
}

type RawItem = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number]

async function resolvePage(pdf: PDFDocumentProxy, dest: RawItem['dest']): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
    const target = explicit?.[0]
    if (target == null) return null
    // A destination names its page by reference, or (in some files) directly by index.
    const page = typeof target === 'number' ? target : await pdf.getPageIndex(target)
    return page >= 0 && page < pdf.numPages ? page : null
  } catch {
    return null
  }
}

export async function loadOutline(pdf: PDFDocumentProxy): Promise<TocItem[]> {
  const raw = await pdf.getOutline().catch(() => null)
  const convert = (items: RawItem[], prefix: string): Promise<TocItem[]> =>
    Promise.all(
      items.map(async (item, i) => {
        const id = prefix + i
        return {
          id,
          title: item.title.replace(/\s+/g, ' ').trim() || 'Untitled',
          page: await resolvePage(pdf, item.dest),
          items: await convert(item.items ?? [], id + '.'),
        }
      }),
    )
  return raw ? convert(raw, '') : []
}

/** The entry the reader is in: the last one, in reading order, that starts on or before `page`. */
export function activeEntry(items: TocItem[], page: number): TocItem[] {
  let best: TocItem[] = []
  const walk = (list: TocItem[], path: TocItem[]) => {
    for (const item of list) {
      const here = [...path, item]
      if (item.page !== null && item.page <= page) best = here
      walk(item.items, here)
    }
  }
  walk(items, [])
  return best
}
