import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Builds the main, sandboxed preload, and renderer entry points. */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(__dirname, 'src/desktop/main/index.ts'),
        output: {
          entryFileNames: 'index.js',
          format: 'cjs',
        },
      },
    },
  },
  preload: {
    build: {
      // Sandboxed preloads can require only `electron`; bundle every other dependency.
      externalizeDeps: false,
      outDir: 'out/preload',
      rollupOptions: {
        external: ['electron'],
        input: resolve(__dirname, 'src/desktop/preload/index.ts'),
        output: {
          entryFileNames: 'index.js',
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    root: 'src/desktop/renderer',
    plugins: [react(), tailwindcss()],
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'src/desktop/renderer/index.html'),
      },
    },
  },
})
