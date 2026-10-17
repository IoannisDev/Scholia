// Coordinate helpers. Annotations are stored in PDF user space (points, origin bottom-left, y up)
// so they stay correct at every zoom level; they are converted to screen space only when drawn.

/** [x0, y0, x1, y1] with x0 <= x1 and y0 <= y1. */
export type Rect = [number, number, number, number]
/** Affine matrix [a, b, c, d, e, f] as used by PDF and pdf.js viewports. */
export type Matrix = [number, number, number, number, number, number]

export function applyMatrix([a, b, c, d, e, f]: Matrix, x: number, y: number): [number, number] {
  return [a * x + c * y + e, b * x + d * y + f]
}

export function invertMatrix([a, b, c, d, e, f]: Matrix): Matrix {
  const det = a * d - b * c
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

export function normalizeRect([x0, y0, x1, y1]: Rect): Rect {
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]
}

export function transformRect(m: Matrix, [x0, y0, x1, y1]: Rect): Rect {
  const p = [applyMatrix(m, x0, y0), applyMatrix(m, x1, y1), applyMatrix(m, x0, y1), applyMatrix(m, x1, y0)]
  const xs = p.map((q) => q[0])
  const ys = p.map((q) => q[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/** Same transform pdf.js PageViewport builds for a page (view box, scale, rotation). */
export function viewportTransform(view: Rect, scale: number, rotation = 0): Matrix {
  const [x0, y0, x1, y1] = view
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  let rA: number, rB: number, rC: number, rD: number
  switch (((rotation % 360) + 360) % 360) {
    case 90: [rA, rB, rC, rD] = [0, 1, 1, 0]; break
    case 180: [rA, rB, rC, rD] = [-1, 0, 0, 1]; break
    case 270: [rA, rB, rC, rD] = [0, -1, -1, 0]; break
    default: [rA, rB, rC, rD] = [1, 0, 0, -1]
  }
  const [offsetCX, offsetCY] =
    rA === 0
      ? [Math.abs(cy - y0) * scale, Math.abs(cx - x0) * scale]
      : [Math.abs(cx - x0) * scale, Math.abs(cy - y0) * scale]
  return [
    rA * scale, rB * scale, rC * scale, rD * scale,
    offsetCX - rA * scale * cx - rC * scale * cy,
    offsetCY - rB * scale * cx - rD * scale * cy,
  ]
}

/** Screen rect (relative to the page's top-left) -> PDF user space. */
export function screenToPdfRect(viewport: Matrix, rect: Rect): Rect {
  return transformRect(invertMatrix(viewport), rect)
}

/** PDF user space -> screen rect relative to the page's top-left. */
export function pdfToScreenRect(viewport: Matrix, rect: Rect): Rect {
  return transformRect(viewport, rect)
}

/**
 * Merge the noisy client rects of a selection into one rect per line.
 * Rects whose vertical overlap is at least half of the smaller height are treated as one line,
 * unless they are separated by a wide horizontal gap (e.g. two columns at the same height).
 */
export function mergeLineRects(rects: Rect[], minSize = 0.5): Rect[] {
  const clean = rects
    .map(normalizeRect)
    .filter(([x0, y0, x1, y1]) => x1 - x0 >= minSize && y1 - y0 >= minSize)
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
  const lines: Rect[] = []
  for (const r of clean) {
    const line = lines.find((l) => {
      const overlap = Math.min(l[3], r[3]) - Math.max(l[1], r[1])
      const height = Math.min(l[3] - l[1], r[3] - r[1])
      const gap = Math.max(l[0], r[0]) - Math.min(l[2], r[2])
      return overlap >= 0.5 * height && gap <= height
    })
    if (line) {
      line[0] = Math.min(line[0], r[0])
      line[1] = Math.min(line[1], r[1])
      line[2] = Math.max(line[2], r[2])
      line[3] = Math.max(line[3], r[3])
    } else lines.push([...r])
  }
  return lines
}
