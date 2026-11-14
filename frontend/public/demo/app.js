'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const DAY = 86400000;
  const sites = {
    a: { name: 'Punggung A', letter: 'A', base: 0.5, phase: 0.2, point: [111, 67] },
    b: { name: 'Tepi kawah B', letter: 'B', base: 1.35, phase: 1.1, point: [149, 85] },
    c: { name: 'Cekungan C', letter: 'C', base: 2.3, phase: 2.2, point: [94, 99] }
  };
  const modes = [ { id: 'direct', name: 'Tanpa relay', color: '#7ca996' }, { id: 'one', name: '1 relay', color: '#ad94db' }, { id: 'two', name: '2 relay', color: '#8e72bb' } ];
  const state = { site: 'a', start: '2026-11-14', days: 14, mode: 'direct', cursor: 30, saved: [], series: [] };
  let timer = null, toastTimer = null;
  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const percent = n => Math.round(n * 100) + '%';
  const shortDate = timestamp => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(timestamp));
  const longDate = timestamp => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(timestamp));
  const clock = timestamp => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(timestamp));
  const hours = n => n >= 48 ? (n / 24).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' hari' : n.toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' jam';
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500); }

  // Deliberately invented chart signals. This is frontend illustration, not lunar geometry.
  // No ephemeris, terrain product, orbital propagation, API, DS or ML is used.
  function terrain(azimuth, siteId) {
    const s = sites[siteId], a = azimuth * Math.PI / 180;
    return s.base + .85 * Math.sin(a * 3 + s.phase) + .45 * Math.sin(a * 7 + .5) + .2 * Math.cos(a * 13);
  }
  function makeSeries(config) {
    const start = Date.parse(config.start + 'T00:00:00Z');
    const offset = (start - Date.UTC(2026, 0, 1)) / DAY;
    return Array.from({ length: config.days * 12 }, (_, i) => {
      const day = offset + i / 12, site = sites[config.site];
      const sunAz = mod(day * 12.2 + site.phase * 15, 360);
      const earthAz = 183 + 14 * Math.sin(day * .22 + site.phase * .3);
      const sunEl = .75 + 1.6 * Math.sin(day * .21 + site.phase);
      const earthEl = 5.7 * Math.sin(day * .23 + .8) + .2;
      const sun = sunEl + .27 > terrain(sunAz, config.site);
      const earth = earthEl > terrain(earthAz, config.site);
      const r1 = Math.sin(day * 1.27 + site.phase) > -.25 && Math.cos(day * .83) > -.65;
      const r2 = r1 || (Math.cos(day * 1.19 + 1.6) > -.4 && Math.sin(day * .77 + .6) > -.65);
      return { time: start + i * 2 * 3600000, sunAz, earthAz, sunEl, earthEl, sun, earth, r1, r2,
        relayAz: mod(day * 77 + 140, 360), relayEl: 4.5 + 3 * Math.sin(day * 1.27 + site.phase) };
    });
  }
  const contact = (p, mode) => p.earth || (mode === 'one' ? p.r1 : mode === 'two' ? p.r2 : false);
  const fraction = (arr, fn) => arr.filter(fn).length / arr.length;
  function longestGap(arr, fn) { let max = 0, run = 0; for (const p of arr) { run = fn(p) ? 0 : run + 2; max = Math.max(max, run); } return max; }
  function metrics(series, mode) { return { sun: fraction(series, p => p.sun), earth: fraction(series, p => p.earth), dark: longestGap(series, p => p.sun), gap: longestGap(series, p => contact(p, mode)), coverage: fraction(series, p => contact(p, mode)) }; }
  function stop() { if (timer) clearInterval(timer); timer = null; $('play-icon').textContent = '▶'; $('play').setAttribute('aria-label', 'Putar waktu'); }
  function setView(view) {
    stop(); const compare = view === 'compare';
    $('explore-view').hidden = compare; $('compare-view').hidden = !compare;
    for (const [id, active] of [['explore-tab', !compare], ['compare-tab', compare]]) { $(id).classList.toggle('active', active); if (active) $(id).setAttribute('aria-current', 'page'); else $(id).removeAttribute('aria-current'); }
    if (compare) renderComparison();
  }
  function map() { $('map-points').innerHTML = Object.entries(sites).map(([key, s]) => `<g><circle cx="${s.point[0]}" cy="${s.point[1]}" r="${key === state.site ? 10 : 7}" fill="${key === state.site ? '#23664f' : '#aebfad'}" stroke="#fff" stroke-width="2"/><text x="${s.point[0]}" y="${s.point[1] + 3}" text-anchor="middle" fill="#fff" font-size="8">${s.letter}</text></g>`).join(''); }
  function lineSegments(series, x, y, azKey, elKey) {
    let paths = [], segment = '';
    series.forEach((p, i) => { if (i && Math.abs(p[azKey] - series[i - 1][azKey]) > 180) { if (segment) paths.push(segment); segment = ''; } segment += (segment ? ' L' : 'M') + x(p[azKey]).toFixed(1) + ',' + y(p[elKey]).toFixed(1); });
    if (segment) paths.push(segment); return paths;
  }
  function drawSky() {
    const p = state.series[state.cursor], x = a => 47 + a / 360 * 906, y = e => 149 - e * 9;
    let surface = ''; for (let a = 0; a <= 360; a += 2) surface += (a === 0 ? 'M' : ' L') + x(a).toFixed(1) + ',' + y(terrain(a, state.site)).toFixed(1);
    const grids = [-9, -6, -3, 0, 3, 6, 9].map(e => `<g><line x1="47" x2="953" y1="${y(e)}" y2="${y(e)}" stroke="${e === 0 ? '#667b6b' : '#32493b'}" stroke-width="${e === 0 ? 1 : .6}" stroke-dasharray="${e === 0 ? '4 5' : '2 7'}"/><text x="32" y="${y(e) + 3}" fill="#7d9988" font-size="9" text-anchor="end">${e > 0 ? '+' : ''}${e}°</text></g>`).join('');
    const ticks = [0, 90, 180, 270, 360].map(a => `<text x="${x(a)}" y="278" fill="#819c8a" font-size="9" text-anchor="middle">${a}°</text>`).join('');
    const trail = (aKey, eKey, color) => lineSegments(state.series, x, y, aKey, eKey).map(d => `<path d="${d}" fill="none" stroke="${color}" opacity=".35" stroke-width="1.3" stroke-dasharray="4 6"/>`).join('');
    const relay = state.mode === 'direct' ? '' : `<line x1="${x(p.relayAz)}" x2="${x(p.relayAz)}" y1="${y(p.relayEl)}" y2="248" stroke="#ad94db" stroke-dasharray="3 7" opacity=".25"/><rect x="${x(p.relayAz) - 6}" y="${y(p.relayEl) - 4}" width="12" height="8" rx="2" fill="#b6a0db"/><path d="M${x(p.relayAz) - 10},${y(p.relayEl)}h-5m25 0h5" stroke="#b6a0db" stroke-width="3"/>`;
    $('sky-chart').innerHTML = `<svg viewBox="0 0 1000 296" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">Skyline ilustrasi ${sites[state.site].name}</title><desc id="chart-desc">Arah 0 sampai 360 derajat dan elevasi -9 sampai 9 derajat. Matahari ${p.sun ? 'terlihat sebagian atau seluruhnya' : 'terhalang'}; Bumi ${p.earth ? 'terlihat' : 'terhalang'}. Semua lintasan dan medan adalah ilustrasi.</desc><defs><linearGradient id="surface-gradient" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#4e6654" stop-opacity=".6"/><stop offset="1" stop-color="#263c30" stop-opacity=".1"/></linearGradient><radialGradient id="sun-glow"><stop stop-color="#edb954" stop-opacity=".35"/><stop offset="1" stop-color="#edb954" stop-opacity="0"/></radialGradient></defs><g>${grids}</g>${trail('sunAz', 'sunEl', '#eab354')}${trail('earthAz', 'earthEl', '#85bee4')}<path d="${surface} L953,254 L47,254 Z" fill="url(#surface-gradient)"/><path d="${surface}" fill="none" stroke="#99b49a" stroke-width="1.4"/><text x="72" y="222" fill="#77937e" font-size="9" letter-spacing="2">MEDAN ILUSTRATIF</text><circle cx="${x(p.sunAz)}" cy="${y(p.sunEl)}" r="26" fill="url(#sun-glow)"/><circle cx="${x(p.sunAz)}" cy="${y(p.sunEl)}" r="7" fill="#f0bb5d" opacity="${p.sun ? 1 : .45}"/><circle cx="${x(p.earthAz)}" cy="${y(p.earthEl)}" r="8" fill="#85bde0" opacity="${p.earth ? 1 : .4}"/><path d="M${x(p.earthAz) - 4},${y(p.earthEl) - 5}q8 1 5 8q-6 1-5-8" fill="#b7d6c6" opacity="${p.earth ? .8 : .3}"/>${relay}${ticks}<text x="500" y="295" fill="#6e8c79" font-size="8" text-anchor="middle" letter-spacing="1.5">AZIMUTH · DARI UTARA LOKAL, SEARAH JARUM JAM · UKURAN OBJEK TIDAK BERSKALA</text></svg>`;
  }
  function nextSet(key) { for (let i = state.cursor + 1; i < state.series.length; i++) if (state.series[i - 1][key] && !state.series[i][key]) return hours((i - state.cursor) * 2); return null; }
  function renderTime() {
    const p = state.series[state.cursor]; $('cursor-label').textContent = `${shortDate(p.time)} · ${clock(p.time)} UTC`; $('time-slider').value = state.cursor;
    const sset = nextSet('sun'), eset = nextSet('earth');
    $('sun-status').innerHTML = `<span class="${p.sun ? '' : 'dim'}">● Matahari ${p.sun ? 'terlihat' : 'terhalang'}</span> · ${sset ? `sunset berikut ~${sset}` : 'sunset di luar sisa interval'}`;
    $('earth-status').innerHTML = `<span class="${p.earth ? '' : 'dim'}">● Bumi ${p.earth ? 'terlihat' : 'terhalang'}</span> · ${eset ? `Earthset berikut ~${eset}` : 'Earthset di luar sisa interval'}`;
    $('relay-status').hidden = state.mode === 'direct'; $('relay-legend').hidden = state.mode === 'direct';
    $('relay-status').textContent = `● Via relay ${state.mode === 'one' ? p.r1 ? 'tersedia' : 'tidak tersedia' : p.r2 ? 'tersedia' : 'tidak tersedia'}`;
    const position = state.cursor / state.series.length * 100; document.querySelectorAll('.lane-cursor').forEach(el => el.style.left = position + '%');
    drawSky(); renderPath();
  }
  function segments(fn, color) {
    let html = '', start = null;
    for (let i = 0; i <= state.series.length; i++) { const active = i < state.series.length && fn(state.series[i]); if (active && start === null) start = i; if (!active && start !== null) { html += `<span class="lane-segment" style="left:${start / state.series.length * 100}%;width:${(i - start) / state.series.length * 100}%;background:${color}"></span>`; start = null; } }
    return html;
  }
  function renderLanes() {
    const lanes = [{ name: 'Cahaya', fn: p => p.sun, color: '#e6b359' }, { name: 'Bumi langsung', fn: p => p.earth, color: '#84b9dc' }, { name: 'Kontak gabungan', fn: p => contact(p, state.mode), color: state.mode === 'direct' ? '#88ab95' : '#b09acb' }];
    $('timeline-lanes').innerHTML = lanes.map(l => { const pct = percent(fraction(state.series, l.fn)); return `<div class="lane"><span class="lane-name"><i style="background:${l.color}"></i>${l.name}</span><div class="lane-bar" role="img" aria-label="${l.name}: ${pct} dari periode, data ilustrasi">${segments(l.fn, l.color)}<span class="lane-cursor"></span></div><span class="lane-value">${pct}</span></div>`; }).join('');
  }
  function renderPath() {
    const p = state.series[state.cursor], relayAvailable = state.mode === 'one' ? p.r1 : p.r2;
    $('relay-path').innerHTML = `<div class="path-nodes"><span class="path-node"><i></i>Lander</span><span class="path-arrow">${state.mode === 'direct' ? p.earth ? '→' : '×' : relayAvailable ? '→' : '×'}</span>${state.mode === 'direct' ? '' : `<span class="path-node"><i class="relay-color"></i>${state.mode === 'two' ? 'Relay A / B' : 'Relay'}</span><span class="path-arrow">${relayAvailable ? '→' : '×'}</span>`}<span class="path-node"><i class="earth-color"></i>Bumi</span></div><p class="path-note">${state.mode === 'direct' ? p.earth ? 'Saat cursor ini: jalur langsung tersedia.' : 'Saat cursor ini: jalur langsung terhalang.' : relayAvailable ? 'Saat cursor ini: setidaknya satu jalur relay ilustratif tersedia.' : 'Saat cursor ini: belum ada jalur relay ilustratif tersedia.'}</p>`;
  }
  function renderOptions() {
    $('relay-options').innerHTML = modes.map(m => { const gap = longestGap(state.series, p => contact(p, m.id)); return `<button type="button" class="relay-option" data-mode="${m.id}" aria-pressed="${state.mode === m.id}"><span class="relay-option-title">${m.name}</span>${state.mode === m.id ? '<span class="relay-check" aria-hidden="true">✓</span>' : ''}<strong class="relay-option-value">${hours(gap)}</strong><span class="relay-option-caption">gap kontak terpanjang</span></button>`; }).join('');
  }
  function render() {
    state.series = makeSeries(state); state.cursor = clamp(state.cursor, 0, state.series.length - 1);
    const start = Date.parse(state.start + 'T00:00:00Z'), end = start + state.days * DAY;
    const m = metrics(state.series, state.mode); $('sky-title').textContent = 'Langit dari ' + sites[state.site].name;
    $('scenario-caption').textContent = `${longDate(start)} — ${longDate(end)} UTC · ${state.days} hari · sampel ilustrasi / 2 jam`;
    $('range-start').textContent = shortDate(start); $('range-end').textContent = shortDate(end) + ' (batas akhir)';
    $('time-slider').max = state.series.length - 1;
    $('metric-sun').textContent = percent(m.sun); $('metric-earth').textContent = percent(m.earth); $('metric-dark').textContent = hours(m.dark); $('metric-gap').textContent = hours(m.gap);
    $('gap-description').textContent = state.mode === 'direct' ? 'Tanpa bantuan relay' : 'Dengan jalur direct + relay';
    $('period-label').textContent = state.days + ' HARI';
    map(); renderLanes(); renderOptions(); renderTime();
  }
  function saveScenario() {
    const key = [state.site, state.start, state.days, state.mode].join('|');
    if (state.saved.some(s => s.key === key)) { toast('Skenario ini sudah ada. Ubah lokasi, tanggal, atau relay untuk membandingkan.'); return; }
    if (state.saved.length >= 3) { toast('Maksimal 3 skenario. Hapus satu di tab Bandingkan.'); return; }
    state.saved.push({ site: state.site, start: state.start, days: state.days, mode: state.mode, key });
    $('compare-count').textContent = state.saved.length;
    toast(`Skenario ${state.saved.length} disimpan. Buka tab Bandingkan untuk melihatnya.`);
  }
  function miniSky(config) {
    let d = ''; for (let a = 0; a <= 360; a += 4) d += (a ? 'L' : 'M') + (a / 360 * 240).toFixed(1) + ',' + (34 - terrain(a, config.site) * 7).toFixed(1);
    return `<svg viewBox="0 0 240 80" role="img" aria-label="Profil medan ilustrasi ${sites[config.site].name}"><path d="M0 31H240" fill="none" stroke="#8b9d8b" stroke-dasharray="2 4" opacity=".4"/><path d="${d}L240 75L0 75Z" fill="#57765c" opacity=".45"/><path d="${d}" fill="none" stroke="#94b098" stroke-width="1.3"/><text x="7" y="69" font-size="7" fill="#9eb59e" font-family="monospace">SKYLINE ILUSTRASI</text></svg>`;
  }
  function renderComparison() {
    const n = state.saved.length;
    if (!n) { $('comparison-content').innerHTML = '<div class="empty-compare panel"><div class="empty-icon" aria-hidden="true">▥</div><h2>Satu pilihan belum bercerita semuanya.</h2><p>Tambahkan skenario dari Eksplorasi, ganti satu pilihan, lalu tambahkan lagi.</p><button class="button primary" type="button" data-add>Mulai dari satu lokasi →</button></div>'; return; }
    const cards = state.saved.map((s, i) => {
      const m = metrics(makeSeries(s), s.mode), start = Date.parse(s.start + 'T00:00:00Z');
      return `<article class="comparison-card panel"><div class="comparison-top"><span class="comparison-number">SKENARIO 0${i + 1} · ILUSTRASI</span><button class="remove-scenario" type="button" data-remove="${i}" aria-label="Hapus skenario ${i + 1}">×</button></div><h2>${sites[s.site].name}</h2><p class="dates">${longDate(start)} — ${longDate(start + s.days * DAY)} UTC</p><span class="quiet-tag">${s.days} HARI · ${modes.find(m => m.id === s.mode).name.toUpperCase()}</span><div class="mini-chart">${miniSky(s)}</div><div class="compare-metric"><span>Waktu bercahaya</span><strong>${percent(m.sun)}</strong></div><div class="compare-metric"><span>Bumi terlihat langsung</span><strong>${percent(m.earth)}</strong></div><div class="compare-metric"><span>Gelap terpanjang</span><strong>${hours(m.dark)}</strong></div><div class="compare-metric"><span>Gap kontak tersisa</span><strong>${hours(m.gap)}</strong></div><div class="compare-metric"><span>Kontak gabungan</span><strong>${percent(m.coverage)}</strong></div><button class="button secondary" type="button" data-open="${i}">Jelajahi skenario ↗</button></article>`;
    }).join('');
    $('comparison-content').innerHTML = `<div class="comparison-grid">${cards}${n < 3 ? '<button class="add-compare-card" type="button" data-add><span aria-hidden="true">＋</span>Tambah pilihan lain</button>' : ''}</div>`;
  }
  document.querySelectorAll('input[name=site]').forEach(el => el.addEventListener('change', () => { stop(); state.site = el.value; render(); }));
  $('start-date').addEventListener('change', e => { if (!e.target.validity.valid || !e.target.value) { e.target.setAttribute('aria-invalid', 'true'); toast('Pilih tanggal antara 14 Nov 2026 dan 31 Des 2030.'); return; } e.target.removeAttribute('aria-invalid'); stop(); state.start = e.target.value; render(); });
  $('duration').addEventListener('change', e => { stop(); state.days = Number(e.target.value); render(); });
  $('time-slider').addEventListener('input', e => { stop(); state.cursor = Number(e.target.value); renderTime(); });
  $('play').addEventListener('click', () => { if (timer) { stop(); return; } if (state.cursor >= state.series.length - 1) state.cursor = 0; $('play-icon').textContent = 'Ⅱ'; $('play').setAttribute('aria-label', 'Jeda waktu'); timer = setInterval(() => { if (state.cursor >= state.series.length - 1) { stop(); return; } state.cursor++; renderTime(); }, 160); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  $('relay-options').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; state.mode = b.dataset.mode; const focusedMode = state.mode; render(); document.querySelector(`[data-mode="${focusedMode}"]`).focus({ preventScroll: true }); });
  $('save-scenario').addEventListener('click', saveScenario);
  $('explore-tab').addEventListener('click', () => setView('explore'));
  $('compare-tab').addEventListener('click', () => setView('compare'));
  $('back-explore').addEventListener('click', () => setView('explore'));
  $('comparison-content').addEventListener('click', e => {
    const remove = e.target.closest('[data-remove]'), open = e.target.closest('[data-open]');
    if (remove) { state.saved.splice(Number(remove.dataset.remove), 1); $('compare-count').textContent = state.saved.length; renderComparison(); toast('Skenario dihapus.'); }
    if (open) { const s = state.saved[Number(open.dataset.open)]; Object.assign(state, { site: s.site, start: s.start, days: s.days, mode: s.mode, cursor: 0 }); $('start-date').value = s.start; $('duration').value = s.days; document.querySelector(`input[name=site][value=${s.site}]`).checked = true; render(); setView('explore'); $('page-title').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (e.target.closest('[data-add]')) setView('explore');
  });
  $('help-open').addEventListener('click', () => { stop(); $('help-dialog').showModal(); });
  ['help-close', 'help-done'].forEach(id => $(id).addEventListener('click', () => $('help-dialog').close()));
  $('help-dialog').addEventListener('click', e => { if (e.target === $('help-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
  render();
})();
