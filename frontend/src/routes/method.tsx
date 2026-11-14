import { createFileRoute, Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Eyebrow, Footer, Shell } from '~/components/Shell'
import { loadSummary, readerReference, SITES } from '~/lib/data'
import { shortDate } from '~/lib/time'

export const Route = createFileRoute('/method')({
  loader: () => Promise.all(SITES.map((s) => loadSummary(s.id))),
  head: () => ({ meta: [{ title: 'Method · Skyline' }] }),
  component: MethodPage,
})

/** The pipeline's conventions worth defining for a reader, in reading order, with the word the app uses for each. */
const DEFINITIONS = [
  ['direct_sun', 'Direct sun'],
  ['daylight', 'Daylight'],
  ['earth_visible', 'Earth in view'],
  ['earth_any', 'Any part of Earth'],
  ['elevation', 'Elevation'],
  ['azimuth', 'Azimuth'],
  ['time', 'Time'],
] as const

const sentence = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}${s.endsWith('.') ? '' : '.'}`

/**
 * The terrain bands the skyline was traced through, from the provenance: each band's range, grid, and the angle one
 * grid cell spans seen from its far end, which is how finely that band can place the ridge.
 */
function bands(dem: { [k: string]: unknown }[]) {
  let from = 0
  return dem.flatMap((d) => {
    const to = Number(d.range_km)
    const cell = Number(d.pixel_size_m)
    if (!Number.isFinite(to) || !Number.isFinite(cell)) return []
    const band = { role: String(d.role ?? to), from, to, cell, deg: (Math.atan(cell / (to * 1000)) * 180) / Math.PI }
    from = to
    return [band]
  })
}

const deg = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}°${v < 0 ? neg : pos}`

function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-16 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <Eyebrow pip>{eyebrow}</Eyebrow>
          <h2 id={`${id}-h`} className="text-2xl font-medium text-balance">
            {title}
          </h2>
          {intro && <p className="text-ink-muted text-pretty">{intro}</p>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  )
}

function MethodPage() {
  const all = Route.useLoaderData()
  const moon = all
  const ref = moon[0]
  if (!ref) throw new Error('No sites')
  const p = ref.params
  const steps = [
    [
      'Skyline',
      `From NASA LOLA terrain, the highest ground in every direction, every ${p.az_step_deg}° of azimuth, out to ${p.skyline_max_km} km.`,
    ],
    ['Sun and Earth', `Where the Sun and Earth stand in the site’s sky, from NASA JPL SPICE geometry, every ${p.step_min} min.`],
    [
      'Visibility',
      'How much of the Sun’s disc clears the ridge, with each edge timed to 1 second. Earth counts when its centre clears the ridge.',
    ],
    [
      'Ready ahead',
      `${p.days} days from ${shortDate(p.start)} ${p.start.slice(0, 4)} are computed in advance, so every view opens at once.`,
    ],
  ] as const

  return (
    <Shell>
      <main>
        <header className="mx-auto grid max-w-7xl gap-4 px-4 pt-10 pb-14 sm:px-6 lg:pt-16">
          <Eyebrow pip>Method</Eyebrow>
          <h1 className="max-w-[16ch] text-display font-medium text-balance">How we know.</h1>
          <p className="max-w-[56ch] text-lg leading-relaxed text-ink-muted text-pretty">
            Every number in Skyline is computed by our pipeline from NASA terrain and orbit data. Here is how, where it comes from, and what
            we don’t claim.
          </p>
        </header>

        <Section id="pipeline" eyebrow="Pipeline" title="How a number is made">
          <ol className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
            {steps.map(([title, body], i) => (
              <li key={title} className="grid content-start gap-2 border-t border-line-strong pt-4">
                <span className="eyebrow text-ink-faint">Step {String(i + 1).padStart(2, '0')}</span>
                <h3 className="font-semibold">{title}</h3>
                <p className="leading-relaxed text-ink-muted text-pretty">{body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          id="sites"
          eyebrow="Sites"
          title="Where the numbers come from"
          intro="Each site, the terrain it was computed on, and why it is here."
        >
          <ul className="grid border-t border-line">
            {moon.map((s) => (
              <li key={s.site.id} className="grid gap-1 border-b border-line py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <Link
                    to="/analyze/$siteId"
                    params={{ siteId: s.site.id }}
                    className="font-medium hover:underline hover:underline-offset-4"
                  >
                    {s.site.name}
                  </Link>
                  <span className="readout text-xs text-ink-faint">
                    {deg(s.site.lat_deg, 'N', 'S')} {s.site.lon_deg_east.toFixed(2)}°E
                  </span>
                </div>
                <p className="text-ink-muted text-pretty">{readerReference(s.site.reference)}</p>
                <p className="text-xs text-ink-faint">{s.provenance.dem_product}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="definitions"
          eyebrow="Definitions"
          title="What each word means"
          intro="The rules every chart and verdict uses, as the pipeline states them."
        >
          <dl className="grid max-w-[72ch] gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-[10rem_1fr]">
            {DEFINITIONS.map(([key, term]) =>
              ref.conventions[key] ? (
                <div key={key} className="contents">
                  <dt className="font-medium">{term}</dt>
                  <dd className="text-ink-muted text-pretty">{sentence(ref.conventions[key])}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </Section>

        <Section
          id="uncertainty"
          eyebrow="Uncertainty"
          title="How sharp the horizon is"
          intro={`The skyline is only as sharp as the terrain grid. One grid cell at the far end of each band spans this much of the sky. Shown for ${ref.site.name}; every site uses the same bands.`}
        >
          <div className="grid gap-8">
            <table className="w-full max-w-[44rem] text-left text-sm">
              <caption className="sr-only">Terrain grid by range and the angle one cell spans at the far end of each band</caption>
              <thead className="text-ink-faint">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-4 font-normal">
                    Range
                  </th>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    Terrain grid
                  </th>
                  <th scope="col" className="py-2 font-normal">
                    One cell spans
                  </th>
                </tr>
              </thead>
              <tbody className="readout">
                {bands(ref.provenance.dem).map((b) => (
                  <tr key={b.role} className="border-b border-line">
                    <td className="py-2 pr-4">
                      {b.from}–{b.to} km
                    </td>
                    <td className="py-2 pr-4">{b.cell} m</td>
                    <td className="py-2">{b.deg.toFixed(3)}°</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 pr-4" colSpan={2}>
                    Skyline sampled every
                  </td>
                  <td className="py-2">{p.az_step_deg}° of azimuth</td>
                </tr>
              </tbody>
            </table>
            <ul className="grid max-w-[62ch] list-disc gap-2 pl-5 text-ink-muted text-pretty marker:text-ink-faint">
              {ref.provenance.known_limits.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        </Section>

        <Section id="claims" eyebrow="Limits" title="What we don’t claim">
          <ul className="grid max-w-[62ch] gap-3 text-pretty">
            <li>
              Skyline shows <span className="font-medium">geometric opportunities</span>: when the Sun and Earth are in line of sight, under
              the stated rules. It does not show delivered power, a working radio link or guaranteed contact.
            </li>
            <li className="text-ink-muted">
              The terrain is good enough to compare sites and dates, not to promise the exact horizon at one spot. Boulders and features
              smaller than the terrain grid are not in it.
            </li>
            <li className="text-ink-muted">Mission profile thresholds are examples to start from, not requirements from any mission.</li>
            <li className="text-ink-muted">Times are UTC. Azimuth is measured clockwise from local north.</li>
          </ul>
        </Section>

        <Section id="credits" eyebrow="Credits" title="Data and imagery">
          <dl className="grid max-w-[72ch] gap-x-6 gap-y-3 sm:grid-cols-[10rem_1fr]">
            <dt className="font-medium">Terrain</dt>
            <dd className="text-ink-muted">{[...new Set(moon.map((s) => s.provenance.dem_product))].join('. ')}.</dd>
            <dt className="font-medium">Geometry</dt>
            <dd className="text-ink-muted">
              NASA JPL NAIF SPICE: <span className="readout text-xs">{ref.provenance.kernels.map((k) => k.file).join(', ')}</span>.
              Algorithm {ref.provenance.algorithm_version}.
            </dd>
            <dt className="font-medium">Space scene</dt>
            <dd className="text-ink-muted">
              Moon: NASA SVS CGI Moon Kit, relief exaggerated. Earth: NASA Blue Marble, colour-graded for display, Black Marble city lights
              and the Blue Marble cloud map, a 2002 composite, not any real day. Stars: NASA SVS Deep Star Maps 2020. Sun: NASA SDO.
            </dd>
          </dl>
        </Section>

        <Footer />
      </main>
    </Shell>
  )
}
