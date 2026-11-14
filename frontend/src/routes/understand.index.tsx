import { createFileRoute, redirect } from '@tanstack/react-router'

/** The lesson list is the `#lessons` chapter of `/` now that Explore and Understand are one page. */
export const Route = createFileRoute('/understand/')({
  beforeLoad: () => {
    throw redirect({ to: '/', hash: 'lessons', replace: true })
  },
})
