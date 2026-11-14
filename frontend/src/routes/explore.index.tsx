import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { forgiving } from '~/lib/useSiteView'

/**
 * Explore and Understand are one page at `/`. The true-scale scene that lived here is now its
 * `#space` chapter; old links keep their view, moment and fly-back site.
 */
export const Route = createFileRoute('/explore/')({
  validateSearch: z.object({
    from: forgiving(z.string()),
    day: forgiving(z.iso.date()),
    t: forgiving(z.coerce.number().int().min(0).max(1439)),
    view: forgiving(z.enum(['moon', 'earth', 'pair', 'orbit', 'fromEarth', 'sun'])),
    scale: forgiving(z.enum(['closer'])),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/', search, hash: 'space', replace: true })
  },
})
