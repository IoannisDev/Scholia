// The library: every PDF the reader has opened, kept in IndexedDB so it can be reopened later.
// Metadata and file bytes live in separate stores, so listing the shelf never loads whole PDFs.

export interface Book {
  /** SHA-256 of the original file. */
  id: string
  title: string
  author: string
  fileName: string
  numPages: number
  /** 0-based page the reader was last on. */
  page: number
  addedAt: number
  openedAt: number
}

const DB = 'scholia'
const BOOKS = 'books'
const FILES = 'files'

let db: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(BOOKS, { keyPath: 'id' })
      req.result.createObjectStore(FILES)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return db
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await open()).transaction(store, mode)
  const req = fn(tx.objectStore(store))
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req.result)
    tx.onerror = () => reject(tx.error)
  })
}

export async function listBooks(): Promise<Book[]> {
  const books = await run<Book[]>(BOOKS, 'readonly', (s) => s.getAll())
  return books.sort((a, b) => b.openedAt - a.openedAt)
}

export function getBook(id: string): Promise<Book | undefined> {
  return run(BOOKS, 'readonly', (s) => s.get(id))
}

export async function putBook(book: Book, bytes?: Uint8Array): Promise<void> {
  await run(BOOKS, 'readwrite', (s) => s.put(book))
  if (bytes) await run(FILES, 'readwrite', (s) => s.put(bytes, book.id))
}

export async function updateBook(id: string, patch: Partial<Book>): Promise<void> {
  const book = await getBook(id)
  if (book) await run(BOOKS, 'readwrite', (s) => s.put({ ...book, ...patch }))
}

/** Deletes the stored copy of a book and its record. */
export async function removeBook(id: string): Promise<void> {
  const tx = (await open()).transaction([BOOKS, FILES], 'readwrite')
  tx.objectStore(BOOKS).delete(id)
  tx.objectStore(FILES).delete(id)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function getFile(id: string): Promise<Uint8Array | undefined> {
  return run(FILES, 'readonly', (s) => s.get(id))
}

export type Shelf = 'all' | 'reading' | 'unread' | 'finished'

export function shelfOf(book: Book): Exclude<Shelf, 'all'> {
  if (book.page === 0) return 'unread'
  return book.page >= book.numPages - 1 ? 'finished' : 'reading'
}

export function progress(book: Book): number {
  return book.numPages ? (book.page + 1) / book.numPages : 0
}
