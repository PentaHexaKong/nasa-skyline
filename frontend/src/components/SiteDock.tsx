import { Button } from '@cloudflare/kumo/components/button'
import { Select } from '@cloudflare/kumo/components/select'
import { PauseIcon, PlayIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { DayField, Dock, DockDivider, TimeSlider } from '~/components/Controls'
import { SITES, type Summary } from '~/lib/data'
import { type SiteSearch, type SiteView, SPEEDS, type Speed } from '~/lib/useSiteView'

/** The floating site, day, play and time bar; `action` is the page's primary button. */
export function SiteDock({
  data,
  view,
  go,
  onSite,
  action,
  siteOnPhone = false,
  sites = SITES,
}: {
  data: Summary
  view: SiteView
  go: (s: SiteSearch) => void
  onSite: (id: string) => void
  action?: ReactNode
  siteOnPhone?: boolean
  /** The sites the picker offers; the 3D view passes only those with terrain. */
  sites?: typeof SITES
}) {
  const { play, tracks, minute, index, selectDay } = view
  return (
    <Dock label="Site, day and time">
      <div className={`${siteOnPhone ? 'flex w-full sm:w-auto' : 'hidden sm:flex'} items-center gap-1.5`}>
        <Select
          aria-label="Site"
          value={data.site.id}
          items={Object.fromEntries(sites.map((site) => [site.id, site.name.split(',')[0] ?? site.name]))}
          onValueChange={(id) => id && onSite(id as string)}
          className={siteOnPhone ? 'min-w-0 flex-1 sm:w-40 sm:flex-none' : 'w-40'}
        />
        <DockDivider />
      </div>
      <DayField dates={data.days.map((d) => d.date)} index={index} onSelect={selectDay} />
      <DockDivider />
      <Button
        variant="ghost"
        shape="square"
        aria-label={play.playing ? 'Pause' : 'Play'}
        aria-pressed={play.playing}
        onClick={play.toggle}
        disabled={!tracks}
      >
        {play.playing ? <PauseIcon weight="fill" aria-hidden /> : <PlayIcon weight="fill" aria-hidden />}
      </Button>
      <Select
        aria-label="Playback speed"
        value={String(play.speed)}
        items={Object.fromEntries(Object.entries(SPEEDS))}
        onValueChange={(v) => v && play.setSpeed(Number(v) as Speed)}
        className="w-24 shrink-0 font-mono"
      />
      <TimeSlider
        inline
        value={minute}
        onChange={(v) => {
          play.stop()
          go({ t: v })
        }}
      />
      {action}
    </Dock>
  )
}
