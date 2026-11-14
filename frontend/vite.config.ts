import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import sites from './src/data/generated/sites.json'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Terrain heightmaps for the 3D island ship as raw Int16 files.
  assetsInclude: ['**/*.bin'],
  plugins: [
    tailwindcss(),
    // Static output only: every page is pre-rendered, no server at runtime (ADR-0001).
    tanstackStart({
      prerender: { enabled: true, crawlLinks: true, failOnError: true },
      // The full 3D view is linked only from client-rendered UI, so the crawler cannot find it: list one page per site.
      pages: [
        ...sites.flatMap(({ id }) => [{ path: `/explore/${id}` }, { path: `/analyze/${id}` }]),
        ...['mast', 'relay', 'rover'].map((piece) => ({ path: `/analyze/scenario/${piece}` })),
      ],
    }),
    viteReact(),
  ],
})
