import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import * as mupdf from 'mupdf'

const shots = process.env.PW_SHOTS

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` })
}

async function openSample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sample', exact: true }).click()
  await expect(page.locator('[data-page="0"] canvas')).toBeVisible()
  await expect(page.locator('[data-page="0"] .textLayer span').first()).toBeAttached()
}

/** Each highlight box should sit on top of selected text: its centre must fall inside a text span. */
async function boxesOnText(page: Page) {
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll<HTMLElement>('.hl')]
    return boxes.map((b) => {
      const r = b.getBoundingClientRect()
      const cx = (r.left + r.right) / 2
      const cy = (r.top + r.bottom) / 2
      const pageEl = b.closest('[data-page]')!
      return [...pageEl.querySelectorAll<HTMLElement>('.textLayer span')].some((s) => {
        const q = s.getBoundingClientRect()
        return cy >= q.top && cy <= q.bottom && q.right >= r.left && q.left <= r.right && cx > 0
      })
    })
  })
}

test('Spike A: highlight across a page break survives zoom and reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openSample(page)

  // Scroll so the bottom of page 1 and top of page 2 are both on screen, then drag-select across.
  const p0 = page.locator('[data-page="0"]')
  const p1 = page.locator('[data-page="1"]')
  await page.locator('.scroller').evaluate((el) => (el.scrollTop = (el.querySelector('[data-page="1"]') as HTMLElement).offsetTop - 500))
  await expect(p1.locator('.textLayer span').first()).toBeAttached()
  const last = p0.locator('.textLayer span').filter({ hasText: /\S/ }).last()
  const first = p1.locator('.textLayer span').filter({ hasText: /\S/ }).first()
  const a = (await last.boundingBox())!
  const b = (await first.boundingBox())!
  await page.mouse.move(a.x + 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect(page.locator('.toolbar')).toBeVisible()
  await shot(page, 'a1-selection-toolbar')
  await page.keyboard.press('1')

  await expect(page.locator('.hl-item')).toHaveCount(1)
  await expect(page.locator('.hl-item .meta')).toHaveText('Page 1–2')
  await expect(p0.locator('.hl')).not.toHaveCount(0)
  await expect(p1.locator('.hl')).not.toHaveCount(0)
  expect((await boxesOnText(page)).every(Boolean)).toBe(true)
  await shot(page, 'a2-highlight-125')

  for (const label of ['Zoom out', 'Zoom out', 'Zoom out']) await page.getByRole('button', { name: label }).click()
  await expect(page.locator('.num')).toHaveText('50%')
  await page.waitForTimeout(400)
  expect((await boxesOnText(page)).every(Boolean)).toBe(true)
  await shot(page, 'a3-highlight-50')

  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.locator('.num')).toHaveText('200%')
  await page.locator('.scroller').evaluate((el) => (el.scrollTop = (el.querySelector('[data-page="1"]') as HTMLElement).offsetTop - 400))
  await page.waitForTimeout(600)
  expect((await boxesOnText(page)).every(Boolean)).toBe(true)
  await shot(page, 'a4-highlight-200')

  await page.reload()
  await page.getByRole('button', { name: 'Sample', exact: true }).click()
  await expect(page.locator('.hl-item')).toHaveCount(1)
  await expect(p0.locator('.hl')).not.toHaveCount(0)
  expect(errors).toEqual([])
})

test('Spike B: edit a line of PDF text in the browser', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openSample(page)
  await page.evaluate(() => localStorage.clear())
  await page.keyboard.press('e')
  await page.locator('.scroller').evaluate((el) => (el.scrollTop = (el.querySelector('[data-page="3"]') as HTMLElement).offsetTop))
  const target = page.locator('[data-page="3"] .textLayer span', { hasText: 'quick brown fox' })
  await target.click()
  const input = page.locator('.edit-input')
  await expect(input).toHaveValue(/The quick brown fox/)
  await shot(page, 'b1-edit-box')
  await input.fill('Scholia rewrote this line in the browser.')
  await input.press('Enter')
  await expect(page.locator('.status')).toContainText('Saved edit with Helvetica')
  const layer = page.locator('[data-page="3"] .textLayer')
  await expect(layer).toContainText('Scholia rewrote this line in the browser.')
  await expect(layer).not.toContainText('quick brown fox')
  await expect(layer).toContainText('Line above the target stays untouched.')
  await expect(layer).toContainText('Line below the target stays untouched.')
  await page.keyboard.press('e')
  await shot(page, 'b2-edited')

  // The downloaded file itself must contain the edit (checked with an independent parser).
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()])
  expect(download.suggestedFilename()).toBe('sample-edited.pdf')
  const saved = new mupdf.PDFDocument(readFileSync((await download.path())!))
  const savedText = saved.loadPage(3).toStructuredText('preserve-whitespace').asText()
  expect(savedText).toContain('Scholia rewrote this line in the browser.')
  expect(savedText).not.toContain('quick brown fox')
  expect(savedText).toContain('Line above the target stays untouched.')

  await page.getByRole('button', { name: 'Undo edit' }).click()
  await expect(layer).toContainText('quick brown fox')
  expect(errors).toEqual([])
})

test('600-page document: fast first page, bounded canvases while scrolling', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '600 pages' }).click()
  await expect(page.locator('.perf')).toContainText('first page in')
  const ms = Number((await page.locator('.perf').innerText()).match(/first page in (\d+) ms/)![1])
  console.log(`600-page first paint: ${ms} ms`)
  expect(ms).toBeLessThan(1000)

  const scroller = page.locator('.scroller')
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    await scroller.evaluate((el, f) => (el.scrollTop = el.scrollHeight * f), frac)
    await page.waitForTimeout(250)
  }
  await expect(page.locator('.page-indicator')).toHaveText('600 / 600')
  await expect(page.locator('[data-page="599"] canvas')).toBeVisible()
  const canvases = await page.locator('canvas').count()
  console.log(`canvases in DOM after scrolling: ${canvases}`)
  expect(canvases).toBeLessThanOrEqual(12)
  await shot(page, 'c1-long-end')
})

test('Table of contents: jump to a section and follow the reading position', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: '600 pages' }).click()
  await expect(page.locator('[data-page="0"] canvas')).toBeVisible()

  await page.getByRole('button', { name: 'Contents', exact: true }).click()
  const toc = page.getByRole('navigation', { name: 'Contents' })
  await expect(toc.getByRole('button', { name: /^Part 12/ })).toBeVisible()
  await expect(toc.locator('[aria-current="location"]')).toContainText('Section 1.1')

  // Sections are collapsed until their part is opened.
  await expect(toc.getByRole('button', { name: /^Section 3\.4/ })).toHaveCount(0)
  await toc.getByRole('button', { name: 'Expand Part 3' }).click()
  await toc.getByRole('button', { name: /^Section 3\.4/ }).click()
  await expect(page.locator('.page-indicator')).toHaveText('131 / 600')
  await expect(toc.locator('[aria-current="location"]')).toContainText('Section 3.4')
  await shot(page, 'd1-contents')

  // Scrolling elsewhere moves the current entry and opens its part.
  await page.locator('.scroller').evaluate((el) => (el.scrollTop = (el.querySelector('[data-page="455"]') as HTMLElement).offsetTop))
  await expect(toc.locator('[aria-current="location"]')).toContainText('Section 10.1')

  await page.keyboard.press('t')
  await expect(toc).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Table of contents: a short outline starts fully open', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sample', exact: true }).click()
  await page.getByRole('button', { name: 'Contents', exact: true }).click()
  const toc = page.getByRole('navigation', { name: 'Contents' })
  await expect(toc.getByRole('button', { name: /^Across the page break/ })).toBeVisible()
  await toc.getByRole('button', { name: /^Edit target page/ }).click()
  await expect(page.locator('.page-indicator')).toHaveText('4 / 4')
})

test('Library: removing a book deletes its stored copy, highlights and notes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sample', exact: true }).click()
  await page.locator('[data-page="0"] .textLayer span').filter({ hasText: /\S/ }).nth(1).click({ clickCount: 3 })
  await page.keyboard.press('1')
  await page.locator('#quick-note').fill('A page note.')
  await page.getByRole('button', { name: 'Save note' }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).first().click()

  const remove = page.getByRole('button', { name: 'Remove Scholia sample from library' })
  page.once('dialog', (d) => d.dismiss())
  await remove.click()
  await expect(remove).toBeVisible() // cancelling keeps it

  page.once('dialog', (d) => d.accept())
  await remove.click()
  await expect(page.getByText('Your shelf is empty')).toBeVisible()
  const left = await page.evaluate(async () => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('scholia:'))
    const db = await new Promise<IDBDatabase>((r) => (indexedDB.open('scholia').onsuccess = (e) => r((e.target as IDBOpenDBRequest).result)))
    const count = (store: string) =>
      new Promise<number>((r) => (db.transaction(store).objectStore(store).count().onsuccess = (e) => r((e.target as IDBRequest<number>).result)))
    return { keys, books: await count('books'), files: await count('files') }
  })
  expect(left).toEqual({ keys: [], books: 0, files: 0 })
})
