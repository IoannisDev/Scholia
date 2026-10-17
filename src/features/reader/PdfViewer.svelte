<script lang="ts">
  import { tick } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import type { PDFDocumentProxy } from 'pdfjs-dist'
  import PdfPage from './PdfPage.svelte'
  import Icon from '../../components/Icon.svelte'
  import { applyMatrix, invertMatrix, pdfToScreenRect, viewportTransform, type Matrix, type Rect } from '../../lib/pdf/coords'
  import { selectionToAnchors } from '../../lib/pdf/selection'
  import { COLORS, type Anchor, type ColorKey, type Highlight, type Quote } from '../../lib/annotations/types'
  import type { LineInfo } from '../../lib/editor/protocol'

  interface Props {
    pdf: PDFDocumentProxy
    scale: number
    highlights: Highlight[]
    editMode: boolean
    currentPage?: number
    /** Returns the new highlight's id. */
    onHighlight: (h: { anchors: Anchor[]; quote: Quote; color: ColorKey }) => string
    onAddNote: (id: string) => void
    onRecolorHighlight: (id: string, color: ColorKey) => void
    onDeleteHighlight: (id: string) => void
    onRendered: (index: number) => void
    onRequestLine: (page: number, x: number, y: number) => Promise<LineInfo | null>
    onReplace: (page: number, x: number, y: number, text: string) => Promise<void>
  }

  let {
    pdf, scale, highlights, editMode, currentPage = $bindable(0),
    onHighlight, onAddNote, onRecolorHighlight, onDeleteHighlight, onRendered, onRequestLine, onReplace,
  }: Props = $props()

  let scroller: HTMLDivElement
  const visible = new SvelteSet<number>()

  // Page geometry: every page starts with page 1's box and is corrected once it loads.
  let defaultView = $state<Rect>([0, 0, 612, 792])
  let defaultRotation = $state(0)
  let info = $state<Record<number, { view: Rect; rotation: number }>>({})

  $effect(() => {
    const doc = pdf
    info = {}
    visible.clear()
    doc.getPage(1).then((p) => {
      defaultView = p.view as Rect
      defaultRotation = p.rotate
    })
  })

  function pageInfo(i: number) {
    return info[i] ?? { view: defaultView, rotation: defaultRotation }
  }
  function transformFor(i: number): Matrix {
    const { view, rotation } = pageInfo(i)
    return viewportTransform(view, scale, rotation)
  }
  function onInfo(i: number, view: Rect, rotation: number) {
    const cur = info[i]
    if (!cur || cur.rotation !== rotation || cur.view.some((v, k) => v !== view[k])) info[i] = { view, rotation }
  }

  // Virtualization: only pages near the viewport render.
  $effect(() => {
    void pdf.numPages
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.page)
          if (e.isIntersecting) visible.add(i)
          else visible.delete(i)
        }
      },
      { root: scroller, rootMargin: '150% 0px' },
    )
    tick().then(() => scroller.querySelectorAll('[data-page]').forEach((el) => io.observe(el)))
    return () => io.disconnect()
  })

  // Keep the reading position when zooming.
  let scrollRatio = 0
  function onScroll() {
    scrollRatio = scroller.scrollTop / Math.max(1, scroller.scrollHeight)
    const pages = scroller.querySelectorAll<HTMLElement>('[data-page]')
    const probe = scroller.scrollTop + scroller.clientHeight / 3
    let lo = 0
    let hi = pages.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (pages[mid].offsetTop <= probe) lo = mid
      else hi = mid - 1
    }
    currentPage = lo
    updateToolbar()
    menu = null
  }
  $effect.pre(() => {
    void scale
    const ratio = scrollRatio
    tick().then(() => {
      scroller.scrollTop = ratio * scroller.scrollHeight
    })
  })

  export function goToPage(i: number, behavior: ScrollBehavior = 'smooth') {
    const el = scroller.querySelector<HTMLElement>(`[data-page="${i}"]`)
    if (el) scroller.scrollTo({ top: el.offsetTop - 24, behavior })
  }

  // ---- Highlighting -------------------------------------------------------
  let toolbar = $state<{ x: number; y: number } | null>(null)

  /** Floating toolbar sits just above the start of the selection, like Notion's. */
  function updateToolbar() {
    if (editMode) return (toolbar = null)
    const sel = document.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !scroller.contains(sel.anchorNode)) return (toolbar = null)
    const rects = [...sel.getRangeAt(0).getClientRects()].filter((r) => r.width > 0 && r.height > 0)
    const first = rects[0]
    if (!first) return (toolbar = null)
    const box = scroller.getBoundingClientRect()
    toolbar = {
      x: Math.min(Math.max(first.left - box.left + scroller.scrollLeft, 8), scroller.scrollLeft + box.width - 380),
      y: first.top - box.top + scroller.scrollTop - 12,
    }
  }

  export function highlightSelection(color: ColorKey): string | null {
    const result = selectionToAnchors(document.getSelection(), transformFor)
    if (!result) return null
    const id = onHighlight({ ...result, color })
    document.getSelection()?.removeAllRanges()
    toolbar = null
    return id
  }

  function noteOnSelection() {
    const id = highlightSelection(COLORS[0].key)
    if (id) onAddNote(id)
  }

  async function copySelection() {
    const text = document.getSelection()?.toString() ?? ''
    await navigator.clipboard.writeText(text.replace(/\s+/g, ' ').trim()).catch(() => {})
    document.getSelection()?.removeAllRanges()
    toolbar = null
  }

  function hitHighlight(ev: MouseEvent): string | null {
    const pageEl = (ev.target as HTMLElement).closest<HTMLElement>('[data-page]')
    if (!pageEl) return null
    const i = Number(pageEl.dataset.page)
    const box = pageEl.getBoundingClientRect()
    const x = ev.clientX - box.left
    const y = ev.clientY - box.top
    const m = transformFor(i)
    for (const h of highlights)
      for (const a of h.anchors)
        if (a.page === i)
          for (const r of a.rects) {
            const [x0, y0, x1, y1] = pdfToScreenRect(m, r)
            if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return h.id
          }
    return null
  }

  let menu = $state<{ id: string; x: number; y: number } | null>(null)
  const menuHighlight = $derived(menu ? highlights.find((h) => h.id === menu!.id) : undefined)

  // ---- Edit mode ----------------------------------------------------------
  let editing = $state<{ page: number; x: number; y: number; line: LineInfo; box: Rect; text: string } | null>(null)
  let editBusy = $state(false)
  let editError = $state('')

  async function startEdit(ev: MouseEvent) {
    const pageEl = (ev.target as HTMLElement).closest<HTMLElement>('[data-page]')
    if (!pageEl) return
    const i = Number(pageEl.dataset.page)
    const box = pageEl.getBoundingClientRect()
    const m = transformFor(i)
    const [x, y] = applyMatrix(invertMatrix(m), ev.clientX - box.left, ev.clientY - box.top)
    editError = ''
    const line = await onRequestLine(i, x, y)
    if (!line) return (editing = null)
    const [sx0, sy0, sx1, sy1] = pdfToScreenRect(m, line.bbox)
    editing = {
      page: i, x, y, line, text: line.text.trimEnd(),
      box: [sx0 + pageEl.offsetLeft, sy0 + pageEl.offsetTop, sx1 + pageEl.offsetLeft, sy1 + pageEl.offsetTop],
    }
    await tick()
    scroller.querySelector<HTMLInputElement>('.edit-input')?.select()
  }

  async function commitEdit() {
    if (!editing || editBusy) return
    editBusy = true
    try {
      await onReplace(editing.page, editing.x, editing.y, editing.text)
      editing = null
    } catch (err) {
      editError = String(err)
    } finally {
      editBusy = false
    }
  }

  function onClick(ev: MouseEvent) {
    if ((ev.target as HTMLElement).closest('.popover')) return
    menu = null
    if (editMode) {
      if (!(ev.target as HTMLElement).closest('.edit-box')) startEdit(ev)
      return
    }
    const sel = document.getSelection()
    if (sel && !sel.isCollapsed) return
    const id = hitHighlight(ev)
    if (id) {
      const box = scroller.getBoundingClientRect()
      menu = { id, x: ev.clientX - box.left + scroller.scrollLeft, y: ev.clientY - box.top + scroller.scrollTop + 10 }
    }
  }

  $effect(() => {
    if (!editMode) editing = null
  })
</script>

<svelte:document onselectionchange={updateToolbar} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scroller" class:edit-mode={editMode} bind:this={scroller} onscroll={onScroll} onclick={onClick}>
  <div class="pages">
    {#each { length: pdf.numPages } as _, i (i)}
      {@const pi = pageInfo(i)}
      <PdfPage
        {pdf}
        index={i}
        {scale}
        visible={visible.has(i)}
        view={pi.view}
        rotation={pi.rotation}
        {highlights}
        {onInfo}
        {onRendered}
      />
    {/each}
  </div>

  {#if toolbar}
    <div class="popover toolbar" style:left="{toolbar.x}px" style:top="{toolbar.y}px" role="toolbar" aria-label="Text selection actions">
      {#each COLORS as c, n (c.key)}
        <button
          class="swatch"
          title="{c.label}  {n + 1}"
          aria-label="Highlight as {c.label}"
          onpointerdown={(e) => e.preventDefault()}
          onclick={() => highlightSelection(c.key)}
        ><span style:background={c.hex}></span></button>
      {/each}
      <span class="divider" aria-hidden="true"></span>
      <button class="tool" onpointerdown={(e) => e.preventDefault()} onclick={noteOnSelection}>Add note</button>
      <button class="tool" onpointerdown={(e) => e.preventDefault()} onclick={copySelection}>Copy</button>
    </div>
  {/if}

  {#if menu && menuHighlight}
    <div class="popover menu" style:left="{menu.x}px" style:top="{menu.y}px" role="menu">
      <div class="menu-label">Colour</div>
      {#each COLORS as c (c.key)}
        <button
          class="menu-item"
          role="menuitem"
          onclick={() => { onRecolorHighlight(menu!.id, c.key); menu = null }}
        >
          <span class="chip" style:background={c.hex} style:border-color={c.dot}></span>
          {c.label}
          {#if menuHighlight.color === c.key}<span class="check">✓</span>{/if}
        </button>
      {/each}
      <div class="menu-sep"></div>
      <button class="menu-item danger" role="menuitem" onclick={() => { onDeleteHighlight(menu!.id); menu = null }}>
        <Icon name="trash" size={14} /> Delete highlight
      </button>
    </div>
  {/if}

  {#if editing}
    {@const [x0, y0, x1, y1] = editing.box}
    <form
      class="edit-box"
      style:left="{x0 - 5}px"
      style:top="{y0 - 5}px"
      style:min-width="{x1 - x0 + 10}px"
      onsubmit={(e) => { e.preventDefault(); commitEdit() }}
    >
      <div class="edit-hint">
        {#if editError}<span class="err">{editError}</span>
        {:else}<kbd>↵</kbd> save <kbd>esc</kbd> cancel · {editing.line.fontName}{/if}
      </div>
      <input
        class="edit-input"
        style:font-size="{editing.line.size * scale}px"
        style:height="{y1 - y0 + 10}px"
        bind:value={editing.text}
        disabled={editBusy}
        onkeydown={(e) => { if (e.key === 'Escape') editing = null }}
      />
    </form>
  {/if}
</div>

<style>
  .scroller {
    position: relative;
    height: 100%;
    overflow: auto;
    background: var(--canvas-bg);
    overscroll-behavior: contain;
  }
  .pages {
    padding: 4px 32px 40vh;
    width: max-content;
    min-width: 100%;
    box-sizing: border-box;
  }
  .edit-mode :global(.textLayer) {
    cursor: text;
  }
  .edit-mode :global(.textLayer span:hover) {
    background: var(--accent-soft);
    border-radius: 2px;
  }

  .popover {
    position: absolute;
    z-index: 20;
    background: var(--popover);
    box-shadow: var(--popover-shadow);
    border-radius: 12px;
    color: var(--text);
  }

  /* Selection toolbar: a dark pill floating above the selection. */
  .toolbar {
    transform: translateY(-100%);
    display: flex;
    align-items: center;
    gap: 2px;
    height: var(--touch);
    box-sizing: border-box;
    padding: 0 8px;
    border-radius: 12px;
    background: var(--ink-surface);
    color: var(--on-ink);
    box-shadow: 0 12px 24px -8px rgb(29 35 33 / 0.4);
    font-size: 14px;
    white-space: nowrap;
  }
  .divider {
    width: 1px;
    height: 20px;
    margin: 0 6px;
    background: color-mix(in srgb, var(--on-ink) 25%, transparent);
  }
  .swatch,
  .tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 36px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
  }
  .swatch {
    width: 36px;
  }
  .tool {
    padding: 0 10px;
    font-weight: 500;
  }
  .swatch:hover,
  .tool:hover {
    background: color-mix(in srgb, var(--on-ink) 12%, transparent);
  }
  .swatch span {
    width: 16px;
    height: 16px;
    border-radius: 50%;
  }

  .menu {
    width: 200px;
    padding: 6px 0;
  }
  .menu-label {
    padding: 4px 14px 6px;
    font-size: 12px;
    color: var(--text-3);
  }
  .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: calc(100% - 8px);
    margin: 0 4px;
    min-height: var(--control);
    padding: 0 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-size: 14px;
    text-align: left;
  }
  .menu-item:hover {
    background: var(--hover);
  }
  .menu-item.danger:hover {
    color: var(--danger);
  }
  .chip {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1px solid;
  }
  .check {
    margin-left: auto;
    color: var(--text-2);
  }
  .menu-sep {
    height: 1px;
    margin: 6px 0;
    background: var(--divider);
  }

  .edit-box {
    position: absolute;
    z-index: 20;
  }
  .edit-input {
    width: 100%;
    box-sizing: border-box;
    padding: 2px 4px;
    font-family: Helvetica, Arial, sans-serif;
    background: white;
    color: black;
    border: 0;
    border-radius: 4px;
    box-shadow: 0 0 0 2px var(--accent), var(--popover-shadow);
    outline: none;
  }
  .edit-hint {
    position: absolute;
    bottom: 100%;
    margin-bottom: 6px;
    padding: 3px 8px;
    border-radius: 4px;
    background: var(--popover);
    box-shadow: var(--popover-shadow);
    font-size: 12px;
    color: var(--text-2);
    white-space: nowrap;
  }
  kbd {
    font-family: inherit;
    font-size: 11px;
    padding: 0 4px;
    border-radius: 3px;
    background: var(--hover);
    border: 1px solid var(--divider);
  }
  .err {
    color: var(--danger);
  }
</style>
