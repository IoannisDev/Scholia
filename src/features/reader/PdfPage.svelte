<script lang="ts">
  import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
  import { pdfToScreenRect, viewportTransform, type Rect } from '../../lib/pdf/coords'
  import { colorHex, type Highlight } from '../../lib/annotations/types'

  // iOS Safari refuses canvases above ~16.7M pixels; stay under it.
  const MAX_CANVAS_PIXELS = 16_000_000

  interface Props {
    pdf: PDFDocumentProxy
    /** 0-based page index. */
    index: number
    scale: number
    visible: boolean
    /** Page view box and rotation; a guess (page 1's) until this page is loaded. */
    view: Rect
    rotation: number
    highlights: Highlight[]
    onInfo: (index: number, view: Rect, rotation: number) => void
    onRendered: (index: number) => void
  }

  let { pdf, index, scale, visible, view, rotation, highlights, onInfo, onRendered }: Props = $props()

  let canvasHost: HTMLDivElement
  let textHost: HTMLDivElement

  const transform = $derived(viewportTransform(view, scale, rotation))
  const size = $derived.by(() => {
    const [x0, y0, x1, y1] = view
    const w = (x1 - x0) * scale
    const h = (y1 - y0) * scale
    return rotation % 180 === 0 ? { w, h } : { w: h, h: w }
  })

  const boxes = $derived(
    highlights.flatMap((h) =>
      h.anchors
        .filter((a) => a.page === index)
        .flatMap((a) => a.rects.map((r) => ({ id: h.id, color: colorHex(h.color), rect: pdfToScreenRect(transform, r) }))),
    ),
  )

  $effect(() => {
    if (!visible) return
    const currentScale = scale
    let cancelled = false
    let renderTask: RenderTask | null = null
    let textLayer: TextLayer | null = null
    let canvas: HTMLCanvasElement | null = null

    ;(async () => {
      const page = await pdf.getPage(index + 1)
      if (cancelled) return
      onInfo(index, page.view as Rect, page.rotate)
      const viewport = page.getViewport({ scale: currentScale })

      // Render into a fresh canvas and swap it in when done, so zooming never flashes blank.
      canvas = document.createElement('canvas')
      let ratio = window.devicePixelRatio || 1
      ratio = Math.min(ratio, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)))
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      renderTask = page.render({
        canvas,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      })
      try {
        await renderTask.promise
      } catch {
        return // cancelled
      }
      if (cancelled) return
      canvasHost.replaceChildren(canvas)
      onRendered(index)

      textHost.replaceChildren()
      textLayer = new TextLayer({ textContentSource: page.streamTextContent(), container: textHost, viewport })
      await textLayer.render().catch(() => {})
    })()

    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayer?.cancel()
    }
  })

  // Free memory for pages that scrolled far away.
  $effect(() => {
    if (visible) return
    for (const c of canvasHost.querySelectorAll('canvas')) {
      c.width = 0
      c.height = 0
    }
    canvasHost.replaceChildren()
    textHost.replaceChildren()
  })
</script>

<div
  class="page"
  data-page={index}
  style:width="{size.w}px"
  style:height="{size.h}px"
  style:--scale-factor={scale}
>
  <!-- Canvas and highlights share a wrapper so Focus mode can recolour both together without touching the text layer. -->
  <div class="page-art">
  <div class="canvas-host" bind:this={canvasHost}></div>
  <div class="highlight-layer" aria-hidden="true">
    {#each boxes as b, i (b.id + ':' + i)}
      <div
        class="hl"
        data-highlight={b.id}
        style:left="{b.rect[0]}px"
        style:top="{b.rect[1]}px"
        style:width="{b.rect[2] - b.rect[0]}px"
        style:height="{b.rect[3] - b.rect[1]}px"
        style:background={b.color}
      ></div>
    {/each}
  </div>
  </div>
  <div class="textLayer" bind:this={textHost}></div>
  {#if !visible}<span class="page-label">{index + 1}</span>{/if}
</div>

<style>
  .page {
    position: relative;
    margin: 0 auto 24px;
    background: white;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: var(--page-shadow);
    --user-unit: 1;
    --total-scale-factor: calc(var(--scale-factor) * var(--user-unit));
  }
  .page-art,
  .canvas-host {
    position: absolute;
    inset: 0;
  }
  .highlight-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    mix-blend-mode: multiply;
  }
  .hl {
    position: absolute;
    border-radius: 2px;
  }
  .page-label {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: rgb(29 35 33 / 0.25);
    font-size: 14px;
  }
</style>
