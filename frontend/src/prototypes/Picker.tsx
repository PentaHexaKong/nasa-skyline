import './picker.css'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Harness chrome from the emil-prototype skill's PICKER.md. Not part of any design being judged. */
export function Picker({ names, render }: { names: string[]; render: (index: number) => ReactNode }) {
  const [current, setCurrent] = useState(0)
  const [run, setRun] = useState(0)
  const [ready, setReady] = useState(false)
  const nav = useRef<HTMLElement>(null)
  const highlight = useRef<HTMLSpanElement>(null)

  const select = (i: number) => {
    const next = (i + names.length) % names.length
    setCurrent(next)
    setRun((r) => r + 1)
    const url = new URL(location.href)
    url.searchParams.set('v', String(next + 1))
    history.replaceState(history.state, '', url)
  }

  // The URL is read after hydration, so the server and first client render agree.
  useEffect(() => {
    const v = Number.parseInt(new URLSearchParams(location.search).get('v') ?? '1', 10)
    setCurrent(v >= 1 && v <= names.length ? v - 1 : 0)
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)))
    return () => cancelAnimationFrame(id)
  }, [names.length])

  useLayoutEffect(() => {
    const move = () => {
      const el = nav.current?.querySelectorAll<HTMLElement>('.proto-picker-item:not(.proto-picker-replay)')[current]
      if (!el || !highlight.current) return
      highlight.current.style.width = `${el.offsetWidth}px`
      highlight.current.style.transform = `translateX(${el.offsetLeft}px)`
    }
    move()
    window.addEventListener('resize', move)
    return () => window.removeEventListener('resize', move)
  }, [current, names.join()])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const num = Number.parseInt(e.key, 10)
      if (num >= 1 && num <= names.length) select(num - 1)
      else if (e.key === 'ArrowRight') select(current + 1)
      else if (e.key === 'ArrowLeft') select(current - 1)
      else if (e.key === 'r' || e.key === 'R') setRun((r) => r + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [current, names.length])

  return (
    <>
      <div key={`${current}-${run}`}>{render(current)}</div>
      <nav ref={nav} className="proto-picker" aria-label="Prototype variants" data-ready={ready ? '' : undefined}>
        <span ref={highlight} className="proto-picker-highlight" aria-hidden="true" />
        {names.map((name, i) => (
          <button
            key={name}
            type="button"
            className="proto-picker-item"
            data-active={i === current ? '' : undefined}
            aria-current={i === current ? 'true' : undefined}
            onClick={() => select(i)}
          >
            {name}
          </button>
        ))}
        <span className="proto-picker-divider" aria-hidden="true" />
        <button
          type="button"
          className="proto-picker-item proto-picker-replay"
          aria-label="Replay animation (R)"
          onClick={() => setRun((r) => r + 1)}
        >
          ↻
        </button>
      </nav>
    </>
  )
}
