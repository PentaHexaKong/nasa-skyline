import { SolarPanelIcon } from '@phosphor-icons/react'
import type { ScenarioPiece } from '~/lib/scenarios'

/** Outline tool identifiers; colour never indicates a computed status. */
export function ScenarioIcon({ piece }: { piece: ScenarioPiece }) {
  return (
    <span aria-hidden="true" className="scenario-choice-icon" data-piece={piece}>
      <svg viewBox="0 0 48 48" fill="none" className="scenario-choice-brackets">
        <path d="M3 12V3h9M36 3h9v9M45 36v9h-9M12 45H3v-9" />
      </svg>
      {piece === 'mast' ? (
        <SolarPanelIcon size={30} weight="regular" />
      ) : (
        <svg
          viewBox="0 0 32 32"
          width="30"
          height="30"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {piece === 'relay' ? (
            <>
              <path d="m12 13 6-6 7 7-6 6zM10 15l-6 6 5 5 6-6M21 5l5-4 5 5-4 5M7 18l5 5M24 3l5 5M20 19l3 3m-4 1a5 5 0 0 0 8-4" />
              <path d="M3 12a13 13 0 0 1 9-9M20 29a13 13 0 0 0 9-9" strokeDasharray="2 3" />
            </>
          ) : (
            <>
              <path d="M5 18h19l3 4H5zM8 16l-2-5 7-3 3 7M8 12l6-2M11 9l2 6M19 18V9m-3 0V5h7v4zM5 22v2m22-2v2M12 25h2m6 0h2" />
              <circle cx="8" cy="25" r="3" />
              <circle cx="17" cy="25" r="3" />
              <circle cx="25" cy="25" r="3" />
            </>
          )}
        </svg>
      )}
    </span>
  )
}
