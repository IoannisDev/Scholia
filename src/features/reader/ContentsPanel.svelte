<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity'
  import Icon from '../../components/Icon.svelte'
  import { activeEntry, type TocItem } from '../../lib/pdf/outline'

  interface Props {
    /** Null while the outline is still loading. */
    items: TocItem[] | null
    currentPage: number
    onJump: (page: number) => void
  }

  let { items, currentPage, onJump }: Props = $props()

  const activePath = $derived(items ? activeEntry(items, currentPage) : [])
  const activeId = $derived(activePath.at(-1)?.id)

  // A short outline starts fully open; a long one opens only the path to where you are.
  // Anything you toggle stays as you left it.
  const SHORT = 30
  const total = $derived.by(() => {
    const count = (list: TocItem[]): number => list.reduce((n, i) => n + 1 + count(i.items), 0)
    return items ? count(items) : 0
  })
  const toggled = new SvelteMap<string, boolean>()
  function isOpen(item: TocItem) {
    return toggled.get(item.id) ?? (total <= SHORT || activePath.includes(item))
  }

  let list = $state<HTMLElement>()
  $effect(() => {
    void activeId
    list?.querySelector('[aria-current="location"]')?.scrollIntoView({ block: 'nearest' })
  })
</script>

{#snippet entries(level: TocItem[], depth: number)}
  <ul class:nested={depth > 0}>
    {#each level as item (item.id)}
      {@const open = isOpen(item)}
      <li>
        <div class="row" style:--depth={depth}>
          {#if item.items.length}
            <button
              class="twisty"
              class:open
              aria-label="{open ? 'Collapse' : 'Expand'} {item.title}"
              aria-expanded={open}
              onclick={() => toggled.set(item.id, !open)}
            ><Icon name="chevron-left" size={14} /></button>
          {:else}
            <span class="twisty-space"></span>
          {/if}
          <button
            class="entry"
            aria-current={item.id === activeId ? 'location' : undefined}
            disabled={item.page === null}
            onclick={() => item.page !== null && onJump(item.page)}
          >
            <span class="title">{item.title}</span>
            {#if item.page !== null}<span class="page">{item.page + 1}</span>{/if}
          </button>
        </div>
        {#if item.items.length && open}{@render entries(item.items, depth + 1)}{/if}
      </li>
    {/each}
  </ul>
{/snippet}

<nav class="contents" aria-label="Contents">
  <div class="head"><h2>Contents</h2></div>
  <div class="list" bind:this={list}>
    {#if items === null}
      <p class="empty">Loading…</p>
    {:else if items.length}
      {@render entries(items, 0)}
    {:else}
      <p class="empty">This PDF has no table of contents.</p>
    {/if}
  </div>
</nav>

<style>
  .contents {
    display: flex;
    flex-direction: column;
    width: 300px;
    height: 100%;
    box-sizing: border-box;
    padding: 24px 12px 20px;
    background: var(--sidebar);
    border-right: 1px solid var(--divider);
  }
  .head {
    display: flex;
    align-items: center;
    height: var(--touch);
    padding: 0 12px;
    flex: none;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    margin-top: 12px;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: stretch;
    padding-left: calc(var(--depth) * 16px);
  }
  .twisty,
  .twisty-space {
    flex: none;
    width: 28px;
  }
  .twisty {
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text-2);
  }
  .twisty :global(svg) {
    transform: rotate(180deg);
    transition: transform 0.15s ease;
  }
  .twisty.open :global(svg) {
    transform: rotate(270deg);
  }
  .twisty:hover {
    background: var(--hover);
    color: var(--text);
  }
  .entry {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-height: 40px;
    padding: 9px 10px;
    box-sizing: border-box;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--text);
    font-size: 14px;
    line-height: 1.4;
    text-align: left;
  }
  .entry:hover:not(:disabled) {
    background: var(--hover);
  }
  .entry:disabled {
    color: var(--text-2);
    cursor: default;
  }
  .entry[aria-current='location'] {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .page {
    flex: none;
    font-size: 12px;
    color: var(--text-2);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    margin: 0;
    padding: 4px 12px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-2);
  }
</style>
