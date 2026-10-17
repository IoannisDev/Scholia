import type { Rect } from '../pdf/coords'

export interface LineInfo {
  text: string
  /** PDF user space. */
  bbox: Rect
  size: number
  fontName: string
}

type Req<T extends string, P = {}> = { id: number; type: T } & P
export type EditRequest =
  | Req<'open', { data: ArrayBuffer }>
  | Req<'lineAt', { page: number; x: number; y: number }>
  | Req<'replace', { page: number; x: number; y: number; newText: string }>

export type EditResponse =
  | { id: number; ok: false; error: string }
  | { id: number; ok: true; line?: LineInfo | null; bytes?: Uint8Array; fontUsed?: string; unsupportedChars?: string[] }
