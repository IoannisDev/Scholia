# Scholia: PDF Reader & Editor Plan (v0.4)

> **Scholia** (Greek σχόλια, *"notes in the margin"*): the comments scholars wrote in the margins of ancient manuscripts. That's what this app is for: reading closely and writing your thoughts beside the text.

> Status: **planning only**, nothing built yet. We'll change this document as we go.

## 1. Vision

A **fast, local-first** web app for **people who read a lot of PDFs** (books, papers, reports) and want to think while they read.
Main idea: **reading → highlighting → note-taking → reviewing → editing**, in one quick flow that works with a keyboard on desktop and with touch or a stylus on tablets.

**Who it's for:** students, researchers, professionals, and book readers.

**Settled decisions**
| Topic | Decision |
|---|---|
| Data | **Local-only.** No accounts, no server, no sync. Everything stays on the device. |
| Devices | **Desktop and tablet, equally** (mouse/keyboard, touch, and stylus such as Apple Pencil) |
| Editing | Annotations **plus editing the PDF's own text** and page operations |
| AI | **None** |
| License | **Open source, AGPL-3.0** (this is also what MuPDF.js requires) |
| Name | **Scholia** |
| Priority | **Speed**: fast startup, fast rendering, a small UI bundle |

---

## 2. Core principles

1. **Reading comes first.** The page is the hero and the UI stays out of the way.
2. **Capture with no friction.** Select text → one key or tap → highlighted.
3. **Notes are worth more than highlights.** Every note links back to its exact spot in the PDF.
4. **Fast by default.** Only visible pages are rendered, heavy code loads only when needed, and the UI framework is light.
5. **Private and offline.** The PDFs never leave the device.
6. **Edits never destroy anything.** The original file is always kept, and every edit can be undone.
7. **Your data stays yours.** Export to Markdown, JSON, or a real PDF at any time.

---

## 3. Feature set

### 3.1 Library (home screen)
- Drag and drop or file picker to import PDFs
- Grid or list: cover thumbnail, title, **reading progress %**, last opened, number of highlights, an "edited" badge
- "Continue reading" row at the top; collections/folders and tags; search by title
- Sort by recent, progress, title, or date added

### 3.2 Reader
- Continuous scroll or paged view; one or two pages side by side (two-page fits landscape tablets well)
- Zoom: fit width, fit page, custom, **pinch zoom**
- **Themes:** light, sepia, dark (dark recolors the page itself)
- **Resume where you left off**
- Sidebar: **Outline/TOC**, **Thumbnails**, **Annotations**, **Bookmarks**
- In-document search with all matches highlighted
- Progress bar and an estimate of time left
- **Focus mode**: hides all chrome (`F` on desktop, tap the centre of the page on a tablet)

### 3.3 Highlighting
- Select text → floating toolbar: colour swatches, underline, strikethrough, note, copy
- **Colours that carry meaning** (user can rename them): 🟨 Important · 🟩 Definition · 🟦 Question · 🟥 Disagree · 🟪 Quote
- Desktop: select, then press `1`–`5`
- Tablet: **Highlighter pen mode**: drag the Pencil or a finger across text and the highlight snaps to whole words
- Highlights can span lines, columns, and page breaks
- **Area highlight** (drag a box) for figures, equations, and scanned pages

### 3.4 Notes
| Kind | Where it lives | Use |
|---|---|---|
| **Highlight note** | Attached to a highlight, shown in the margin | Comment on a passage |
| **Sticky note** | Pinned anywhere on a page | A thought about a page or figure |
| **Ink note** | Freehand stylus drawing on the page | Handwriting, circling, arrows (tablet) |
| **Notebook** | Side panel, Markdown, one per document | Long-form summary; drag highlights in as quotes that link back to the PDF |

- Tags and `#hashtags`, searchable across all documents

### 3.5 PDF editing (Edit mode)
Switch to Edit mode with `E` or the toolbar's pencil icon. Edits are kept as a list of operations and only written into the PDF when you save.

**Text editing**
- **Edit existing text:** tap or click a text block and it becomes an editable box at the exact same position. On save, the original characters are removed from the PDF (*real removal, not a white box drawn over them*) and the new text is written back in.
- **Font matching:** the app reuses the PDF's embedded font when it contains every character needed. Otherwise it falls back to the closest standard font (serif, sans, or mono) at the same size, weight, and colour.
- **Add text:** place a new text box anywhere.
- **Delete text**, and **redact** sensitive text (permanently removed).

**Page operations**
- Rotate, reorder (drag thumbnails), delete, insert a blank page, duplicate
- Merge another PDF in; extract pages to a new PDF

**Safety**
- Undo/redo for every operation; the **original is always kept**
- Saving creates a new version; a version list lets you go back
- "Export edited PDF" downloads the result
- Your highlights and notes stay attached across edits, because a highlight remembers both its position and the text it covers

**Known limits (we'll show these to users honestly)**
- If a PDF only contains part of a font, characters it doesn't include fall back to a similar standard font
- Edited text only re-wraps inside its own block; it doesn't push the rest of the page down like a word processor
- Scanned pages have no real text, so they can't be text-edited (OCR may come later)

### 3.6 Annotations panel and review
- List of every highlight and note, grouped by page or chapter; filter by colour, tag, or type; full-text search
- **Global search** across all annotations in the library
- **Review mode (later):** go through highlights like flashcards with spaced repetition

### 3.7 Productivity layer
- **Command palette** (`Cmd/Ctrl+K`)
- Keyboard: `j/k` scroll, `n/p` next/previous page, `g` go to page, `b` bookmark, `[`/`]` previous/next highlight, `E` edit mode
- Tablet gestures: two-finger tap = undo, swipe from the edge = sidebars, double-tap the Pencil = switch tool (where the browser supports it)
- Bookmarks, reading stats, streaks, daily goal, session timer and Pomodoro

### 3.8 Export and import
- **Markdown** of highlights and notes (works with Obsidian and Notion), with page references
- **Annotated PDF**: highlights, notes, and ink saved as real PDF annotations that open in any PDF reader
- **Edited PDF**: the PDF with your text and page edits applied
- **JSON backup and restore** of the whole library (since there's no sync, this is the backup)

---

## 4. Technical architecture: chosen for speed

### 4.1 Final stack
| Layer | Choice | Why it's the fast option |
|---|---|---|
| UI framework | **Svelte 5 (runes) + TypeScript + Vite** | Compiles away; no virtual DOM; very small bundles; quick updates for a toolbar-heavy UI. Simpler than React and has a bigger ecosystem than Solid. |
| Reading engine | **PDF.js (pdfjs-dist)** | Mature text layer for selection, outline, and search; renders in a web worker; streams large files |
| Editing / saving engine | **MuPDF.js (WebAssembly)**, *lazy-loaded* | One of the fastest PDF engines. It can **really remove text** (redaction), write text and real annotations, and do every page operation. It only loads when you open Edit mode or export, so it never slows down reading. |
| State | Svelte runes + small stores | Built in, no extra library |
| Metadata storage | **IndexedDB via Dexie.js** | Local, can be queried, offline |
| PDF file storage | **OPFS** (Origin Private File System) | Fast reads and writes for large files; supported on Chrome, Edge, Firefox, and Safari/iPadOS |
| Notebook editor | **TipTap** (works with any framework) | Rich editing that saves to Markdown |
| UI components | **Tailwind CSS + Bits UI** | Accessible primitives for Svelte, tiny CSS |
| Offline / install | **PWA** (vite-plugin-pwa) | Install on desktop or iPad home screen, works fully offline |
| Testing | Vitest + Playwright (Chromium and WebKit for iPad Safari) | |

> **License:** Scholia is open source under **AGPL-3.0**, which matches MuPDF.js's license, so no commercial license is needed. Every other dependency (PDF.js, Svelte, Dexie, TipTap, Tailwind, Bits UI) uses Apache, MIT, or a similar permissive license that can be combined with AGPL.

### 4.2 Performance plan
- **Page virtualization:** render only the visible pages ±2; render a fast low-resolution pass first, then sharpen
- **Canvas memory cap:** free off-screen canvases (important on iPad Safari, where canvas memory is limited)
- **Workers:** PDF.js parsing and MuPDF editing both run in web workers, so the UI never freezes
- **Lazy-load the heavy parts:** MuPDF's WebAssembly (~several MB), TipTap, and the stats page only download when first used; the reading view's first load stays small (target < 250 KB of JS, not counting the PDF.js worker)
- **Thumbnails** generated once and cached in IndexedDB
- **Budgets:** opening a 500-page PDF shows the first page in < 1 s; scrolling at 60 fps; highlight-to-screen < 16 ms

### 4.3 Structure
```
src/
  app/            routing, layout, responsive shell (desktop vs tablet)
  features/
    library/      document list, import, collections
    reader/       PDF.js viewer, virtualization, text layer, themes
    annotations/  highlight engine, notes, ink, toolbar, panel
    editor/       edit mode, MuPDF worker bridge, edit operation log, versions
    notebook/     TipTap markdown editor, backlinks
    search/       in-doc + global search
    stats/        sessions, streaks
    export/       markdown / annotated pdf / edited pdf / json
  lib/
    pdf/          coordinate utils (PDF units ↔ screen)
    input/        pointer abstraction: mouse / touch / pen, palm rejection
    db/           Dexie schema + repositories
    storage/      OPFS file store
  workers/        mupdf.worker.ts
  components/     shared UI (command palette, toolbars, sheets)
```

### 4.4 Data model (first draft)
```ts
Document {
  id                      // SHA-256 of the ORIGINAL file, so annotations find their file again
  title, author, pageCount, coverThumb
  addedAt, lastOpenedAt
  progress: { page, scrollOffset, percent }
  collectionIds, tags
  currentVersionId        // the edited version being shown; null = original
}

DocumentVersion { id, documentId, fileRef (OPFS path), createdAt, label, parentVersionId }

EditOp {                  // the list of edits, replayed by MuPDF when you save
  id, documentId, seq
  type: 'replaceText' | 'addText' | 'deleteText' | 'redact'
      | 'rotatePage' | 'movePage' | 'deletePage' | 'insertPage' | 'mergeDoc'
  page, rect?, payload    // e.g. { newText, font, size, color }
}

Annotation {
  id, documentId
  type: 'highlight' | 'underline' | 'strike' | 'area' | 'sticky' | 'ink'
  color
  anchors: { page, rects: Rect[] }[]     // PDF units, so it works at any zoom level
  quote?: { exact, prefix, suffix }      // text context for re-finding it after edits
  inkPaths?: { points: [x, y, pressure][] }[]
  note?, tags, createdAt, updatedAt
}

Notebook { documentId, content (markdown), updatedAt }
Bookmark { id, documentId, page, label }
ReadingSession { id, documentId, start, end, pagesRead }
Settings { theme, colorLabels, shortcuts, dailyGoal, penMode, ... }
```

### 4.5 Key risks and mitigations
| Risk | Mitigation |
|---|---|
| **Editing text** with partial fonts | Use the embedded font when it covers the characters, otherwise a standard-font fallback; preview before saving; clear UI messages about the limits |
| **Selection across pages** | Custom selection model; spike it in Phase 0 |
| **Touch selection on iPad** conflicting with native long-press | Our own selection handles in pen/highlight mode; native selection kept as a fallback |
| **Palm resting on screen** while using a stylus | When a pen is detected, ignore touch input on the page |
| **Storage eviction (especially Safari)** | `navigator.storage.persist()`, encourage installing the PWA, regular reminders to make a JSON backup |
| **Annotations shifting after edits** | Re-find highlights using the quoted text after a text edit; page operations rewrite page indices |
| **MuPDF download size** | Lazy-load it and cache it with the service worker after first use |

---

## 5. UX layout

**Desktop**
```
┌──────────────────────────────────────────────────────────────────────┐
│ ◀ Library   Title            🔍  🎨  ✏️Edit  ⌘K          ▤ notebook  │
├────────┬───────────────────────────────────────────┬─────────────────┤
│Outline │              PDF PAGE                     │  Notebook /     │
│Thumbs  │     ████ highlighted text ████  ┃ margin  │  Annotations    │
│Annots  │      [🟨🟩🟦🟥🟪 | U S | 📝 | ⧉]           │                 │
├────────┴───────────────────────────────────────────┴─────────────────┤
│ p. 12 / 340  ▓▓▓░░░░░░░ 4%   ~3h 20m left   ⏱ 00:24:10               │
└──────────────────────────────────────────────────────────────────────┘
```

**Tablet**: sidebars become slide-over drawers and bottom sheets; tool palette floats and can be moved
```
┌───────────────────────────────────┐
│ ◀   Title                 🔍  ⋯   │  (hides while reading)
│                                   │
│            PDF PAGE               │
│                                   │
│                           ┌─────┐ │
│                           │ 🖍️  │ │  floating tools:
│                           │ ✒️  │ │  highlighter, pen, eraser,
│                           │ 🧽  │ │  sticky note, edit text
│                           │ 📝  │ │
│                           └─────┘ │
│ ▓▓▓░░░░░░  p.12/340               │
└───────────────────────────────────┘
```
Touch targets are at least 44 px. The layout switches by screen width and input type, not by device name.

---

## 6. Roadmap

### Phase 0: Foundations and spikes
- Scaffold Svelte 5 + Vite + TS, Tailwind, Vitest, Playwright
- Render pages and the text layer with PDF.js, with virtualization
- **Spike A:** highlight anchoring and cross-page selection (mouse and touch)
- **Spike B:** MuPDF.js in a worker: replace one line of text and save. This confirms text editing works before we build on it.

### Phase 1: MVP: read and highlight
- Import, library list, OPFS storage, resume position
- Continuous scroll, zoom, pinch zoom
- Selection toolbar, 5-colour highlights, keyboard shortcuts
- Highlight notes; annotations panel
- Responsive shell (desktop and tablet)

### Phase 2: Productive reader
- Notebook with drag-in quotes and backlinks
- Outline, thumbnails, bookmarks, search
- Themes, focus mode, command palette, full keyboard shortcuts
- **Pencil highlighter mode** and palm rejection
- Markdown export, JSON backup

### Phase 3: Editor
- Edit mode: edit, add, and delete text; redact
- Page operations: rotate, reorder, delete, insert, merge, extract
- Undo/redo, versions, edited PDF export
- Annotated PDF export (real PDF annotations)

### Phase 4: Power features
- Sticky notes, ink notes (pressure-sensitive), area highlights, underline/strike
- Tags, collections, global annotation search
- Reading stats, sessions, streaks, goals
- PWA install and offline use

### Phase 5: Later
- Review mode (spaced repetition)
- OCR for scanned PDFs (tesseract.js) so they can be highlighted and edited
- Fill in PDF forms and add signatures

---

## 7. Success criteria
- 500-page PDF: first page in < 1 s, scrolling at 60 fps on desktop and a mid-range iPad
- Highlight in 2 actions or fewer (select + key, or one Pencil stroke)
- Annotations survive reload, re-import, and text edits
- Edited PDFs open correctly in Acrobat, Preview, and Chrome
- Works fully offline

---

## 8. Open questions
1. Should edited PDFs **replace** the library copy by default, or always be saved as a new version? (Default for now: **new version**; you can change it in settings.)
2. **Visual identity:** logo and colours. Idea: a quill or a marginal note mark, warm parchment and ink colours.
3. **Where to host the code:** GitHub repo name (e.g. `scholia`) and whether to publish the app with GitHub Pages.
4. **JS size budget for the reading view:** count it **gzipped** (< 250 KB, currently 152 KB ✅), or **raw excluding PDF.js** (our own code + UI only)? The original "< 250 KB raw" can't be met because PDF.js alone is ~400 KB.
5. **Touch testing:** OK to install Playwright's WebKit browser (~100 MB download) for automated iPad-style tests, or would you rather test on a real iPad?

## 8a. Phase 0 results (2026-10-17)

**Status: done, except touch selection.** Both risky spikes work with mouse and keyboard. Touch selection (part of Spike A in §6) has **not** been tested yet: it needs Playwright's WebKit browser (a separate download) or a real iPad.

| Check | Result |
|---|---|
| Scaffold: Svelte 5 + Vite + TS, Tailwind v4, Vitest, Playwright | ✅ |
| PDF.js rendering + selectable text layer | ✅ |
| Virtualization (visible pages ±~2, far canvases freed) | ✅ 3 canvases in the DOM after scrolling 600 pages |
| 600-page PDF, time to first page | ✅ 240–780 ms (budget < 1 s) |
| **Spike A:** highlight across a page break | ✅ one highlight anchored to pages 1 and 2 |
| Highlights stay on the text at 50%, 125%, 200% zoom | ✅ automated check + screenshots |
| Highlights survive reload | ✅ (stored in localStorage for the spike; Dexie in Phase 1) |
| Coordinate math matches pdf.js at rotations 0/90/180/270 | ✅ unit tests compare against real pdf.js viewports |
| **Spike B:** edit a line of PDF text with MuPDF | ✅ old glyphs really removed, new text on the same baseline, neighbouring lines untouched |
| Text editing in the browser (worker), dev **and** production build | ✅ editor ready in ~60 ms after the WebAssembly download |
| Undo edit, download edited PDF | ✅ e2e test reopens the downloaded file and checks its text |
| Edited PDF opens in other readers | ✅ MuPDF, pdf.js, and **Apple PDFKit** (Preview's engine) render it and extract the right text. Not yet checked: Acrobat, Chrome's built-in viewer (PDFium) |
| Cross-page selection with **touch** (iPad) | ⏳ not tested yet (see status) |
| Reading-view JS < 250 KB | ⚠️ 489 KB raw / 152 KB gzipped (see open question 4) |

**Tests:** 21 unit tests (Vitest) and 3 end-to-end tests (Playwright, real Chrome).

**What we learned / limits found**
- **Fonts:** edited text uses the closest standard PDF font (Helvetica, Times, or Courier family, chosen from the original font's name and style). Western European characters and common punctuation (– — " " ' ' € …) work. **Other scripts (Greek, Cyrillic, CJK, emoji) are not supported yet.** They become `?` and the app reports it. Fix in Phase 3: reuse the embedded font when it contains every needed glyph, or embed a full Unicode font such as Noto.
- **Redaction band:** text is removed using a thin band around the line's x-height, so neighbouring lines are safe with normal spacing. Very tight leading or superscripts may need a smarter per-glyph removal later.
- **Edits are one line at a time.** Multi-line paragraph edits with re-wrapping come in Phase 3.
- **Bundle size:** the reading view's JS is 489 KB raw / 152 KB gzipped. Most of it is the PDF.js library (~400 KB raw), which the reading view can't work without, so the "< 250 KB raw" budget was never achievable as written. Choosing a new target is open question 4. MuPDF (10.4 MB WebAssembly, 4.8 MB gzipped) only downloads when Edit mode is first used, as planned.
- **Gotchas fixed along the way** (documented in code):
  - MuPDF's top-level await means the worker must register its message handler before loading the engine, or early messages are lost.
  - Bytes saved by MuPDF must be copied out of WebAssembly memory before being sent between threads.
- Touch/iPad selection is not tested yet (see status).
- Test files (`*.test.ts`) aren't type-checked at the moment: svelte-check excludes them and Vitest doesn't type-check. Add a test tsconfig in Phase 1.

**Phase 0 code map**
- `src/lib/pdf/coords.ts`: PDF ↔ screen coordinate math, line-rect merging (tested)
- `src/lib/pdf/selection.ts`: DOM selection → page anchors (PDF units) + text quote
- `src/lib/editor/textEdit.ts`: MuPDF line finding, font matching, redaction + rewrite (tested)
- `src/workers/mupdf.worker.ts` + `src/lib/editor/client.ts`: the editor running in a worker, loaded on demand
- `src/features/reader/PdfViewer.svelte`, `PdfPage.svelte`: virtualized viewer, highlight overlay, edit box
- `scripts/make-fixtures.mjs`: generates test PDFs (sample + 600 pages); `tests/e2e/phase0.spec.ts`: browser tests

## 9. Changelog
- **v0.5 (2026-10-17):** UI redesigned in a minimal, Notion-like style:
  - Warm greys, a collapsible left sidebar (`⌘\`) with document and highlights, a breadcrumb top bar with quiet icon buttons.
  - Floating highlight toolbar above the selection; click a highlight for a colour/delete menu.
  - Edit-mode banner, toast messages, a floating page indicator.
  - A Notion-page-style welcome screen.
  - Automatic dark mode (follows the system).
  - On tablets the sidebar slides over the page and touch targets are larger.
- **v0.4 (2026-10-17):** Phase 0 done except touch selection. Results in §8a.
- **v0.3 (2026-10-17):** Named the app **Scholia**. License set to AGPL-3.0 (open source). Default for saving edits: new version.
- **v0.2 (2026-10-17):** Local-only, desktop and tablet, no AI. Added PDF text editing (MuPDF.js, lazy-loaded) and page operations. Stack changed to **Svelte 5** for speed. Added tablet UX (Pencil highlighter, ink, palm rejection, drawers). Removed sync and AI. New Phase 3 for the editor.
- v0.1 (2026-10-17): first full plan
