// Writes the feed schemas in src/lib/feed-schemas.ts to contracts/feeds/ as JSON Schema, for the Python pipeline.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { FEED_SCHEMAS, PowerManifest, RelayFeedV1, RelayManifest } from '../src/lib/feed-schemas.ts'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'contracts', 'feeds')
mkdirSync(out, { recursive: true })
for (const [name, schema] of Object.entries(FEED_SCHEMAS)) {
  writeFileSync(join(out, `${name}.schema.json`), `${JSON.stringify(z.toJSONSchema(schema, { io: 'input' }), null, 2)}\n`)
}
console.log(`contracts: ${Object.keys(FEED_SCHEMAS).join(', ')} -> contracts/feeds`)

writeFileSync(join(out, '..', 'powerManifest.schema.json'), `${JSON.stringify(z.toJSONSchema(PowerManifest, { io: 'input' }), null, 2)}\n`)

writeFileSync(join(out, '..', 'relayFeedV1.schema.json'), `${JSON.stringify(z.toJSONSchema(RelayFeedV1, { io: 'input' }), null, 2)}\n`)
writeFileSync(join(out, '..', 'relayManifest.schema.json'), `${JSON.stringify(z.toJSONSchema(RelayManifest, { io: 'input' }), null, 2)}\n`)
