<script lang="ts" module>
  // Minimal line icons (paths from Lucide, ISC license).
  const ICONS = {
    'panel-left': ['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 3v18'],
    'chevrons-left': ['m11 17-5-5 5-5', 'm18 17-5-5 5-5'],
    minus: ['M5 12h14'],
    plus: ['M5 12h14', 'M12 5v14'],
    pencil: [
      'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
      'm15 5 4 4',
    ],
    undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'],
    download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
    upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm17 8-5-5-5 5', 'M12 3v12'],
    file: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
    layers: [
      'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z',
      'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65',
      'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65',
    ],
    highlighter: ['m9 11-6 6v3h9l3-3', 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'],
    trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'],
    x: ['M18 6 6 18', 'm6 6 12 12'],
    // Drawn for this app, in the same 24px grid.
    library: ['M5 4v16', 'M10 4v16', 'M15.5 5.5l3.5 14'],
    contents: ['M4 7h16', 'M4 12h16', 'M4 17h10'],
    'chevron-left': ['M15 5l-7 7 7 7'],
    note: ['M4 20l1-4L16 5l3 3L8 19z', 'M14 7l3 3'],
    focus: ['M4 9V5h4', 'M16 5h4v4', 'M20 15v4h-4', 'M8 19H4v-4'],
    search: ['M16 16l4 4', 'M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12'],
  } as const

  export type IconName = keyof typeof ICONS
</script>

<script lang="ts">
  let { name, size = 16, stroke = 1.75 }: { name: IconName; size?: number; stroke?: number } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each ICONS[name] as d (d)}<path {d} />{/each}
</svg>
