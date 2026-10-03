import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import config from './vite.config.ts'

export default defineConfig({
  ...config,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [
    ...(config.plugins ?? []),
    {
      name: 'webos-packaged-entry',
      generateBundle() {
        // Local webOS files have no JavaScript MIME type for ES module loading.
        this.emitFile({
          type: 'asset',
          fileName: 'index.html',
          source: readFileSync(new URL('./tv/index.html', import.meta.url), 'utf8'),
        })
      },
    },
  ],
  build: {
    ...config.build,
    outDir: process.env.LC_PLAY_TV_OUTPUT_DIR || 'dist-tv',
    lib: {
      entry: fileURLToPath(new URL('./src/main.tsx', import.meta.url)),
      name: 'LCPlay',
      formats: ['iife'],
      fileName: () => 'player.js',
      cssFileName: 'player',
    },
    cssCodeSplit: false,
  },
})
