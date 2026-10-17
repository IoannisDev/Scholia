<script lang="ts">
  import Icon from '../../components/Icon.svelte'
  import Logo from '../../components/Logo.svelte'
  import { progress, shelfOf, type Book, type Shelf } from '../../lib/library/store'

  interface Props {
    books: Book[]
    onOpen: (book: Book) => void
    onRemove: (book: Book) => void
    onAdd: () => void
    onFixture: (name: string) => void
  }

  let { books, onOpen, onRemove, onAdd, onFixture }: Props = $props()

  // Typographic covers, picked from the title so a book keeps its colour.
  const COVERS = [
    { bg: '#1f3b33', fg: '#e8e4d6' },
    { bg: '#26394d', fg: '#e4e8ec' },
    { bg: '#3b3a4a', fg: '#e9e7ef' },
    { bg: '#7a4b33', fg: '#f3e9dd' },
    { bg: '#5e3335', fg: '#f2e6e4' },
    { bg: '#d8cfb9', fg: '#2a2a24' },
  ]
  function cover(book: Book) {
    let h = 0
    for (const ch of book.id.slice(0, 8)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return { ...COVERS[h % COVERS.length], round: h % 2 === 0 }
  }

  const FILTERS: { key: Shelf; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'reading', label: 'Reading' },
    { key: 'unread', label: 'To read' },
    { key: 'finished', label: 'Finished' },
  ]
  let filter = $state<Shelf>('all')
  let query = $state('')

  // Books are sorted by when they were last opened.
  const current = $derived(books[0])
  const shown = $derived(
    books.filter(
      (b) =>
        (filter === 'all' || shelfOf(b) === filter) &&
        (b.title + ' ' + b.author).toLowerCase().includes(query.trim().toLowerCase()),
    ),
  )

  function status(book: Book) {
    const shelf = shelfOf(book)
    if (shelf === 'unread') return 'To read'
    if (shelf === 'finished') return 'Finished'
    return `${Math.round(progress(book) * 100)}% read`
  }

  function highlightCount(book: Book) {
    try {
      return JSON.parse(localStorage.getItem('scholia:hl:' + book.id) ?? '[]').length as number
    } catch {
      return 0
    }
  }
</script>

{#snippet bookCover(book: Book, large: boolean)}
  {@const c = cover(book)}
  <div class="cover" class:large style:background={c.bg} style:color={c.fg} aria-hidden="true">
    <span class="cover-author">{book.author}</span>
    <span class="cover-mark" class:round={c.round}></span>
    <span class="cover-title">{book.title}</span>
  </div>
{/snippet}

<div class="library">
  <div class="wrap">
    <header class="top">
      <div class="wordmark"><Logo size={26} /></div>
      <div class="search">
        <label for="library-search" class="sr-only">Search your library</label>
        <span class="search-icon"><Icon name="search" size={20} stroke={1.6} /></span>
        <input id="library-search" type="search" placeholder="Search titles and authors" bind:value={query} />
      </div>
      <div class="grow"></div>
      {#if import.meta.env.DEV}
        <button class="btn outline" onclick={() => onFixture('sample.pdf')}>Sample</button>
        <button class="btn outline" onclick={() => onFixture('long.pdf')}>600 pages</button>
      {/if}
      <button class="btn primary" onclick={onAdd}><Icon name="plus" size={20} stroke={1.6} /> Add PDF</button>
    </header>

    {#if current}
      {@const hl = highlightCount(current)}
      <section class="hero" aria-label="Continue reading">
        {@render bookCover(current, true)}
        <div class="hero-body">
          <div>
            <div class="eyebrow">Continue reading</div>
            <h1>{current.title}</h1>
            {#if current.author}<div class="author">{current.author}</div>{/if}
          </div>
          <div class="hero-progress">
            <div class="bar"><div style:width="{progress(current) * 100}%"></div></div>
            <div class="caption">
              Page {current.page + 1} of {current.numPages}{hl ? ` · ${hl} ${hl === 1 ? 'highlight' : 'highlights'}` : ''}
            </div>
          </div>
          <div><button class="btn primary big" onclick={() => onOpen(current)}>Resume reading</button></div>
        </div>
      </section>
    {:else}
      <section class="hero empty" aria-label="Get started">
        <div class="hero-body">
          <div>
            <div class="eyebrow">Your shelf is empty</div>
            <h1>Read closely. Write in the margins.</h1>
            <div class="author">Add a PDF, or drop one anywhere. Your files stay on this device.</div>
          </div>
          <div><button class="btn primary big" onclick={onAdd}>Add a PDF</button></div>
        </div>
      </section>
    {/if}

    {#if books.length}
      <section class="shelf" aria-label="Shelf">
        <div class="shelf-head">
          <h2>Shelf</h2>
          <div role="group" aria-label="Filter" class="chips">
            {#each FILTERS as f (f.key)}
              <button class="chip" aria-pressed={filter === f.key} onclick={() => (filter = f.key)}>{f.label}</button>
            {/each}
          </div>
        </div>

        <div class="grid">
          {#each shown as book (book.id)}
            <div class="card-wrap">
              <button class="card" onclick={() => onOpen(book)}>
                {@render bookCover(book, false)}
                <span class="card-text">
                  <span class="card-title">{book.title}</span>
                  <span class="card-status">{status(book)}</span>
                </span>
              </button>
              <button class="remove" aria-label="Remove {book.title} from library" title="Remove from library" onclick={() => onRemove(book)}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          {:else}
            <p class="none">No books match.</p>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .library {
    height: 100%;
    overflow: auto;
    background: var(--bg);
  }
  .wrap {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 40px 80px;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 12px;
    padding: 20px 0;
  }
  .wordmark {
    width: 132px;
  }
  .search {
    position: relative;
    flex: 1 1 280px;
    max-width: 520px;
  }
  .search-icon {
    position: absolute;
    left: 14px;
    top: 12px;
    color: var(--text-2);
    pointer-events: none;
  }
  .search input {
    width: 100%;
    height: var(--touch);
    box-sizing: border-box;
    padding: 0 14px 0 42px;
    border: 1px solid var(--divider);
    border-radius: 12px;
    background: var(--page);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  .search input:focus-visible {
    outline-offset: 0;
  }
  .grow {
    flex: 1 1 0;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: var(--touch);
    padding: 0 20px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--text);
    font-size: 14px;
    font-weight: 500;
  }
  .btn.primary {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
  }
  .btn.primary:hover {
    filter: brightness(1.1);
  }
  .btn.outline {
    border: 1px solid var(--divider);
  }
  .btn.outline:hover {
    background: var(--hover);
  }
  .btn.big {
    height: 48px;
    padding: 0 28px;
    font-size: 15px;
  }

  .hero {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 40px;
    margin-top: 32px;
    padding: 40px;
    border-radius: 20px;
    background: var(--page);
    box-shadow: 0 1px 0 rgb(29 35 33 / 0.05), 0 24px 48px -32px rgb(29 35 33 / 0.3);
  }
  .hero-body {
    flex: 1 1 320px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-width: 0;
  }
  .eyebrow {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-2);
  }
  .hero h1 {
    margin: 8px 0 4px;
    font-family: var(--serif);
    font-size: 40px;
    font-weight: 500;
    line-height: 1.1;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  .author {
    font-size: 16px;
    color: var(--text-2);
  }
  .hero-progress {
    max-width: 420px;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: var(--divider);
  }
  .bar div {
    height: 100%;
    border-radius: 2px;
    background: var(--accent);
  }
  .caption {
    margin-top: 10px;
    font-size: 13px;
    color: var(--text-2);
  }

  .cover {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    aspect-ratio: 2 / 3;
    width: 100%;
    box-sizing: border-box;
    padding: 16px 14px;
    border-radius: 3px 7px 7px 3px;
    box-shadow: 0 16px 24px -14px rgb(29 35 33 / 0.5);
    text-align: left;
    overflow: hidden;
    transition: transform 0.18s ease;
  }
  .cover.large {
    width: 160px;
    flex: none;
    padding: 18px 16px;
    border-radius: 4px 8px 8px 4px;
    box-shadow: 0 18px 28px -14px rgb(29 35 33 / 0.5);
  }
  .cover-author {
    min-height: 1em;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .large .cover-author {
    font-size: 10px;
  }
  .cover-mark {
    align-self: center;
    width: 44px;
    height: 44px;
    border: 1px solid currentColor;
    border-radius: 4px;
    opacity: 0.6;
  }
  .cover-mark.round {
    border-radius: 50%;
  }
  .large .cover-mark {
    width: 56px;
    height: 56px;
  }
  .cover-title {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-family: var(--serif);
    font-size: 16px;
    font-weight: 500;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
  .large .cover-title {
    font-size: 19px;
  }

  .shelf {
    margin-top: 56px;
  }
  .shelf-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .shelf h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
  .chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    height: 40px;
    padding: 0 16px;
    border: 1px solid var(--divider);
    border-radius: 20px;
    background: transparent;
    color: var(--text-2);
    font-size: 14px;
  }
  .chip:hover {
    background: var(--hover);
  }
  .chip[aria-pressed='true'] {
    border-color: var(--text);
    background: var(--text);
    color: var(--bg);
    font-weight: 500;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(160px, 100%), 1fr));
    gap: 40px 28px;
    margin-top: 28px;
  }
  .card-wrap {
    position: relative;
  }
  /* Shown on hover or keyboard focus; always shown on touch screens, which have no hover. */
  .remove {
    position: absolute;
    top: 8px;
    right: 8px;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: var(--page);
    color: var(--text-2);
    box-shadow: 0 2px 8px rgb(29 35 33 / 0.25);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .card-wrap:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }
  .remove:hover {
    color: var(--danger);
  }
  @media (pointer: coarse) {
    .remove {
      opacity: 1;
    }
  }
  .card {
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 12px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    color: inherit;
    text-align: left;
  }
  .card:focus-visible {
    outline-offset: 3px;
  }
  .card:hover .cover {
    transform: translateY(-3px);
  }
  .card-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .card-title {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .card-status,
  .none {
    font-size: 13px;
    color: var(--text-2);
  }
  .none {
    margin: 0;
  }

  @media (max-width: 700px) {
    .wrap {
      padding: 0 16px 48px;
    }
    .wordmark {
      width: auto;
      flex: 1;
    }
    .search {
      order: 10;
      flex-basis: 100%;
    }
    .grow {
      display: none;
    }
    .hero {
      padding: 24px;
      gap: 24px;
    }
    .hero h1 {
      font-size: 30px;
    }
  }
</style>
