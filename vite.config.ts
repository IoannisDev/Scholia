import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

// Content Security Policy for the built app. Nothing may be fetched from, or sent to, another origin,
// so PDFs cannot leave the device even if a bug let a malicious file inject script.
// 'wasm-unsafe-eval' lets MuPDF compile its WebAssembly; inline styles are how Svelte applies style: directives.
// Not applied in dev, where Vite injects inline scripts and a websocket for hot reload.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const csp = (): Plugin => ({
  name: 'scholia-csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
})

export default defineConfig({
  plugins: [tailwindcss(), svelte(), csp()],
  // mupdf ships ESM + WebAssembly with top-level await; don't pre-bundle it.
  optimizeDeps: { exclude: ['mupdf'] },
  worker: { format: 'es' },
  build: { target: 'esnext' },
  test: { include: ['src/**/*.test.ts'] },
})
