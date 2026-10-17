import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  // mupdf ships ESM + WebAssembly with top-level await; don't pre-bundle it.
  optimizeDeps: { exclude: ['mupdf'] },
  worker: { format: 'es' },
  build: { target: 'esnext' },
  test: { include: ['src/**/*.test.ts'] },
})
