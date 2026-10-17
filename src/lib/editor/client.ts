// Promise wrapper around the MuPDF worker. The worker (and its WebAssembly) is created on first use.
import type { EditRequest, EditResponse, LineInfo } from './protocol'

type Body<T> = T extends unknown ? Omit<T, 'id'> : never

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, (res: EditResponse) => void>()

function call(req: Body<EditRequest>, transfer: Transferable[] = []): Promise<EditResponse> {
  if (!worker) {
    worker = new Worker(new URL('../../workers/mupdf.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (ev: MessageEvent<EditResponse>) => {
      pending.get(ev.data.id)?.(ev.data)
      pending.delete(ev.data.id)
    }
    // A worker that fails to load (e.g. WebAssembly blocked) must not leave callers hanging.
    worker.onerror = (ev) => {
      ev.preventDefault()
      const error = ev.message || 'Editor failed to load'
      for (const [id, settle] of pending) settle({ id, ok: false, error })
      pending.clear()
      worker?.terminate()
      worker = null
    }
  }
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, (res) => (res.ok ? resolve(res) : reject(new Error(res.error))))
    worker!.postMessage({ ...req, id }, transfer)
  })
}

export async function openForEditing(bytes: Uint8Array): Promise<void> {
  const copy = bytes.slice().buffer
  await call({ type: 'open', data: copy }, [copy])
}

export async function lineAt(page: number, x: number, y: number): Promise<LineInfo | null> {
  const res = (await call({ type: 'lineAt', page, x, y })) as Extract<EditResponse, { ok: true }>
  return res.line ?? null
}

export async function replaceText(page: number, x: number, y: number, newText: string) {
  const res = (await call({ type: 'replace', page, x, y, newText })) as Extract<EditResponse, { ok: true }>
  return { bytes: res.bytes!, fontUsed: res.fontUsed!, unsupportedChars: res.unsupportedChars ?? [] }
}
