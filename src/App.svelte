<script lang="ts">
  import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from 'pdfjs-dist'
  import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
  import { tick } from 'svelte'
  import PdfViewer from './features/reader/PdfViewer.svelte'
  import NotesPanel from './features/reader/NotesPanel.svelte'
  import ContentsPanel from './features/reader/ContentsPanel.svelte'
  import Library from './features/library/Library.svelte'
  import Icon from './components/Icon.svelte'
  import { COLORS, type Highlight, type PageNote } from './lib/annotations/types'
  import { toMarkdown } from './lib/annotations/markdown'
  import { loadOutline, type TocItem } from './lib/pdf/outline'
  import { getBook, getFile, listBooks, putBook, removeBook, updateBook, type Book } from './lib/library/store'

  GlobalWorkerOptions.workerSrc = workerUrl

  const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]
  // Below this width the notes panel slides over the page instead of sitting beside it.
  const narrow = () => window.matchMedia('(max-width: 1100px)').matches

  let pdf = $state<PDFDocumentProxy | null>(null)
  let loadingTask: PDFDocumentLoadingTask | null = null
  let bytes: Uint8Array | null = null
  let docId = $state('')
  let title = $state('')
  let author = $state('')
  let fileName = ''
  let books = $state<Book[]>([])
  /** Off while a document opens, so its stored position isn't overwritten before it's restored. */
  let trackPosition = false
  let scale = $state(1.25)
  let currentPage = $state(0)
  let highlights = $state<Highlight[]>([])
  let pageNotes = $state<PageNote[]>([])
  let noteTarget = $state<string | null>(null)
  let editMode = $state(false)
  let focusMode = $state(false)
  let notesOpen = $state(!narrow())
  let contentsOpen = $state(false)
  let outline = $state<TocItem[] | null>(null)
  let status = $state('')
  let statusTimer: ReturnType<typeof setTimeout> | undefined
  let firstPaintMs = $state<number | null>(null)
  let openedAt = 0
  let undoStack: Uint8Array[] = []
  let canUndo = $state(false)
  let viewer = $state<ReturnType<typeof PdfViewer>>()
  let fileInput: HTMLInputElement
  let editorReady = false

  async function refreshBooks() {
    books = await listBooks().catch(() => [])
  }
  refreshBooks()

  function readJson<T>(key: string): T[] {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]')
    } catch {
      return []
    }
  }

  function toast(message: string) {
    status = message
    clearTimeout(statusTimer)
    statusTimer = setTimeout(() => (status = ''), 4000)
  }

  async function sha256(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>)
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  async function load(data: Uint8Array, name: string, keepId = false) {
    openedAt = performance.now()
    firstPaintMs = null
    bytes = data
    if (!keepId) {
      trackPosition = false
      currentPage = 0
      docId = await sha256(data)
      undoStack = []
      canUndo = false
      editorReady = false
      editMode = false
      noteTarget = null
      highlights = readJson('scholia:hl:' + docId)
      pageNotes = readJson('scholia:notes:' + docId)
    }
    const old = loadingTask
    // pdf.js takes ownership of the buffer it is given, so pass a copy.
    loadingTask = getDocument({ data: data.slice() })
    pdf = await loadingTask.promise
    old?.destroy()
    if (keepId) return
    fileName = name
    const info = (await pdf.getMetadata().catch(() => null))?.info as { Title?: string; Author?: string } | undefined
    title = info?.Title?.trim() || name.replace(/\.pdf$/i, '')
    author = info?.Author?.trim() || ''
    if (narrow()) notesOpen = false
    remember(data)
  }

  /** Adds the open document to the library, or resumes where it was left. Runs after first paint. */
  async function remember(data: Uint8Array) {
    const id = docId
    const pages = pdf!.numPages
    try {
      const known = await getBook(id)
      if (known && known.page > 0 && id === docId) {
        await tick()
        viewer?.goToPage(Math.min(known.page, pages - 1), 'instant')
      }
      const now = Date.now()
      await putBook(
        { id, title, author, fileName, numPages: pages, page: known?.page ?? 0, addedAt: known?.addedAt ?? now, openedAt: now },
        known ? undefined : data,
      )
    } catch {
      toast('Could not add this PDF to your library (storage unavailable)')
    } finally {
      if (id === docId) trackPosition = true
    }
  }

  // Load the table of contents for each document (and again after an edit, which rewrites the file).
  $effect(() => {
    const doc = pdf
    outline = null
    if (doc) loadOutline(doc).then((items) => pdf === doc && (outline = items))
  })

  // Both panels fit beside a page only on wide screens; otherwise opening one closes the other.
  const roomForBoth = () => window.matchMedia('(min-width: 1500px)').matches
  function toggleNotes() {
    notesOpen = !notesOpen
    if (notesOpen && !roomForBoth()) contentsOpen = false
  }
  function toggleContents() {
    contentsOpen = !contentsOpen
    if (contentsOpen && !roomForBoth()) notesOpen = false
  }

  // Remember the reading position, a moment after scrolling settles.
  let pageTimer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    const id = docId
    const page = currentPage
    if (!pdf || !id || !trackPosition) return
    clearTimeout(pageTimer)
    pageTimer = setTimeout(() => updateBook(id, { page, openedAt: Date.now() }).catch(() => {}), 500)
  })

  async function openBook(book: Book) {
    const data = await getFile(book.id).catch(() => undefined)
    if (!data) return toast('This PDF is no longer stored on this device')
    await load(data, book.fileName)
  }

  async function forget(book: Book) {
    if (!confirm(`Remove “${book.title}” from this device? Its highlights and notes will be deleted too.`)) return
    try {
      await removeBook(book.id)
      localStorage.removeItem('scholia:hl:' + book.id)
      localStorage.removeItem('scholia:notes:' + book.id)
      toast(`Removed “${book.title}”`)
    } catch {
      toast('Could not remove this PDF (storage unavailable)')
    }
    await refreshBooks()
  }

  async function goHome() {
    clearTimeout(pageTimer)
    if (docId) await updateBook(docId, { page: currentPage, openedAt: Date.now() }).catch(() => {})
    // Unmount the viewer before destroying the document, so no page is mid-render when it goes.
    const task = loadingTask
    loadingTask = null
    pdf = null
    await tick()
    task?.destroy()
    bytes = null
    docId = ''
    currentPage = 0
    editMode = false
    focusMode = false
    await refreshBooks()
  }

  async function openFile(file: File) {
    await load(new Uint8Array(await file.arrayBuffer()), file.name)
  }

  async function openFixture(name: string) {
    const res = await fetch(`/fixtures/${name}`)
    await load(new Uint8Array(await res.arrayBuffer()), name)
  }

  function save() {
    try {
      localStorage.setItem('scholia:hl:' + docId, JSON.stringify(highlights))
      localStorage.setItem('scholia:notes:' + docId, JSON.stringify(pageNotes))
    } catch {
      toast('Could not save highlights (storage unavailable)')
    }
  }

  function saveNote(text: string) {
    const h = noteTarget ? highlights.find((x) => x.id === noteTarget) : undefined
    if (h) h.note = text || undefined
    else if (text) pageNotes.push({ id: crypto.randomUUID(), page: currentPage, text, createdAt: Date.now() })
    noteTarget = null
    save()
  }

  function zoom(dir: 1 | -1) {
    const i = ZOOMS.findIndex((z) => z >= scale - 1e-6)
    scale = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i === -1 ? ZOOMS.length - 1 : i) + dir))]
  }

  async function ensureEditor() {
    const editor = await import('./lib/editor/client')
    if (!editorReady && bytes) {
      toast('Loading editor…')
      await editor.openForEditing(bytes)
      editorReady = true
      toast('Editor ready')
    }
    return editor
  }

  async function requestLine(page: number, x: number, y: number) {
    const editor = await ensureEditor()
    return editor.lineAt(page, x, y)
  }

  async function replace(page: number, x: number, y: number, text: string) {
    const editor = await ensureEditor()
    const result = await editor.replaceText(page, x, y, text)
    undoStack.push(bytes!)
    canUndo = true
    await load(result.bytes, fileName, true)
    toast(
      `Saved edit with ${result.fontUsed}` +
        (result.unsupportedChars.length ? ` · unsupported: ${result.unsupportedChars.join(' ')}` : ''),
    )
  }

  async function undo() {
    const prev = undoStack.pop()
    canUndo = undoStack.length > 0
    if (!prev) return
    await load(prev, fileName, true)
    const editor = await import('./lib/editor/client')
    await editor.openForEditing(prev)
    toast('Edit undone')
  }

  function saveBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    // Revoking immediately can cancel the download in Safari.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const baseName = () => fileName.replace(/\.pdf$/i, '')

  function download() {
    if (!bytes) return
    saveBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), baseName() + (canUndo ? '-edited' : '') + '.pdf')
  }

  function exportNotes() {
    saveBlob(new Blob([toMarkdown(title, author, highlights, pageNotes)], { type: 'text/markdown' }), baseName() + '-notes.md')
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    const mod = e.metaKey || e.ctrlKey
    if (!pdf) return
    if (e.key === '\\' && mod) return (e.preventDefault(), toggleNotes())
    if (target.closest('input, textarea, [contenteditable]')) return
    if (e.key >= '1' && e.key <= '5' && viewer?.highlightSelection(COLORS[Number(e.key) - 1].key)) e.preventDefault()
    else if (e.key === 'e' && !mod) editMode = !editMode
    else if (e.key === 'f' && !mod) focusMode = !focusMode
    else if (e.key === 't' && !mod) toggleContents()
    else if (e.key === 'Escape' && focusMode) focusMode = false
    else if (e.key === 'Escape' && editMode) editMode = false
    else if ((e.key === '=' || e.key === '+') && mod) (e.preventDefault(), zoom(1))
    else if (e.key === '-' && mod) (e.preventDefault(), zoom(-1))
    else if (e.key === 'z' && mod && canUndo) (e.preventDefault(), undo())
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer?.files[0]
    if (file?.type === 'application/pdf') openFile(file)
  }

  function jumpTo(page: number) {
    viewer?.goToPage(page)
    if (narrow()) notesOpen = contentsOpen = false
  }
</script>

<svelte:window onkeydown={onKey} ondragover={(e) => e.preventDefault()} ondrop={onDrop} />

<input
  bind:this={fileInput}
  type="file"
  accept="application/pdf"
  hidden
  onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) openFile(f); e.currentTarget.value = '' }}
/>

{#if pdf}
  {@const pagesLeft = pdf.numPages - currentPage - 1}
  <div class="reader" class:night={focusMode} class:focus={focusMode} class:notes-open={notesOpen && !focusMode}>
    {#if !focusMode}
      <nav class="rail" aria-label="Primary">
        <button class="ib" aria-label="Library" title="Library" onclick={goHome}><Icon name="library" size={20} stroke={1.6} /></button>
        <button
          class="ib"
          class:on={contentsOpen}
          aria-label="Contents"
          aria-pressed={contentsOpen}
          title="Contents  T"
          onclick={toggleContents}
        ><Icon name="contents" size={20} stroke={1.6} /></button>
        <button
          class="ib"
          class:on={editMode}
          aria-label="Edit text"
          aria-pressed={editMode}
          title="Edit text  E"
          onclick={() => (editMode = !editMode)}
        ><Icon name="pencil" size={20} stroke={1.6} /></button>
        <button class="ib" aria-label="Undo edit" title="Undo edit  ⌘Z" disabled={!canUndo} onclick={undo}>
          <Icon name="undo" size={20} stroke={1.6} />
        </button>
        <div class="grow"></div>
        <button class="ib" aria-label="Download" title="Download PDF" onclick={download}><Icon name="download" size={20} stroke={1.6} /></button>
      </nav>
    {/if}

    {#if contentsOpen && !focusMode}
      <div class="contents-slot">
        <ContentsPanel items={outline} {currentPage} onJump={jumpTo} />
      </div>
    {/if}

    <div class="main">
      {#if focusMode}
        <div class="focus-top">
          <span class="truncate">{title}</span>
          <button class="exit" onclick={() => (focusMode = false)}>Exit focus <kbd>esc</kbd></button>
        </div>
      {:else}
        <header class="topbar">
          <button class="back" onclick={goHome}><Icon name="chevron-left" size={20} stroke={1.6} /> Library</button>
          <div class="heading">
            <div class="doc-title truncate" title={title}>{title}</div>
            {#if author}<div class="doc-author truncate">{author}</div>{/if}
          </div>
          <div class="actions">
            <div class="zoom">
              <button class="ib small" aria-label="Zoom out" title="Zoom out  ⌘−" onclick={() => zoom(-1)}><Icon name="minus" /></button>
              <span class="num">{Math.round(scale * 100)}%</span>
              <button class="ib small" aria-label="Zoom in" title="Zoom in  ⌘+" onclick={() => zoom(1)}><Icon name="plus" /></button>
            </div>
            <button class="ib" aria-label="Focus mode" title="Focus mode  F" onclick={() => (focusMode = true)}>
              <Icon name="focus" size={20} stroke={1.6} />
            </button>
            <button
              class="ib"
              class:on={notesOpen}
              aria-label="Toggle notes panel"
              aria-pressed={notesOpen}
              title="Notes  ⌘\"
              onclick={toggleNotes}
            ><Icon name="note" size={20} stroke={1.6} /></button>
          </div>
        </header>
      {/if}

      <main class="content">
        {#if editMode}
          <div class="edit-banner">
            <Icon name="pencil" size={14} /> Editing: click any line of text to change it
            <button class="done" onclick={() => (editMode = false)}>Done</button>
          </div>
        {/if}
        <PdfViewer
          bind:this={viewer}
          bind:currentPage
          {pdf}
          {scale}
          {highlights}
          {editMode}
          onHighlight={(h) => {
            const id = crypto.randomUUID()
            highlights.push({ id, createdAt: Date.now(), ...h })
            save()
            return id
          }}
          onAddNote={(id) => {
            focusMode = false
            if (!roomForBoth()) contentsOpen = false
            notesOpen = true
            noteTarget = id
          }}
          onRecolorHighlight={(id, color) => {
            const h = highlights.find((x) => x.id === id)
            if (h) h.color = color
            save()
          }}
          onDeleteHighlight={(id) => {
            highlights = highlights.filter((h) => h.id !== id)
            if (noteTarget === id) noteTarget = null
            save()
          }}
          onRendered={() => {
            if (firstPaintMs === null) firstPaintMs = Math.round(performance.now() - openedAt)
          }}
          onRequestLine={requestLine}
          onReplace={replace}
        />
      </main>

      <footer class="footer">
        <span class="page-indicator">{currentPage + 1} / {pdf.numPages}</span>
        <div
          class="progress"
          role="progressbar"
          aria-label="Reading progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(((currentPage + 1) / pdf.numPages) * 100)}
        >
          <div style:width="{((currentPage + 1) / pdf.numPages) * 100}%"></div>
        </div>
        <span class="left">
          {#if import.meta.env.DEV && firstPaintMs !== null}<span class="perf">first page in {firstPaintMs} ms · </span>{/if}
          {pagesLeft === 0 ? 'Last page' : `${pagesLeft} ${pagesLeft === 1 ? 'page' : 'pages'} left`}
        </span>
      </footer>
    </div>

    {#if (notesOpen || contentsOpen) && !focusMode}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="scrim" onclick={() => (notesOpen = contentsOpen = false)}></div>
    {/if}
    {#if notesOpen && !focusMode}
      <div class="notes-slot">
        <NotesPanel
          {highlights}
          notes={pageNotes}
          {currentPage}
          target={noteTarget}
          onJump={jumpTo}
          onSave={saveNote}
          onCancelTarget={() => (noteTarget = null)}
          onExport={exportNotes}
        />
      </div>
    {/if}
  </div>
{:else}
  <Library {books} onOpen={openBook} onRemove={forget} onAdd={() => fileInput.click()} onFixture={openFixture} />
{/if}

{#if status}<div class="status" role="status">{status}</div>{/if}

<style>
  :global(#app) {
    height: 100dvh;
    overflow: hidden;
  }

  .reader {
    position: relative;
    display: flex;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
  }

  /* ---- Rail ---- */
  .rail {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 72px;
    padding: 20px 0;
    border-right: 1px solid var(--divider);
  }
  .grow {
    flex: 1;
  }
  .ib {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--touch);
    height: var(--touch);
    padding: 0;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--text-2);
  }
  .ib.small {
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }
  .ib:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  .ib:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .ib.on,
  .ib.on:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }

  /* ---- Top bar ---- */
  .main {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .topbar {
    flex: none;
    display: grid;
    grid-template-columns: 1fr minmax(0, auto) 1fr;
    align-items: center;
    gap: 16px;
    height: 72px;
    padding: 0 24px 0 20px;
  }
  .back {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: var(--touch);
    padding: 0 14px 0 8px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--text-2);
    font-size: 14px;
  }
  .back:hover {
    background: var(--hover);
    color: var(--text);
  }
  .heading {
    min-width: 0;
    text-align: center;
  }
  .doc-title {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .doc-author {
    font-size: 13px;
    color: var(--text-2);
  }
  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    justify-self: end;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .zoom {
    display: flex;
    align-items: center;
    margin-right: 4px;
  }
  .num {
    min-width: 44px;
    text-align: center;
    font-size: 13px;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  /* ---- Content ---- */
  .content {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .edit-banner {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 15;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 14px;
    border-radius: 12px;
    background: var(--popover);
    box-shadow: var(--popover-shadow);
    font-size: 13px;
    color: var(--text-2);
    white-space: nowrap;
  }
  .done {
    height: 32px;
    padding: 0 14px;
    border: 0;
    border-radius: 8px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 13px;
    font-weight: 600;
  }

  /* ---- Footer ---- */
  .footer {
    flex: none;
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 6px 40px 24px;
    font-size: 13px;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
  .page-indicator {
    min-width: 56px;
  }
  .progress {
    flex: 1;
    height: 3px;
    border-radius: 2px;
    background: var(--divider);
  }
  .progress div {
    height: 100%;
    border-radius: 2px;
    background: var(--accent);
    transition: width 0.2s ease;
  }
  .left {
    min-width: 120px;
    text-align: right;
    white-space: nowrap;
  }

  /* ---- Side panels ---- */
  .contents-slot,
  .notes-slot {
    flex: none;
    height: 100%;
  }
  .scrim {
    display: none;
  }

  /* ---- Focus mode: night palette, no chrome, the page recoloured to match ---- */
  .focus-top {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    box-sizing: border-box;
    padding: 16px 40px 8px;
    font-size: 13px;
    color: var(--text-2);
  }
  .exit {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: var(--touch);
    padding: 0 12px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: inherit;
    font-size: 13px;
    opacity: 0.6;
    transition: opacity 0.15s;
  }
  .exit:hover,
  .exit:focus-visible {
    opacity: 1;
    background: var(--hover);
  }
  .focus .footer {
    flex-direction: column;
    gap: 14px;
    padding: 6px 0 20px;
  }
  .focus .progress {
    flex: none;
    width: 100%;
    height: 2px;
    border-radius: 0;
  }
  .focus .page-indicator {
    min-width: 0;
  }
  .focus .left {
    display: none;
  }
  .focus :global(.page) {
    background: var(--page);
    box-shadow: none;
  }
  .focus :global(.page-art) {
    filter: invert(0.92) hue-rotate(180deg) brightness(0.92);
  }

  kbd {
    font-family: inherit;
    font-size: 11px;
    padding: 0 4px;
    border-radius: 3px;
    border: 1px solid var(--divider);
  }
  .status {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 50;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--ink-surface);
    color: var(--on-ink);
    font-size: 13px;
    box-shadow: 0 12px 24px -8px rgb(29 35 33 / 0.4);
  }

  /* ---- Tablet / narrow: panels slide over the page ---- */
  @media (max-width: 1100px) {
    .contents-slot {
      position: absolute;
      top: 0;
      left: 72px;
      bottom: 0;
      z-index: 40;
      box-shadow: 24px 0 40px -24px rgb(29 35 33 / 0.3);
    }
    .contents-slot :global(.contents) {
      width: min(300px, calc(100vw - 72px - 16px));
    }
    .notes-slot {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 40;
      max-width: 85vw;
      box-shadow: -24px 0 40px -24px rgb(29 35 33 / 0.3);
    }
    .notes-slot :global(.notes) {
      width: min(360px, 85vw);
    }
    .scrim {
      display: block;
      position: absolute;
      inset: 0;
      z-index: 30;
      background: rgb(19 23 22 / 0.25);
    }
  }
  @media (max-width: 700px) {
    .rail {
      width: 56px;
      padding: 12px 0;
    }
    .contents-slot {
      left: 56px;
    }
    .topbar {
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 4px;
      height: 60px;
      padding: 0 8px;
    }
    .back {
      padding: 0 8px 0 4px;
    }
    .zoom .num,
    .left {
      display: none;
    }
    .footer {
      padding: 6px 16px 16px;
    }
    .edit-banner {
      white-space: normal;
      width: max-content;
      max-width: calc(100% - 32px);
    }
  }
</style>
