// Turns a DOM text selection over pdf.js text layers into page anchors (PDF units) plus a text quote.
import { mergeLineRects, screenToPdfRect, type Matrix, type Rect } from './coords'
import type { Anchor, Quote } from '../annotations/types'

const CONTEXT = 32

function pageOf(node: Node): HTMLElement | null {
  const el = node instanceof Element ? node : node.parentElement
  return el?.closest<HTMLElement>('[data-page]') ?? null
}

/** Client rects of every selected piece of text, grouped by page element. */
function rectsByPage(range: Range): Map<HTMLElement, DOMRect[]> {
  const out = new Map<HTMLElement, DOMRect[]>()
  const root = range.commonAncestorContainer
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = root.nodeType === Node.TEXT_NODE ? [root as Text] : []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)

  for (const node of nodes) {
    if (!range.intersectsNode(node) || !node.parentElement?.closest('.textLayer')) continue
    const page = pageOf(node)
    if (!page) continue
    const r = document.createRange()
    r.selectNodeContents(node)
    if (node === range.startContainer) r.setStart(node, range.startOffset)
    if (node === range.endContainer) r.setEnd(node, range.endOffset)
    if (r.collapsed) continue
    const list = out.get(page) ?? []
    list.push(...Array.from(r.getClientRects()))
    out.set(page, list)
  }
  return out
}

function quoteOf(range: Range): Quote {
  const normalize = (s: string) => s.replace(/\s+/g, ' ')
  const startLayer = pageOf(range.startContainer)?.querySelector('.textLayer')
  const endLayer = pageOf(range.endContainer)?.querySelector('.textLayer')
  let prefix = ''
  let suffix = ''
  if (startLayer) {
    const r = document.createRange()
    r.selectNodeContents(startLayer)
    r.setEnd(range.startContainer, range.startOffset)
    prefix = normalize(r.toString()).slice(-CONTEXT)
  }
  if (endLayer) {
    const r = document.createRange()
    r.selectNodeContents(endLayer)
    r.setStart(range.endContainer, range.endOffset)
    suffix = normalize(r.toString()).slice(0, CONTEXT)
  }
  return { exact: normalize(range.toString()).trim(), prefix, suffix }
}

/**
 * @param transformFor viewport transform (PDF -> page pixels) for a 0-based page index.
 */
export function selectionToAnchors(
  selection: Selection | null,
  transformFor: (page: number) => Matrix | undefined,
): { anchors: Anchor[]; quote: Quote } | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  const anchors: Anchor[] = []
  for (const [pageEl, clientRects] of rectsByPage(range)) {
    const page = Number(pageEl.dataset.page)
    const m = transformFor(page)
    if (!m) continue
    const box = pageEl.getBoundingClientRect()
    const local: Rect[] = clientRects.map((r) => [r.left - box.left, r.top - box.top, r.right - box.left, r.bottom - box.top])
    const rects = mergeLineRects(local).map((r) => screenToPdfRect(m, r))
    if (rects.length) anchors.push({ page, rects })
  }
  if (!anchors.length) return null
  anchors.sort((a, b) => a.page - b.page)
  return { anchors, quote: quoteOf(range) }
}
