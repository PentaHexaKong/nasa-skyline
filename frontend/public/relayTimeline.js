export function availabilitySegments(times, available, cadence) {
  if (!times.length || times.length !== available.length || times.some((time, index) => time !== index * cadence)) {
    throw new Error('Timeline requires a uniform common timestamp grid')
  }
  const segments = []
  let begin = 0
  for (let index = 1; index <= available.length; index++) {
    if (index === available.length || available[index] !== available[begin]) {
      segments.push({ start: times[begin], end: times[index - 1] + cadence, available: available[begin] })
      begin = index
    }
  }
  return segments
}

export function renderRelayTimeline(data) {
  const replay = data.relayScience.result
  const request = data.relayScience.provenance.request
  const cadence = data.cadenceS
  const rows = [
    { name: 'Direct Earth', segments: availabilitySegments(replay.timesS, replay.directAvailable, cadence) },
    { name: 'Direct or relay', segments: availabilitySegments(replay.timesS, replay.assistedAvailable, cadence) },
  ]
  const namespace = 'http://www.w3.org/2000/svg'
  const create = (name, attributes, text) => {
    const element = document.createElementNS(namespace, name)
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value))
    if (text) element.textContent = text
    return element
  }
  const figure = document.createElement('figure')
  figure.style.margin = '1.5rem 0'
  const caption = document.createElement('figcaption')
  caption.textContent = `Synchronized availability for ${request.siteId}, ${request.startUtc}. Green is available and coral is blackout. Both rows use ${cadence}-second half-open bins.`
  figure.append(caption)
  const svg = create('svg', { viewBox: '0 0 900 190', role: 'img', 'aria-label': 'Direct Earth and relay-assisted availability on a shared UTC timeline' })
  svg.style.width = '100%'
  const left = 145
  const width = 735
  const scale = time => left + width * time / request.durationS
  const epoch = Date.parse(request.startUtc)
  const utc = seconds => new Date(epoch + seconds * 1000).toISOString()
  rows.forEach((row, index) => {
    const y = 30 + index * 55
    svg.append(create('text', { x: 0, y: y + 22, fill: '#eaf1ed', 'font-size': 16 }, row.name))
    for (const segment of row.segments) {
      const rectangle = create('rect', { x: scale(segment.start), y, width: width * (segment.end - segment.start) / request.durationS, height: 32, fill: segment.available ? '#79c99e' : '#ed987c' })
      rectangle.append(create('title', {}, `${row.name}, ${segment.available ? 'available' : 'blackout'}, ${utc(segment.start)} to ${utc(segment.end)}`))
      svg.append(rectangle)
    }
  })
  for (let index = 0; index <= 4; index++) {
    const time = index * request.durationS / 4
    const x = scale(time)
    svg.append(create('line', { x1: x, x2: x, y1: 22, y2: 125, stroke: '#c8d7ce', 'stroke-opacity': .35 }))
    svg.append(create('text', { x, y: 150, 'text-anchor': index === 4 ? 'end' : index === 0 ? 'start' : 'middle', fill: '#eaf1ed', 'font-size': 14 }, utc(time).slice(11, 16)))
  }
  svg.append(create('text', { x: left, y: 180, fill: '#c8d7ce', 'font-size': 13 }, `UTC, ${utc(0).slice(0, 10)} through ${utc(request.durationS).slice(0, 10)}`))
  figure.append(svg)
  const provenance = document.createElement('p')
  provenance.textContent = `${data.relayScience.provenance.frame}, ${data.relayScience.provenance.correction}, terrain-aware Earth-center geometry. RF qualification is unavailable. Source hashes and observer coordinates are included in the downloadable result.`
  figure.append(provenance)
  const download = document.createElement('button')
  download.type = 'button'
  download.textContent = 'Download timeline and scientific provenance'
  download.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ schemaVersion: '1.0', rows, comparison: data }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `skyline-${request.siteId}-${request.startUtc.slice(0, 10)}-relay.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  figure.append(download)
  return figure
}
