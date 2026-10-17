<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { colorHex, type Highlight, type PageNote } from '../../lib/annotations/types'

  interface Props {
    highlights: Highlight[]
    notes: PageNote[]
    currentPage: number
    /** Highlight the note field writes to; null writes a note on the current page. */
    target: string | null
    onJump: (page: number) => void
    onSave: (text: string) => void
    onCancelTarget: () => void
    onExport: () => void
  }

  let { highlights, notes, currentPage, target, onJump, onSave, onCancelTarget, onExport }: Props = $props()

  let scope = $state<'page' | 'book'>('book')
  let draft = $state('')
  let field: HTMLTextAreaElement

  const targetHighlight = $derived(target ? highlights.find((h) => h.id === target) : undefined)

  const items = $derived(
    [
      ...highlights.map((h) => ({ kind: 'hl' as const, page: h.anchors[0].page, at: h.createdAt, h })),
      ...notes.map((n) => ({ kind: 'note' as const, page: n.page, at: n.createdAt, n })),
    ]
      .filter((it) =>
        scope === 'book' ? true : it.kind === 'hl' ? it.h.anchors.some((a) => a.page === currentPage) : it.page === currentPage,
      )
      .sort((a, b) => a.page - b.page || a.at - b.at),
  )

  function pages(h: Highlight) {
    const ps = [...new Set(h.anchors.map((a) => a.page + 1))]
    return ps.length > 1 ? `Page ${ps[0]}–${ps[ps.length - 1]}` : `Page ${ps[0]}`
  }

  // Pointing the field at a highlight starts from its existing note. Only a change of target resets the draft.
  $effect(() => {
    void target
    untrack(() => {
      draft = targetHighlight?.note ?? ''
      if (targetHighlight) tick().then(() => field.focus())
    })
  })

  function save() {
    if (!targetHighlight && !draft.trim()) return
    onSave(draft.trim())
    draft = ''
  }
</script>

<aside class="notes" aria-label="Notes">
  <div class="head">
    <h2>Notes</h2>
    <div role="group" aria-label="Scope" class="segmented">
      <button aria-pressed={scope === 'page'} onclick={() => (scope = 'page')}>Page</button>
      <button aria-pressed={scope === 'book'} onclick={() => (scope = 'book')}>Book</button>
    </div>
  </div>

  <ul class="list">
    {#each items as it (it.kind === 'hl' ? it.h.id : it.n.id)}
      <li>
        {#if it.kind === 'hl'}
          <button class="hl-item" class:targeted={it.h.id === target} onclick={() => onJump(it.page)}>
            <span class="meta"><span class="dot" style:background={colorHex(it.h.color)}></span>{pages(it.h)}</span>
            <span class="quote">“{it.h.quote.exact.replace(/\s+/g, ' ').trim()}”</span>
            {#if it.h.note}<span class="comment">{it.h.note}</span>{/if}
          </button>
        {:else}
          <button class="note-item" onclick={() => onJump(it.page)}>
            <span class="meta">Page {it.page + 1}</span>
            <span class="comment own">{it.n.text}</span>
          </button>
        {/if}
      </li>
    {:else}
      <li class="empty">
        Select text and press <kbd>1</kbd>–<kbd>5</kbd> to highlight, or write a note below.
      </li>
    {/each}
  </ul>

  <form class="compose" onsubmit={(e) => { e.preventDefault(); save() }}>
    <label for="quick-note">
      {#if targetHighlight}Note on “{targetHighlight.quote.exact.slice(0, 40).trim()}{targetHighlight.quote.exact.length > 40 ? '…' : ''}”
      {:else}Note on page {currentPage + 1}{/if}
    </label>
    <textarea
      id="quick-note"
      rows="3"
      placeholder="Write something you want to remember"
      bind:this={field}
      bind:value={draft}
      onkeydown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.preventDefault(), save())
        else if (e.key === 'Escape' && target) onCancelTarget()
      }}
    ></textarea>
    <div class="row">
      {#if target}
        <button type="button" class="link" onclick={onCancelTarget}>Cancel</button>
      {:else}
        <button type="button" class="link" onclick={onExport} disabled={!highlights.length && !notes.length}>
          Export as Markdown
        </button>
      {/if}
      <button type="submit" class="save">Save note</button>
    </div>
  </form>
</aside>

<style>
  .notes {
    display: flex;
    flex-direction: column;
    width: 360px;
    height: 100%;
    box-sizing: border-box;
    padding: 24px 24px 20px;
    background: var(--sidebar);
    border-left: 1px solid var(--divider);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--touch);
    flex: none;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .segmented {
    display: inline-flex;
    padding: 3px;
    border-radius: 10px;
    background: var(--bg);
    font-size: 13px;
  }
  .segmented button {
    height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text-2);
  }
  .segmented button[aria-pressed='true'] {
    background: var(--page);
    color: var(--text);
    font-weight: 600;
    box-shadow: 0 1px 2px rgb(29 35 33 / 0.12);
  }

  .list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 16px -12px 16px;
    padding: 0;
    list-style: none;
  }
  .hl-item,
  .note-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    padding: 14px 12px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--text);
    text-align: left;
  }
  .hl-item:hover,
  .note-item:hover {
    background: var(--hover);
  }
  .hl-item.targeted {
    background: var(--accent-soft);
  }
  .meta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-2);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .quote {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-family: var(--serif);
    font-size: 15px;
    line-height: 1.55;
  }
  .comment {
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-2);
    white-space: pre-wrap;
  }
  .comment.own {
    color: var(--text);
  }
  .empty {
    padding: 14px 12px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-2);
  }
  kbd {
    font-family: inherit;
    font-size: 11px;
    padding: 0 4px;
    border-radius: 3px;
    border: 1px solid var(--divider);
    background: var(--page);
  }

  .compose {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: none;
  }
  label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    color: var(--text-2);
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: none;
    padding: 12px 14px;
    border: 1px solid var(--divider);
    border-radius: 12px;
    background: var(--page);
    color: var(--text);
    font: inherit;
    font-size: 14px;
    line-height: 1.5;
  }
  textarea:focus-visible {
    outline-offset: 0;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .link {
    height: var(--touch);
    padding: 0 4px;
    border: 0;
    background: transparent;
    color: var(--text-2);
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .link:hover:not(:disabled) {
    color: var(--text);
  }
  .link:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .save {
    height: var(--touch);
    padding: 0 20px;
    border: 0;
    border-radius: 12px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 14px;
    font-weight: 600;
  }
  .save:hover {
    filter: brightness(1.1);
  }
</style>
