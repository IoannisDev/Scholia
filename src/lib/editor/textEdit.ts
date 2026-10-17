// Text editing engine built on MuPDF. Runs anywhere mupdf runs (Node for tests, a Web Worker in the app).
// Coordinates here are MuPDF page space: origin top-left, y grows downwards, units = PDF points.
import * as mupdf from 'mupdf'

export type Rect = [number, number, number, number]
export type Point = [number, number]

export interface TextLine {
  text: string
  bbox: Rect
  /** Baseline origin of the first character. */
  origin: Point
  fontName: string
  bold: boolean
  italic: boolean
  serif: boolean
  mono: boolean
  size: number
  color: number[]
}

export interface ReplaceResult {
  /** Base-14 font used to draw the new text. */
  fontUsed: string
  /** Characters that cannot be encoded in the fallback font and were replaced with '?'. */
  unsupportedChars: string[]
}

export function getLines(page: mupdf.Page): TextLine[] {
  const stext = page.toStructuredText('preserve-whitespace')
  const lines: TextLine[] = []
  let current: TextLine | null = null
  stext.walk({
    beginLine(bbox) {
      current = null
      lines.push((current = { text: '', bbox: bbox as Rect } as TextLine))
    },
    onChar(c, origin, font, size, _quad, color) {
      if (!current) return
      if (current.text === '') {
        current.origin = origin as Point
        current.fontName = font.getName()
        current.bold = font.isBold()
        current.italic = font.isItalic()
        current.serif = font.isSerif()
        current.mono = font.isMono()
        current.size = size
        current.color = Array.from(color as ArrayLike<number>)
      }
      current.text += c
    },
  })
  return lines.filter((l) => l.text.trim() !== '')
}

export function findLine(page: mupdf.Page, needle: string): TextLine | undefined {
  return getLines(page).find((l) => l.text.includes(needle))
}

/** The text line under a point (MuPDF page space), with a little vertical tolerance. */
export function lineAt(page: mupdf.Page, [x, y]: Point, tolerance = 2): TextLine | undefined {
  return getLines(page).find(({ bbox: [x0, y0, x1, y1] }) => x >= x0 && x <= x1 && y >= y0 - tolerance && y <= y1 + tolerance)
}

/** Pick the closest base-14 font, since a subset embedded font may lack the new glyphs. */
export function matchBase14(line: Pick<TextLine, 'fontName' | 'bold' | 'italic' | 'serif' | 'mono'>): string {
  const n = line.fontName.toLowerCase()
  const bold = line.bold || /bold|black|heavy|semibold/.test(n)
  const italic = line.italic || /italic|oblique/.test(n)
  const mono = line.mono || /courier|mono|consol/.test(n)
  const serif = !mono && (line.serif || /times|serif|roman|georgia|garamond|minion|cambria/.test(n)) && !/sans/.test(n)
  if (mono) return 'Courier' + (bold && italic ? '-BoldOblique' : bold ? '-Bold' : italic ? '-Oblique' : '')
  if (serif) return bold && italic ? 'Times-BoldItalic' : bold ? 'Times-Bold' : italic ? 'Times-Italic' : 'Times-Roman'
  return 'Helvetica' + (bold && italic ? '-BoldOblique' : bold ? '-Bold' : italic ? '-Oblique' : '')
}

// Unicode -> WinAnsiEncoding byte for characters outside Latin-1 (punctuation, quotes, etc.).
const WIN_ANSI_EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
  'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
}

function encodePdfString(text: string, unsupported: Set<string>): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch
    else if (code >= 32 && code < 127) out += ch
    else if (code >= 160 && code < 256) out += '\\' + code.toString(8).padStart(3, '0')
    else if (ch in WIN_ANSI_EXTRA) out += '\\' + WIN_ANSI_EXTRA[ch].toString(8).padStart(3, '0')
    else {
      unsupported.add(ch)
      out += '?'
    }
  }
  return out
}

function colorOperator(color: number[]): string {
  const c = color.map((v) => +v.toFixed(4)).join(' ')
  if (color.length === 1) return `${c} g`
  if (color.length === 4) return `${c} k`
  if (color.length === 3) return `${c} rg`
  return '0 g'
}

/** Band around the x-height of a line: removes its glyphs without touching neighbouring lines. */
export function redactionRect(line: TextLine): Rect {
  const [x0, , x1] = line.bbox
  const baseline = line.origin[1]
  return [x0 - 0.5, baseline - line.size * 0.6, x1 + 0.5, baseline - line.size * 0.15]
}

function uniqueFontKey(fonts: mupdf.PDFObject): string {
  let i = 0
  while (!fonts.get(`ScF${i}`).isNull()) i++
  return `ScF${i}`
}

/**
 * Replace one line of text: the original glyphs are really removed (redaction), then the new text
 * is drawn at the same baseline, size and colour.
 */
export function replaceLine(doc: mupdf.PDFDocument, pageIndex: number, line: TextLine, newText: string): ReplaceResult {
  const page = doc.loadPage(pageIndex)

  const redact = page.createAnnotation('Redact')
  redact.setRect(redactionRect(line))
  page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE)

  const fontUsed = matchBase14(line)
  const fontRef = doc.addSimpleFont(new mupdf.Font(fontUsed), 'Latin')

  const pageObj = page.getObject()
  let resources = pageObj.getInheritable('Resources')
  if (resources.isNull()) {
    resources = doc.newDictionary()
    pageObj.put('Resources', resources)
  }
  let fonts = resources.get('Font')
  if (fonts.isNull()) {
    fonts = doc.newDictionary()
    resources.put('Font', fonts)
  }
  const key = uniqueFontKey(fonts)
  fonts.put(key, fontRef)

  // MuPDF page space -> PDF user space.
  const [a, b, c, d, e, f] = mupdf.Matrix.invert(page.getTransform())
  const [ox, oy] = line.origin
  const px = a * ox + c * oy + e
  const py = b * ox + d * oy + f

  const unsupported = new Set<string>()
  const ops =
    `Q q BT ${colorOperator(line.color)} /${key} ${line.size.toFixed(2)} Tf ` +
    `1 0 0 1 ${px.toFixed(2)} ${py.toFixed(2)} Tm (${encodePdfString(newText, unsupported)}) Tj ET Q\n`

  // Wrap existing content in q/Q so any unbalanced graphics state cannot shift our text.
  const contents = pageObj.get('Contents')
  const arr = doc.newArray()
  arr.push(doc.addStream('q\n', {}))
  if (contents.isArray()) contents.forEach((v) => arr.push(v))
  else if (!contents.isNull()) arr.push(contents)
  arr.push(doc.addStream(ops, {}))
  pageObj.put('Contents', arr)

  return { fontUsed, unsupportedChars: [...unsupported] }
}

export function openPdf(data: ArrayBuffer | Uint8Array): mupdf.PDFDocument {
  return new mupdf.PDFDocument(data)
}

export function savePdf(doc: mupdf.PDFDocument): Uint8Array {
  // Copy out of WebAssembly memory: the view would be invalidated by later MuPDF calls and cannot be transferred.
  return doc.saveToBuffer('garbage,compress').asUint8Array().slice()
}
