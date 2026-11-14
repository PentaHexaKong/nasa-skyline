import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const entry = fileURLToPath(new URL('../src/lib/scientificContract.ts', import.meta.url))
const output = fileURLToPath(new URL('../public/scientificClient', import.meta.url))

await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: output,
    emptyOutDir: true,
    lib: { entry, formats: ['es'], fileName: () => 'scientificContractClient.js' },
    minify: true,
  },
})
