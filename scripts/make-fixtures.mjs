// Generates test PDFs into fixtures/ (never use real user documents for tests).
import { PDFDocument, PDFName, PDFNumber, PDFHexString, PDFNull, StandardFonts, rgb } from 'pdf-lib'
import { writeFile, mkdir } from 'node:fs/promises'

const W = 612, H = 792, M = 72, SIZE = 12, LEAD = 16

const LOREM =
  'Reading closely means slowing down enough to notice how an argument is built. ' +
  'Good readers ask questions of the text, mark what surprises them, and return to ' +
  'difficult passages with fresh eyes. Marginal notes turn passive reading into a ' +
  'conversation with the author, and over time those notes become a map of what you know. '

function wrap(text, font, size, width) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? line + ' ' + word : word
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** Writes a PDF outline (table of contents). Items are { title, page (0-based), items? }; pdf-lib has no API for this. */
function addOutline(doc, items) {
  const { context } = doc
  const pages = doc.getPages()
  const build = (list, parentRef) => {
    const refs = list.map(() => context.nextRef())
    let count = 0
    list.forEach((item, i) => {
      const dict = context.obj({})
      dict.set(PDFName.of('Title'), PDFHexString.fromText(item.title))
      dict.set(PDFName.of('Parent'), parentRef)
      dict.set(PDFName.of('Dest'), context.obj([pages[item.page].ref, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull]))
      if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1])
      if (i < list.length - 1) dict.set(PDFName.of('Next'), refs[i + 1])
      if (item.items?.length) {
        const child = build(item.items, refs[i])
        dict.set(PDFName.of('First'), child.refs[0])
        dict.set(PDFName.of('Last'), child.refs.at(-1))
        dict.set(PDFName.of('Count'), PDFNumber.of(child.count))
        count += child.count
      }
      context.assign(refs[i], dict)
      count++
    })
    return { refs, count }
  }
  const rootRef = context.nextRef()
  const top = build(items, rootRef)
  context.assign(
    rootRef,
    context.obj({ Type: 'Outlines', First: top.refs[0], Last: top.refs.at(-1), Count: PDFNumber.of(top.count) }),
  )
  doc.catalog.set(PDFName.of('Outlines'), rootRef)
}

function drawLines(page, lines, font, x, yStart) {
  let y = yStart
  for (const l of lines) {
    page.drawText(l, { x, y, size: SIZE, font, color: rgb(0.1, 0.1, 0.1) })
    y -= LEAD
  }
  return y
}

async function sample() {
  const doc = await PDFDocument.create()
  doc.setTitle('Scholia sample')
  const times = await doc.embedFont(StandardFonts.TimesRoman)
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const linesPerPage = Math.floor((H - 2 * M) / LEAD)

  // Pages 1-2: body text that flows across the page break mid-sentence.
  const body = wrap(LOREM.repeat(14) + 'This sentence deliberately crosses the page break so that a highlight must span two pages without losing its place. ' + LOREM.repeat(6), times, SIZE, W - 2 * M)
  const p1 = doc.addPage([W, H])
  p1.drawText('Chapter 1: Close Reading', { x: M, y: H - M + 20, size: 18, font: helvBold })
  drawLines(p1, body.slice(0, linesPerPage - 2), times, M, H - M - 16)
  const p2 = doc.addPage([W, H])
  drawLines(p2, body.slice(linesPerPage - 2, linesPerPage * 2), times, M, H - M)

  // Page 3: two columns.
  const p3 = doc.addPage([W, H])
  p3.drawText('Two-column layout', { x: M, y: H - M + 20, size: 18, font: helvBold })
  const colW = (W - 2 * M - 24) / 2
  const col = wrap(LOREM.repeat(8), times, SIZE, colW)
  drawLines(p3, col.slice(0, linesPerPage - 2), times, M, H - M - 16)
  drawLines(p3, col.slice(linesPerPage - 2, 2 * linesPerPage - 4), times, M + colW + 24, H - M - 16)

  // Page 4: edit target between two neighbour lines.
  const p4 = doc.addPage([W, H])
  p4.drawText('Edit target page', { x: M, y: H - M + 20, size: 18, font: helvBold })
  p4.drawText('Line above the target stays untouched.', { x: M, y: 600, size: SIZE, font: helv })
  p4.drawText('The quick brown fox jumps over the lazy dog.', { x: M, y: 584, size: SIZE, font: helv })
  p4.drawText('Line below the target stays untouched.', { x: M, y: 568, size: SIZE, font: helv })
  p4.drawText('A serif line for font matching checks.', { x: M, y: 540, size: SIZE, font: times })

  addOutline(doc, [
    { title: 'Chapter 1: Close Reading', page: 0, items: [{ title: 'Across the page break', page: 1 }] },
    { title: 'Two-column layout', page: 2 },
    { title: 'Edit target page', page: 3 },
  ])
  return doc.save()
}

async function long(pages = 600) {
  const doc = await PDFDocument.create()
  doc.setTitle('Scholia long document')
  const times = await doc.embedFont(StandardFonts.TimesRoman)
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const lines = wrap(LOREM.repeat(10), times, SIZE, W - 2 * M).slice(0, 38)
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([W, H])
    p.drawText(`Page ${i + 1}`, { x: M, y: H - M + 20, size: 14, font: helvBold })
    drawLines(p, lines, times, M, H - M - 10)
  }
  // Twelve parts of 50 pages, each with five sections: a long, nested table of contents.
  addOutline(
    doc,
    Array.from({ length: pages / 50 }, (_, p) => ({
      title: `Part ${p + 1}`,
      page: p * 50,
      items: Array.from({ length: 5 }, (_, s) => ({ title: `Section ${p + 1}.${s + 1}`, page: p * 50 + s * 10 })),
    })),
  )
  return doc.save()
}

await mkdir(new URL('../fixtures/', import.meta.url), { recursive: true })
await writeFile(new URL('../fixtures/sample.pdf', import.meta.url), await sample())
await writeFile(new URL('../fixtures/long.pdf', import.meta.url), await long())
console.log('fixtures written')
