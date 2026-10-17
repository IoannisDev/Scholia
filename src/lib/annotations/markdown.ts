// Highlights and notes as Markdown, for Obsidian, Notion and friends.
import { COLORS, type Highlight, type PageNote } from './types'

function pages(h: Highlight): string {
  const ps = [...new Set(h.anchors.map((a) => a.page + 1))]
  return ps.length > 1 ? `p. ${ps[0]}–${ps[ps.length - 1]}` : `p. ${ps[0]}`
}

export function toMarkdown(title: string, author: string, highlights: Highlight[], notes: PageNote[]): string {
  const items = [
    ...highlights.map((h) => ({ page: h.anchors[0].page, at: h.createdAt, h })),
    ...notes.map((n) => ({ page: n.page, at: n.createdAt, n })),
  ].sort((a, b) => a.page - b.page || a.at - b.at)

  const out = [`# ${title}`, ...(author ? [`*${author}*`] : []), '']
  for (const item of items) {
    if ('h' in item && item.h) {
      const label = COLORS.find((c) => c.key === item.h.color)!.label
      out.push(`> ${item.h.quote.exact.replace(/\s+/g, ' ').trim()}`, '', `— ${pages(item.h)} · ${label}`)
      if (item.h.note) out.push('', item.h.note)
    } else if ('n' in item && item.n) {
      out.push(`**Note, p. ${item.n.page + 1}:** ${item.n.text}`)
    }
    out.push('')
  }
  return out.join('\n')
}
