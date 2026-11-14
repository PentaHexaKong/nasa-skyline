import { renderRelayTimeline } from './relayTimeline.js'
import { evaluateScientificScenario, scientificPresentationMetrics } from './scientificClient/scientificContractClient.js'
const byId = (id) => document.getElementById(id)
let evaluatedRequest = null

async function loadSites() {
  try {
    const response = await fetch('/api/mission-science/v1/site-catalog')
    if (!response.ok) throw new Error('Scientific service is unavailable')
    const catalog = await response.json()
    for (const site of catalog.sites) {
      const option = document.createElement('option')
      option.value = site.canonicalId
      option.disabled = !site.liveEvaluation.startsWith('supported')
      option.textContent = `${site.canonicalId} — ${site.displayName}${option.disabled ? ' (scientific support unresolved or unavailable)' : ''}`
      byId('site').append(option)
    }
    byId('status').textContent = 'Coordinates use the verified DE421 site registry. Earth visibility uses the body center.'
  } catch (error) {
    byId('status').textContent = error.message
    byId('submit').disabled = true
  }
}

function showResult(data) {
  const table = document.createElement('table')
  const header = table.insertRow()
  for (const label of ['Target', 'Availability', 'Visible duration', 'Longest outage']) {
    const cell = document.createElement('th')
    cell.textContent = label
    header.append(cell)
  }
  const metrics = scientificPresentationMetrics(data)
  if (!metrics) throw new Error('Scientific metrics are unavailable')
  for (const [body, percent, durationHours, blackoutHours] of [
    ['SUN', metrics.sunlightPercent, metrics.sunlightHours, metrics.longestDarknessHours],
    ['EARTH', metrics.directEarthPercent, metrics.directEarthHours, metrics.longestDirectEarthBlackoutHours],
  ]) {
    const row = table.insertRow()
    const fields = [body, `${percent.toFixed(2)}%`, `${durationHours.toFixed(2)} h`, `${blackoutHours.toFixed(2)} h`]
    for (const text of fields) row.insertCell().textContent = text
  }
  byId('result').append(table)
  byId('status').textContent = 'Computed with refined event searches. Short events and skyline discontinuities remain subject to the reported detection limits. Earth visibility describes geometry.'
  byId('provenance').textContent = JSON.stringify({ scenarioId: data.scenarioId, period: data.result.period, observer: data.result.observer, ...data.provenance }, null, 2)
  byId('details').hidden = false
}

async function evaluate(event) {
  byId('relay').hidden = true
  evaluatedRequest = null
  event.preventDefault()
  byId('submit').disabled = true
  byId('result').replaceChildren()
  byId('details').hidden = true
  byId('status').textContent = 'Computing terrain-aware visibility...'
  try {
    const request = {
      schemaVersion: 'skyline-scientific-request/1.0.0',
      observerHeightM: 0,
      site: byId('site').value,
      startUtc: `${byId('start').value.length === 16 ? `${byId('start').value}:00` : byId('start').value}Z`,
      durationS: Number(byId('duration').value) * 3600,
      cadenceS: 3600,
      profile: byId('profile').value,
      solarDefinition: byId('solar').value,
    }
    const data = await evaluateScientificScenario(request)
    if (data.dataState !== 'computed') throw new Error(`${data.dataState}: ${data.error.message}`)
    showResult(data)
    evaluatedRequest = request
    await prepareRelay(request)
  } catch (error) {
    byId('status').textContent = error.message
  } finally {
    byId('submit').disabled = false
  }
}

byId('query').addEventListener('submit', evaluate)
loadSites()

async function prepareRelay(request) {
  byId('relay').hidden = false
  byId('relayCompare').disabled = true
  byId('relayResult').replaceChildren()
  byId('relayDetails').hidden = true
  const offset = (Date.parse(request.startUtc) - Date.parse('2025-01-01T00:00:00Z')) / 1000
  if (request.profile !== 'geometric' || request.durationS > 86400 || offset < 0 || offset % 120 || offset + request.durationS > 28 * 86400) {
    byId('relaySupport').textContent = 'This comparison supports geometric CR1, GR1 and SR1 windows up to 24 hours, on two-minute boundaries within January 1–29, 2025. The selected environmental evaluation remains available above.'
    return
  }
  try {
    const response = await fetch('/api/relay-engineering/candidates')
    if (!response.ok) throw new Error('Relay candidate service is unavailable')
    const candidates = await response.json()
    if (!candidates.some(candidate => candidate.candidateId === 'nominal-candidate-2')) throw new Error('The verified candidate is unavailable')
    byId('relaySupport').textContent = `Candidate 2 uses two relays and saved two-body trajectories. Comparison window is ${request.site}, ${request.startUtc}, ${request.durationS / 3600} hours. Both paths use geometric Earth-center visibility and the same terrain observer. RF availability is unqualified.`
    byId('relayCompare').disabled = false
  } catch (error) {
    byId('relaySupport').textContent = error.message
  }
}

async function compareRelay() {
  if (!evaluatedRequest) return
  byId('relayResult').replaceChildren()
  byId('submit').disabled = true
  byId('relayCompare').disabled = true
  byId('relaySupport').textContent = 'Evaluating the verified relay scenario and checking scientific compatibility…'
  try {
    const response = await fetch('/api/relay-engineering/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: evaluatedRequest.site, startUtc: evaluatedRequest.startUtc, durationS: evaluatedRequest.durationS }),
    })
    const data = await response.json()
    if (!response.ok || data.dataState !== 'computed') throw new Error(data.error?.message || 'Scientific comparison unavailable')
    const table = document.createElement('table')
    const header = table.insertRow()
    for (const label of ['Path', 'Available samples', 'Longest blackout']) {
      const cell = document.createElement('th')
      cell.textContent = label
      header.append(cell)
    }
    for (const [label, values] of [['Direct Earth', data.direct], ['Direct or relay', data.assisted]]) {
      const row = table.insertRow()
      for (const value of [label, `${(values.fraction * 100).toFixed(2)}%`, `${(values.maximumBlackoutS / 3600).toFixed(2)} h`]) row.insertCell().textContent = value
      const paragraph = document.createElement('p')
      paragraph.textContent = `${label} blackout intervals, hours after start: ${values.blackoutIntervalsS.map(([left, right]) => `${(left / 3600).toFixed(2)}–${(right / 3600).toFixed(2)}`).join(', ') || 'none on the sampled grid'}`
      byId('relayResult').append(paragraph)
    }
    byId('relayResult').prepend(table)
    byId('relayResult').append(renderRelayTimeline(data))
    byId('relaySupport').textContent = `Sampled availability improvement is ${(100 * data.improvementFraction).toFixed(2)} percentage points. Cadence is ${data.cadenceS} seconds with half-open sample bins. RF qualification remains unavailable.`
    byId('relayProvenance').textContent = JSON.stringify({ mission: data.missionScience.provenance, relay: data.relayScience.provenance }, null, 2)
    byId('relayDetails').hidden = false
  } catch (error) {
    byId('relaySupport').textContent = error.message
  } finally {
    byId('relayCompare').disabled = false
    byId('submit').disabled = false
  }
}

byId('relayCompare').addEventListener('click', compareRelay)
