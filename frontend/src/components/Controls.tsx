import { Slider } from '@base-ui/react/slider'
import { Button } from '@cloudflare/kumo/components/button'
import { DatePicker } from '@cloudflare/kumo/components/date-picker'
import { Input } from '@cloudflare/kumo/components/input'
import { Popover } from '@cloudflare/kumo/components/popover'
import { CalendarDotsIcon } from '@phosphor-icons/react'
import { type ReactNode, useEffect, useId, useState } from 'react'
import { StepButton } from '~/components/Shell'
import { minuteLabel } from '~/lib/time'

// The calendar works in local dates; our days are UTC dates. Convert by parts so no timezone shifts the day.
const toLocal = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const label = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

/** Previous / calendar / next for one computed day. `dates` is the computed range, in order. */
export function DayField({
  dates,
  index,
  onSelect,
  grow = false,
}: {
  dates: string[]
  index: number
  onSelect: (i: number) => void
  grow?: boolean
}) {
  const [open, setOpen] = useState(false)
  const date = dates[index] ?? ''
  const first = dates[0]
  const last = dates.at(-1)
  return (
    <div className="flex gap-1.5">
      <StepButton label="Previous day" onClick={() => onSelect(index - 1)} disabled={index === 0} dir={-1} />
      <Popover open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={
            <Button variant="secondary" icon={CalendarDotsIcon} className={`tabular justify-start ${grow ? 'min-w-0 flex-1' : ''}`} />
          }
        >
          {date ? label(date) : '…'}
        </Popover.Trigger>
        <Popover.Content align="start" className="p-3">
          {first && last && date && (
            <DatePicker
              mode="single"
              required
              selected={toLocal(date)}
              defaultMonth={toLocal(date)}
              startMonth={toLocal(first)}
              endMonth={toLocal(last)}
              disabled={[{ before: toLocal(first) }, { after: toLocal(last) }]}
              onChange={(d) => {
                const i = dates.indexOf(toIso(d))
                if (i >= 0) onSelect(i)
                setOpen(false)
              }}
            />
          )}
        </Popover.Content>
      </Popover>
      <StepButton label="Next day" onClick={() => onSelect(index + 1)} disabled={index === dates.length - 1} dir={1} />
    </div>
  )
}

/**
 * Time of day in UTC minutes. Base UI directly, styled like Kumo's slider:
 * Kumo's own Slider formats values with Intl.NumberFormat, which cannot say "14:30".
 */
export function TimeSlider({
  value,
  onChange,
  step = 10,
  inline = false,
}: {
  value: number
  onChange: (minute: number) => void
  step?: number
  /** One row for the dock: the time sits left of the track, the label is screen-reader only. */
  inline?: boolean
}) {
  return (
    <Slider.Root
      value={value}
      min={0}
      max={1440 - step}
      step={step}
      onValueChange={(v) => onChange(Array.isArray(v) ? (v[0] ?? 0) : (v as number))}
      className={inline ? 'flex min-w-[15rem] flex-1 items-center gap-3 px-2' : 'grid gap-2'}
    >
      {inline ? (
        <>
          <Slider.Label className="sr-only">Time (UTC)</Slider.Label>
          <span className="readout shrink-0 text-base whitespace-nowrap">{minuteLabel(value)} UTC</span>
        </>
      ) : (
        <div className="flex justify-between text-base">
          <Slider.Label className="font-medium text-ink">Time</Slider.Label>
          <span className="tabular text-ink-muted">{minuteLabel(value)} UTC</span>
        </div>
      )}
      <Slider.Control
        className={`flex h-6 cursor-pointer touch-none items-center ${inline ? 'min-w-32 flex-1 pointer-coarse:-my-[3px] pointer-coarse:h-[30px]' : 'pointer-coarse:-my-2.5 pointer-coarse:h-11'}`}
      >
        <Slider.Track className="relative h-1.5 w-full rounded-full bg-kumo-fill">
          <Slider.Indicator className="rounded-full bg-brand" />
          <Slider.Thumb
            getAriaValueText={(_, v) => `${minuteLabel(v)} UTC`}
            className="size-4 rounded-full bg-kumo-overlay shadow-sm ring ring-kumo-line outline-none has-focus-visible:ring-2 has-focus-visible:ring-kumo-focus"
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  )
}

/**
 * The floating control bar: pinned to the bottom of the viewport while the page scrolls.
 * Radius 12 = the 6 px controls inside + 6 px padding, so the corners stay concentric.
 */
export function Dock({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="pointer-events-none sticky bottom-4 z-(--z-sticky) flex justify-center px-4">
      <div
        role="group"
        aria-label={label}
        className="dock pointer-events-auto flex w-full max-w-4xl flex-wrap items-center gap-1.5 rounded-[12px] border border-transparent bg-surface-raised p-[5px] shadow-[0_0_0_1px_var(--color-line-strong),0_16px_40px_light-dark(rgb(0_0_0/0.14),rgb(0_0_0/0.45))]"
      >
        {children}
      </div>
    </div>
  )
}

export function DockDivider() {
  return <span aria-hidden className="mx-1 hidden h-7 w-px bg-line-strong sm:block" />
}

type FieldRange = { min: number; max: number; optional?: boolean }

/** The number typed, `undefined` for a blank optional field, or `null` when the text cannot be applied. */
export function parseField(text: string, { min, max, optional }: FieldRange) {
  if (text.trim() === '') return optional ? undefined : null
  const v = Number(text)
  return Number.isFinite(v) && v >= min && v <= max ? v : null
}

/** What the box shows is what the results use: a value that cannot be applied says so, and is dropped on blur. */
export function NumberField({
  label,
  value,
  min,
  max,
  optional,
  wide = false,
  onCommit,
}: { label: string; value: number | undefined; min: number; max: number; wide?: boolean } & (
  | { optional: true; onCommit: (v: number | undefined) => void }
  | { optional?: false; onCommit: (v: number) => void }
)) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => setDraft(value == null ? '' : String(value)), [value])
  const messageId = useId()
  const invalid = parseField(draft, { min, max, optional }) === null
  return (
    <div className={`relative ${wide ? 'w-full' : 'w-40'}`}>
      <Input
        type="number"
        inputMode="decimal"
        label={label}
        min={min}
        max={max}
        value={draft}
        // Kumo's `error` prop puts its message in the layout flow; ours floats below, so a bad value never shifts the fields around it.
        className={`tabular ${invalid ? '!ring-kumo-danger focus:ring-kumo-danger/50' : ''}`}
        aria-invalid={invalid}
        aria-describedby={invalid ? messageId : undefined}
        onChange={(e) => {
          const text = e.target.value
          setDraft(text)
          const v = parseField(text, { min, max, optional })
          if (optional) {
            if (v !== null) onCommit(v)
          } else if (v != null) onCommit(v)
        }}
        onBlur={() => {
          if (invalid) setDraft(value == null ? '' : String(value))
        }}
      />
      {invalid && (
        <p id={messageId} role="alert" className="absolute top-full mt-1 text-xs whitespace-nowrap text-now">
          Enter {min} to {max}.{value != null && ` Using ${value}.`}
        </p>
      )}
    </div>
  )
}
