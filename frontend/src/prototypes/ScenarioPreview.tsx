import { Button } from '@cloudflare/kumo/components/button'
import { ButtonGroup } from '@cloudflare/kumo/components/button-group'
import { lazy, Suspense, useState } from 'react'
import { MastPlan, MastSection, MastTrade } from '~/components/addons/mastViews'
import { LegacyMastFeed, RelayFeed } from '~/lib/feed-schemas'
import type { ScenarioPiece } from '~/lib/scenarios'
import mastFixture from '../../fixtures/feeds/mast/connecting-ridge.json'
import relayFixture from '../../fixtures/feeds/relay/connecting-ridge.json'
import { RelayDial, RelayFill, RelayGaps } from './relay'
import { RoverCorridor, RoverDays, RoverReach } from './rover'

const In3D = lazy(() => import('./in3d'))
const mast = LegacyMastFeed.parse(mastFixture)
const relay = RelayFeed.parse(relayFixture)
const NAMES = {
  mast: ['Site plan', 'Section', 'Trade-off', 'In 3D'],
  relay: ['Ladder', 'Dial', 'Gap ledger', 'In 3D'],
  rover: ['Reach map', 'Days out', 'Corridor', 'In 3D'],
}

/** Reuse the team's visual experiments with app-native controls. Imported in development only. */
export default function ScenarioPreview({ piece }: { piece: ScenarioPiece }) {
  const [variant, setVariant] = useState(0)
  const views = {
    mast: [<MastPlan key="plan" data={mast} />, <MastSection key="section" data={mast} />, <MastTrade key="trade" data={mast} />],
    relay: [<RelayFill key="ladder" data={relay} />, <RelayDial key="dial" data={relay} />, <RelayGaps key="gaps" data={relay} />],
    rover: [<RoverReach key="reach" />, <RoverDays key="days" />, <RoverCorridor key="corridor" />],
  }
  return (
    <div className="grid gap-6">
      <div className="overflow-x-auto pb-1">
        <ButtonGroup aria-label="Preview view">
          {NAMES[piece].map((name, i) => (
            <Button key={name} variant={i === variant ? 'primary' : 'secondary'} aria-pressed={i === variant} onClick={() => setVariant(i)}>
              {name}
            </Button>
          ))}
        </ButtonGroup>
      </div>
      {variant === 3 ? (
        <Suspense fallback={<p aria-busy="true">Loading 3D preview…</p>}>
          <In3D piece={piece} mast={mast} />
        </Suspense>
      ) : (
        views[piece][variant]
      )}
    </div>
  )
}
