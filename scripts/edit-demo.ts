// Dev demo for Spike B: edits fixtures/sample.pdf page 4 and writes edited.pdf + a PNG into the given dir.
import { readFileSync, writeFileSync } from 'node:fs'
import * as mupdf from 'mupdf'
import { openPdf, findLine, replaceLine, savePdf } from '../src/lib/editor/textEdit.ts'
const out = process.argv[2]
const doc = openPdf(readFileSync(new URL('../fixtures/sample.pdf', import.meta.url)))
replaceLine(doc, 3, findLine(doc.loadPage(3), 'The quick brown fox')!, 'Scholia edited this line (and kept its place).')
replaceLine(doc, 3, findLine(doc.loadPage(3), 'A serif line')!, 'Serif replacement – café')
const bytes = savePdf(doc)
writeFileSync(out + '/edited.pdf', bytes)
const page = new mupdf.PDFDocument(bytes).loadPage(3)
const pix = page.toPixmap(mupdf.Matrix.scale(1.5, 1.5), mupdf.ColorSpace.DeviceRGB, false)
const png = pix.asPNG()
writeFileSync(out + '/edited-p4.png', png)
