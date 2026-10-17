<script lang="ts">
  // The Scholia mark (an S of two arcs with a margin dot) and lowercase wordmark. Sized by font-size; colour follows the text.
  let { size = 24, wordmark = true }: { size?: number; wordmark?: boolean } = $props()
</script>

<span class="lockup" style:font-size="{size}px">
  <svg viewBox="0 0 64 64" role="img" aria-label={wordmark ? undefined : 'Scholia'} aria-hidden={wordmark ? 'true' : undefined}>
    <path d="M43 21 A11 11 0 1 0 32 32 A11 11 0 1 1 21 43" fill="none" stroke="currentColor" stroke-width="7" />
    <circle cx="50" cy="14" r="4" fill="currentColor" />
  </svg>
  {#if wordmark}<span class="word">scholia</span>{/if}
</span>

<style>
  .lockup {
    display: inline-flex;
    align-items: center;
    gap: 0.23em;
    line-height: 1;
  }
  svg {
    flex: none;
    width: 1.07em;
    height: 1.07em;
  }
  .word {
    padding-bottom: 0.08em;
    font-family: var(--font);
    font-weight: 600;
    letter-spacing: -0.035em;
  }
</style>
