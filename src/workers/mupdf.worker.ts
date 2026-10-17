// MuPDF runs here so editing never blocks the UI. Loaded lazily, only when Edit mode is used.
// Points and rects crossing this boundary are in PDF user space (y up), same as stored annotations.
//
// mupdf initialises its WebAssembly with top-level await. The message handler must be registered
// synchronously, or messages that arrive while the module is still loading are lost, so the engine
// is imported dynamically.
import type * as Mupdf from 'mupdf'
import type { Rect, TextLine } from '../lib/editor/textEdit'
import type { EditRequest, EditResponse, LineInfo } from '../lib/editor/protocol'

const engine = Promise.all([import('mupdf'), import('../lib/editor/textEdit')])

let doc: Mupdf.PDFDocument | null = null

async function handle(req: EditRequest): Promise<EditResponse> {
  const [mupdf, { openPdf, savePdf, lineAt, replaceLine }] = await engine

  const toPdfSpace = (page: Mupdf.PDFPage, rect: Rect): Rect => {
    const r = mupdf.Rect.transform(rect, mupdf.Matrix.invert(page.getTransform()))
    return [r[0], r[1], r[2], r[3]]
  }

  const findLine = (pageIndex: number, x: number, y: number): { page: Mupdf.PDFPage; line: TextLine } | null => {
    if (!doc) throw new Error('No document open')
    const page = doc.loadPage(pageIndex)
    const [a, b, c, d, e, f] = page.getTransform()
    const line = lineAt(page, [a * x + c * y + e, b * x + d * y + f])
    return line ? { page, line } : null
  }

  switch (req.type) {
    case 'open':
      doc = openPdf(new Uint8Array(req.data))
      return { id: req.id, ok: true }
    case 'lineAt': {
      const hit = findLine(req.page, req.x, req.y)
      const line: LineInfo | null = hit
        ? { text: hit.line.text, bbox: toPdfSpace(hit.page, hit.line.bbox), size: hit.line.size, fontName: hit.line.fontName }
        : null
      return { id: req.id, ok: true, line }
    }
    case 'replace': {
      const hit = findLine(req.page, req.x, req.y)
      if (!hit) return { id: req.id, ok: false, error: 'No text line at that point' }
      const result = replaceLine(doc!, req.page, hit.line, req.newText)
      const bytes = savePdf(doc!)
      doc = openPdf(bytes) // reopen so later edits see the rewritten content streams
      return { id: req.id, ok: true, bytes, ...result }
    }
  }
}

self.onmessage = async (ev: MessageEvent<EditRequest>) => {
  let res: EditResponse
  try {
    res = await handle(ev.data)
  } catch (err) {
    res = { id: ev.data.id, ok: false, error: String(err) }
  }
  const scope = self as unknown as Worker
  try {
    scope.postMessage(res, 'bytes' in res && res.bytes ? [res.bytes.buffer] : [])
  } catch (err) {
    scope.postMessage({ id: ev.data.id, ok: false, error: String(err) } satisfies EditResponse)
  }
}
