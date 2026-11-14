/** Works, doesn't work or not computed, as a mark and a word, so it never rests on colour alone. */
export function StatusWord({ works, computed = true, short = false }: { works: boolean; computed?: boolean; short?: boolean }) {
  if (!computed) return <span className="text-ink-muted">Not computed</span>
  return works ? (
    <span className="whitespace-nowrap text-go">
      <span aria-hidden>✓ </span>Works
    </span>
  ) : (
    <span className="whitespace-nowrap text-miss">
      <span aria-hidden>× </span>
      {short ? 'No' : 'Doesn’t work'}
    </span>
  )
}
