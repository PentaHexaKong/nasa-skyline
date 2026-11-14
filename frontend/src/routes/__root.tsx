import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import styles from '~/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Skyline' },
      { name: 'color-scheme', content: 'dark' },
      { name: 'theme-color', content: '#000' },
      {
        name: 'description',
        content: 'Compare sites and dates by sunlight and line of sight, drawn against each site’s real terrain horizon.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: styles },
      {
        rel: 'icon',
        href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23000'/%3E%3Cpath fill='%23fff' d='M33.3 55 32.6 55.9 32 56.8 31.3 57.6 30.7 58.3 30 58.9 29.2 59.4 28.4 59.8 27.6 60.1 26.6 60.2 25.7 60.1 24.8 59.8 23.9 59.3 23.1 58.7 22.3 57.9 21.6 57 21.1 56 20.6 54.8 20.2 53.6 19.9 52.3 19.6 51 19.4 49.5 19.2 48 19.1 46.4 19.1 44.8 19.1 43.1 19.2 41.4 19.3 39.6 19.5 37.8 19.8 36 20.1 34.1 20.4 32.3 20.8 30.4 21.3 28.6 21.8 26.7 22.4 24.9 22.9 23.2 23.6 21.4 24.3 19.7 25 18.1 25.7 16.5 26.5 15 27.3 13.6 28.1 12.2 28.9 10.9 29.8 9.7 30.7 8.6 31.6 7.6 32.5 6.7 33.4 5.9 34.4 5.3 35.4 4.7 36.4 4.3 37.4 4 38.4 3.8 39.5 3.9 40.5 4.1 41.4 4.6 42.3 5.2 43 5.9 43.5 6.7 44 7.6 44.3 8.6 44.6 9.7 44.8 10.8 44.9 12.1 44.9 13.3 44.8 14.7 44.7 16.1 44.6 17.6 44.5 19.1 44.3 17.6 44 16.1 43.7 14.8 43.3 13.6 42.9 12.5 42.4 11.5 42 10.6 41.5 9.9 41.1 9.3 40.6 8.8 40.2 8.5 39.9 8.3 39.6 8.2 39.4 8.1 39.1 8.1 38.9 8.2 38.6 8.3 38.2 8.5 37.8 8.8 37.3 9.2 36.8 9.8 36.2 10.4 35.6 11.1 35 12 34.4 12.9 33.8 14 33.1 15.1 32.5 16.4 31.9 17.7 31.3 19.1 30.7 20.5 30.1 22 29.5 23.6 29 25.2 28.5 26.8 28 28.5 27.5 30.2 27.1 31.9 26.7 33.6 26.4 35.3 26.1 37 25.8 38.6 25.6 40.3 25.4 41.9 25.2 43.4 25.1 44.9 25.1 46.4 25 47.8 25.1 49.1 25.1 50.3 25.3 51.4 25.4 52.4 25.6 53.3 25.8 54.1 26 54.8 26.2 55.4 26.3 55.9 26.5 56.4 26.7 56.7 26.9 57 27.2 57.3 27.5 57.4 28 57.6 28.6 57.6 29.2 57.5 30 57.3 30.8 56.9 31.6 56.4 32.5 55.8Z'/%3E%3C/svg%3E",
      },
    ],
  }),
  component: () => (
    <Document>
      <Outlet />
    </Document>
  ),
  notFoundComponent: () => (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-ink-muted">There is no page or site at this address.</p>
      <a href="/" className="mt-4 inline-block text-ink underline underline-offset-4">
        Go to the overview
      </a>
    </main>
  ),
})

function Document({ children }: { children: ReactNode }) {
  return (
    // Dark only: Kumo reads data-mode, and no script or control removes it.
    <html lang="en" data-mode="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
