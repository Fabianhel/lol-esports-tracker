import * as api from './api.js';

// ---------- Android-App (Capacitor) ----------
const Native = window.Capacitor?.isNativePlatform?.() ? window.Capacitor : null;
const Tracker = Native ? (Native.registerPlugin ? Native.registerPlugin('LiveTracker') : Native.Plugins?.LiveTracker) : null;
const REPO = 'Fabianhel/lol-esports-tracker';
const APK_URL = `https://github.com/${REPO}/releases/latest/download/lol-esports.apk`;

// Deutscher Co-Stream (Tolkin)
const GERMAN_STREAM = {
  twitch: 'https://www.twitch.tv/tolkin',
  youtube: 'https://www.youtube.com/@TolkinLoL/live',
};
const germanStreamButtons = (cls = '') =>
  `<div class="de-stream ${cls}"><span class="de-label">🇩🇪 Tolkin</span>
    <a class="sbtn twitch" href="${GERMAN_STREAM.twitch}" target="_blank" rel="noopener">Twitch</a>
    <a class="sbtn youtube" href="${GERMAN_STREAM.youtube}" target="_blank" rel="noopener">YouTube</a></div>`;

// ---------- Hilfsfunktionen ----------
const $ = (sel, root = document) => root.querySelector(sel);
const h = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('lolx:' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('lolx:' + key, JSON.stringify(value));
    } catch {
      /* ignorieren */
    }
  },
};

const REGION_NAMES = {
  INTERNATIONAL: 'International',
  EUROPE: 'Europa',
  EMEA: 'EMEA',
  KOREA: 'Korea',
  CHINA: 'China',
  'NORTH AMERICA': 'Nordamerika',
  AMERICAS: 'Amerika',
  BRAZIL: 'Brasilien',
  'LATIN AMERICA': 'Lateinamerika',
  VIETNAM: 'Vietnam',
  JAPAN: 'Japan',
  OCEANIA: 'Ozeanien',
  'ASIA PACIFIC': 'Asien-Pazifik',
  'HONG KONG, MACAU, TAIWAN': 'Asien-Pazifik',
  COMMONWEALTH_OF_INDEPENDENT_STATES: 'GUS',
  TURKEY: 'Türkei',
};
const regionLabel = (r) =>
  REGION_NAMES[(r || '').toUpperCase()] ||
  (r || 'Sonstige').toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());

const fmtTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDayYear = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function dayLabel(d) {
  const today = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  return fmtDay.format(d) + (d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : '');
}
const kFmt = (n) => (n == null ? '–' : (n / 1000).toFixed(1) + 'k');

// ---------- Zustand ----------
const state = {
  tab: store.get('tab', 'live'),
  region: store.get('region', 'all'), // 'all' | 'fav' | Regionsname
  league: store.get('league', null), // League-ID oder null
  favorites: new Set(store.get('favorites', [])),
  leagues: [],
  leaguesById: new Map(),
  leaguesBySlug: new Map(),
  schedule: null, // { events, older, newer, key }
  standings: { leagueId: null, tournaments: [], tournamentId: null, data: null, stageIdx: 0 },
  timers: [],
  tracked: null, // Match-ID, die in der Android-App verfolgt wird
  trackedScheduled: false, // true = nur vorgemerkt, Live-Stand startet kurz vor Beginn
  startTimes: new Map(), // Match-ID -> Startzeit (für die Verfolgung vor Spielbeginn)
  update: null, // { version } wenn eine neuere APK verfügbar ist
  teamsByLeague: new Map(), // League-ID -> Teams des aktuellen Turniers
};

function persist() {
  store.set('tab', state.tab);
  store.set('region', state.region);
  store.set('league', state.league);
  store.set('favorites', [...state.favorites]);
}

// Ligen, die der aktuelle Filter (Region / Favoriten / einzelne Liga) umfasst.
function regionLeagues(region = state.region) {
  if (region === 'all') return state.leagues;
  if (region === 'fav') return state.leagues.filter((l) => state.favorites.has(l.id));
  return state.leagues.filter((l) => regionLabel(l.region) === region);
}
function activeLeagues() {
  if (state.league && state.leaguesById.has(state.league)) return [state.leaguesById.get(state.league)];
  return regionLeagues();
}
function regions() {
  const seen = new Map();
  for (const l of state.leagues) {
    const r = regionLabel(l.region);
    const prio = r === 'International' ? -1 : l.displayPriority?.position ?? l.priority ?? 999;
    seen.set(r, Math.min(seen.get(r) ?? Infinity, prio));
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([r]) => r);
}

// ---------- Filterleisten ----------
function renderFilters() {
  const regionChips = [
    ['fav', '★ Favoriten'],
    ['all', 'Alle'],
    ...regions().map((r) => [r, r]),
  ]
    .map(([key, label]) => `<button class="chip ${state.region === key ? 'active' : ''}" data-region="${h(key)}">${h(label)}</button>`)
    .join('');
  $('#regionBar').innerHTML = regionChips;

  const leagues = regionLeagues();
  let leagueChips = `<button class="chip small ${!state.league ? 'active' : ''}" data-league="">Alle Events</button>`;
  leagueChips += leagues
    .map(
      (l) => `<button class="chip small ${state.league === l.id ? 'active' : ''}" data-league="${h(l.id)}">
        <img src="${h(l.image)}" alt="" loading="lazy">${h(l.name)}</button>`
    )
    .join('');
  if (state.region === 'fav' && !leagues.length) {
    leagueChips = `<span class="hint">Noch keine Favoriten – tippe oben rechts auf ☆, um Ligen zu markieren.</span>`;
  }
  $('#leagueBar').innerHTML = leagueChips;
  const active = $('#leagueBar .active, #regionBar .active');
  active?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

$('#regionBar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-region]');
  if (!btn) return;
  state.region = btn.dataset.region;
  state.league = null;
  onFilterChange();
});
$('#leagueBar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-league]');
  if (!btn) return;
  state.league = btn.dataset.league || null;
  onFilterChange();
});

function onFilterChange() {
  persist();
  renderFilters();
  state.schedule = null;
  renderTab();
}

// ---------- Tabs ----------
$('#tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  state.tab = btn.dataset.tab;
  persist();
  renderTab();
});
$('#refreshBtn').addEventListener('click', () => {
  state.schedule = null;
  state.standings.data = null;
  state.standings.leagueId = null;
  state.teamsByLeague.clear();
  renderTab();
});

function clearTimers() {
  state.timers.forEach(clearInterval);
  state.timers = [];
}

function renderTab() {
  clearTimers();
  document.querySelectorAll('#tabbar [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  const view = $('#view');
  view.scrollTop = 0;
  if (state.tab === 'live') return renderLive(view);
  if (state.tab === 'schedule') return renderSchedule(view);
  if (state.tab === 'standings') return renderStandings(view);
  if (state.tab === 'teams') return renderTeams(view);
}

const loading = (msg = 'Lade …') => `<div class="empty"><div class="spinner"></div><p>${h(msg)}</p></div>`;
const errorBox = (err) =>
  `<div class="empty error"><p>Daten konnten nicht geladen werden.</p><small>${h(err.message || err)}</small>
   <button class="btn" onclick="location.reload()">Erneut versuchen</button></div>`;

// ---------- Match-Karte ----------
function leagueOf(ev) {
  return state.leaguesBySlug.get(ev.league?.slug) || state.leaguesById.get(ev.league?.id) || ev.league || {};
}

function matchCard(ev, { showDate = false, streams = false } = {}) {
  const m = ev.match || {};
  const teams = m.teams || [];
  const league = leagueOf(ev);
  const start = ev.startTime ? new Date(ev.startTime) : null;
  const live = ev.state === 'inProgress';
  const done = ev.state === 'completed';
  const bo = m.strategy?.count ? `Bo${m.strategy.count}` : '';
  if (m.id && ev.startTime) state.startTimes.set(m.id, ev.startTime);
  const pin = state.tracked && state.tracked === m.id ? '<span class="pin" title="Wird verfolgt">📌</span>' : '';
  let status;
  if (live) status = `<span class="pill live">LIVE</span>`;
  else if (done) status = `<span class="pill done">Beendet</span>`;
  else status = `<span class="time">${start ? fmtTime.format(start) : 'TBD'}</span>`;

  const teamRow = (t) => {
    const win = t.result?.outcome === 'win';
    const lose = t.result?.outcome === 'loss';
    const score = done || live ? t.result?.gameWins ?? 0 : '';
    const rec = t.record ? `<small>${t.record.wins}–${t.record.losses}</small>` : '';
    return `<div class="team ${win ? 'win' : ''} ${lose ? 'lose' : ''}">
      <img src="${h(t.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <span class="name">${h(t.name || 'TBD')} ${rec}</span>
      <span class="score">${h(score)}</span></div>`;
  };

  return `<article class="match ${live ? 'is-live' : ''}" data-match="${h(m.id || '')}" data-upcoming="${!done && !live}">
    <header>
      <span class="league"><img src="${h(league.image)}" alt="" loading="lazy">${h(league.name || ev.league?.name || '')}</span>
      <span class="block">${h(ev.blockName || '')}${bo ? ' · ' + bo : ''}${showDate && start ? ' · ' + fmtDay.format(start) : ''}</span>
      ${pin}${status}
    </header>
    ${teams.length ? teams.map(teamRow).join('') : '<div class="team"><span class="name">TBD</span></div>'}
    ${streams && live ? germanStreamButtons('in-card') : ''}
  </article>`;
}

$('#view').addEventListener('click', (e) => {
  if (e.target.closest('a')) return; // Stream-Links nicht als Klick auf die Karte werten
  const card = e.target.closest('[data-match]');
  if (card && card.dataset.match) openMatch(card.dataset.match);
});

// ---------- Live ----------
async function renderLive(view) {
  view.innerHTML = loading('Suche Live-Spiele …');
  const load = async () => {
    try {
      const slugs = new Set(activeLeagues().map((l) => l.slug));
      const ids = activeLeagues().map((l) => l.id);
      const [live, sched] = await Promise.all([api.getLive(), api.getSchedule({ leagueIds: ids })]);
      if (state.tab !== 'live') return;
      const liveMatches = live.filter((ev) => ev.type === 'match' && slugs.has(ev.league?.slug));
      const now = Date.now();
      const upcoming = (sched.events || [])
        .filter((ev) => ev.type === 'match' && ev.state === 'unstarted' && new Date(ev.startTime) >= now - 3600e3)
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
        .slice(0, 8);
      const recent = (sched.events || [])
        .filter((ev) => ev.type === 'match' && ev.state === 'completed')
        .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
        .slice(0, 6);

      let html = topBanners();
      html += `<h2 class="section-title"><span class="dot"></span>Jetzt live</h2>`;
      html += liveMatches.length
        ? liveMatches.map((ev) => matchCard(ev, { streams: true })).join('')
        : `<div class="empty compact"><p>Gerade läuft kein Spiel in deiner Auswahl.</p></div>`;
      if (upcoming.length) html += `<h2 class="section-title">Als Nächstes</h2>` + upcoming.map((ev) => matchCard(ev, { showDate: true })).join('');
      if (recent.length) html += `<h2 class="section-title">Zuletzt gespielt</h2>` + recent.map((ev) => matchCard(ev, { showDate: true })).join('');
      html += `<p class="updated">Aktualisiert ${fmtTime.format(new Date())} · automatisch alle 30 s</p>`;
      view.innerHTML = html;
    } catch (err) {
      if (state.tab === 'live') view.innerHTML = errorBox(err);
    }
  };
  await load();
  state.timers.push(setInterval(load, 30_000));
}

// ---------- Spielplan ----------
async function renderSchedule(view) {
  const leagues = activeLeagues();
  const key = leagues.map((l) => l.id).join(',');
  if (!leagues.length) {
    view.innerHTML = `<div class="empty"><p>Keine Ligen ausgewählt.</p></div>`;
    return;
  }
  if (!state.schedule || state.schedule.key !== key) {
    view.innerHTML = loading('Lade Spielplan …');
    try {
      const s = await api.getSchedule({ leagueIds: leagues.map((l) => l.id) });
      state.schedule = { key, events: s.events || [], older: s.pages?.older, newer: s.pages?.newer };
    } catch (err) {
      view.innerHTML = errorBox(err);
      return;
    }
  }
  if (state.tab !== 'schedule') return;
  drawSchedule(view, true);

  // Laufende Spiele regelmäßig aktualisieren
  state.timers.push(
    setInterval(async () => {
      if (!state.schedule?.events.some((e) => e.state === 'inProgress')) return;
      try {
        const s = await api.getSchedule({ leagueIds: leagues.map((l) => l.id) });
        const fresh = new Map((s.events || []).map((e) => [e.match?.id, e]));
        state.schedule.events = state.schedule.events.map((e) => fresh.get(e.match?.id) || e);
        const top = view.scrollTop;
        drawSchedule(view, false);
        view.scrollTop = top;
      } catch {
        /* nächster Versuch */
      }
    }, 60_000)
  );
}

function drawSchedule(view, scrollToNow) {
  const s = state.schedule;
  const events = s.events.filter((e) => e.type === 'match').sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const groups = new Map();
  for (const ev of events) {
    const d = new Date(ev.startTime);
    const k = dayKey(d);
    if (!groups.has(k)) groups.set(k, { date: d, items: [] });
    groups.get(k).items.push(ev);
  }
  const todayKey = dayKey(new Date());
  let html = s.older ? `<button class="btn ghost load" data-page="older">↑ Frühere Spiele laden</button>` : '';
  if (!events.length) html += `<div class="empty"><p>Keine Spiele im Spielplan.</p></div>`;
  for (const [k, g] of groups) {
    html += `<h2 class="day ${k === todayKey ? 'today' : ''}" data-day="${k}">${h(dayLabel(g.date))}<small>${h(fmtDayYear.format(g.date))}</small></h2>`;
    html += g.items.map((ev) => matchCard(ev)).join('');
  }
  if (s.newer) html += `<button class="btn ghost load" data-page="newer">↓ Spätere Spiele laden</button>`;
  view.innerHTML = html;

  if (scrollToNow) {
    const days = [...view.querySelectorAll('.day')];
    const target = days.find((d) => d.dataset.day >= todayKey) || days.at(-1);
    if (target) view.scrollTop = target.offsetTop - view.offsetTop - 8;
  }
}

$('#view').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-page]');
  if (!btn || !state.schedule) return;
  const dir = btn.dataset.page;
  btn.disabled = true;
  btn.textContent = 'Lade …';
  try {
    const leagues = activeLeagues();
    const s = await api.getSchedule({ leagueIds: leagues.map((l) => l.id), pageToken: state.schedule[dir] });
    const known = new Set(state.schedule.events.map((ev) => ev.match?.id + ev.startTime));
    const add = (s.events || []).filter((ev) => !known.has(ev.match?.id + ev.startTime));
    const view = $('#view');
    if (dir === 'older') {
      const prevHeight = view.scrollHeight;
      const prevTop = view.scrollTop;
      state.schedule.events = [...add, ...state.schedule.events];
      state.schedule.older = s.pages?.older;
      drawSchedule(view, false);
      view.scrollTop = prevTop + (view.scrollHeight - prevHeight);
    } else {
      const top = view.scrollTop;
      state.schedule.events = [...state.schedule.events, ...add];
      state.schedule.newer = s.pages?.newer;
      drawSchedule(view, false);
      view.scrollTop = top;
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Fehler – nochmal versuchen';
  }
});

// ---------- Tabellen ----------
async function renderStandings(view) {
  const leagues = activeLeagues();
  if (leagues.length !== 1) {
    view.innerHTML =
      `<h2 class="section-title">Liga / Event wählen</h2><div class="league-grid">` +
      leagues
        .map(
          (l) => `<button class="league-tile" data-pick-league="${h(l.id)}">
            <img src="${h(l.image)}" alt="" loading="lazy"><span>${h(l.name)}</span><small>${h(regionLabel(l.region))}</small></button>`
        )
        .join('') +
      `</div>` +
      (leagues.length ? '' : `<div class="empty"><p>Keine Ligen in dieser Auswahl.</p></div>`);
    return;
  }
  const league = leagues[0];
  const st = state.standings;
  try {
    if (st.leagueId !== league.id) {
      view.innerHTML = loading('Lade Turniere …');
      const tournaments = await api.getTournaments(league.id);
      const current = currentTournament(tournaments);
      Object.assign(st, { leagueId: league.id, tournaments, tournamentId: current?.id, data: null, stageIdx: 0 });
    }
    if (!st.tournamentId) {
      view.innerHTML = `<div class="empty"><p>Für ${h(league.name)} sind keine Turniere verfügbar.</p></div>`;
      return;
    }
    if (!st.data) {
      view.innerHTML = loading('Lade Tabelle …');
      st.data = await api.getStandings(st.tournamentId);
      // Standard: letzte Phase mit Inhalt, die schon begonnen hat
      const stages = st.data.stages || [];
      let idx = 0;
      stages.forEach((s, i) => {
        const started = (s.sections || []).some(
          (sec) => (sec.matches || []).some((m) => m.state !== 'unstarted') || (sec.rankings || []).some((r) => r.teams?.some((t) => t.record && t.record.wins + t.record.losses > 0))
        );
        if (started) idx = i;
      });
      st.stageIdx = idx;
    }
  } catch (err) {
    view.innerHTML = errorBox(err);
    return;
  }
  if (state.tab !== 'standings') return;
  drawStandings(view, league);
}

// Sortiert die Turniere (neueste zuerst) und liefert das laufende bzw. zuletzt begonnene
function currentTournament(tournaments) {
  tournaments.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  const today = dayKey(new Date());
  return (
    tournaments.find((t) => t.startDate <= today && today <= t.endDate) ||
    tournaments.find((t) => t.startDate <= today) ||
    tournaments[tournaments.length - 1]
  );
}

function drawStandings(view, league) {
  const st = state.standings;
  const stages = st.data.stages || [];
  const tSel = `<select id="tournamentSel" class="select">${st.tournaments
    .map((t) => `<option value="${h(t.id)}" ${t.id === st.tournamentId ? 'selected' : ''}>${h(prettySlug(t.slug))}</option>`)
    .join('')}</select>`;
  let html = `<div class="standings-head"><img src="${h(league.image)}" alt=""><div><h2>${h(league.name)}</h2>${tSel}</div></div>`;
  if (stages.length > 1) {
    html += `<div class="segmented">${stages
      .map((s, i) => `<button class="${i === st.stageIdx ? 'active' : ''}" data-stage="${i}">${h(s.name)}</button>`)
      .join('')}</div>`;
  }
  const stage = stages[st.stageIdx];
  if (!stage) html += `<div class="empty"><p>Noch keine Tabelle verfügbar.</p></div>`;
  for (const sec of stage?.sections || []) {
    const rankings = (sec.rankings || []).filter((r) => r.teams?.length);
    if (sec.name && (stage.sections.length > 1 || rankings.length)) html += `<h3 class="sub">${h(sec.name)}</h3>`;
    if (rankings.length) {
      html += `<table class="table"><thead><tr><th>#</th><th>Team</th><th>S–N</th><th>%</th></tr></thead><tbody>`;
      for (const r of rankings) {
        for (const t of r.teams) {
          const w = t.record?.wins ?? 0;
          const l = t.record?.losses ?? 0;
          const pct = w + l ? Math.round((w / (w + l)) * 100) : 0;
          html += `<tr><td class="rank">${r.ordinal}</td>
            <td class="t"><img src="${h(t.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span>${h(t.name)}</span><small>${h(t.code)}</small></td>
            <td class="rec">${w}–${l}</td><td class="pct"><span class="bar"><i style="width:${pct}%"></i></span></td></tr>`;
        }
      }
      html += `</tbody></table>`;
    } else if ((sec.matches || []).length) {
      html += sec.matches.map((m) => bracketMatch(m)).join('');
    }
  }
  view.innerHTML = html;
  $('#tournamentSel').addEventListener('change', (e) => {
    st.tournamentId = e.target.value;
    st.data = null;
    renderStandings(view);
  });
}

function bracketMatch(m) {
  const teams = m.teams || [];
  const done = m.state === 'completed';
  const live = m.state === 'inProgress';
  const row = (t) => `<div class="team ${t.result?.outcome === 'win' ? 'win' : ''} ${t.result?.outcome === 'loss' ? 'lose' : ''}">
    <img src="${h(t.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
    <span class="name">${h(t.name || 'TBD')}</span><span class="score">${done || live ? h(t.result?.gameWins ?? 0) : ''}</span></div>`;
  return `<article class="match bracket ${live ? 'is-live' : ''}" data-match="${h(m.id)}">
    <header><span class="block">${live ? '<span class="pill live">LIVE</span>' : done ? 'Beendet' : 'Ausstehend'}</span></header>
    ${teams.length ? teams.map(row).join('') : '<div class="team"><span class="name">TBD vs. TBD</span></div>'}</article>`;
}

function prettySlug(slug = '') {
  return slug
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

$('#view').addEventListener('click', async (e) => {
  if (e.target.closest('[data-open-tracked]') && state.tracked) {
    openMatch(state.tracked);
    return;
  }
  if (e.target.closest('[data-stop-tracked]') && Tracker) {
    await Tracker.stop().catch(() => {});
    state.tracked = null;
    state.trackedScheduled = false;
    renderTab();
    return;
  }
  const pick = e.target.closest('[data-pick-league]');
  if (pick) {
    state.league = pick.dataset.pickLeague;
    onFilterChange();
    return;
  }
  const stage = e.target.closest('[data-stage]');
  if (stage) {
    state.standings.stageIdx = Number(stage.dataset.stage);
    const league = state.leaguesById.get(state.standings.leagueId);
    drawStandings($('#view'), league);
  }
});

// ---------- Match-Details (Bottom Sheet) ----------
const sheet = $('#sheet');
let sheetTimer = null;
let sheetState = null;

function closeSheet() {
  sheet.classList.remove('open');
  clearInterval(sheetTimer);
  sheetTimer = null;
  sheetState = null;
  if (location.hash.startsWith('#match')) history.back();
}
$('#sheetBackdrop').addEventListener('click', closeSheet);
window.addEventListener('popstate', () => {
  if (sheet.classList.contains('open') && !location.hash.startsWith('#match')) {
    sheet.classList.remove('open');
    clearInterval(sheetTimer);
    sheetState = null;
  }
});

async function openMatch(matchId) {
  const body = $('#sheetBody');
  body.innerHTML = loading('Lade Match …');
  sheet.classList.add('open');
  if (!location.hash.startsWith('#match')) history.pushState(null, '', '#match');
  clearInterval(sheetTimer);
  try {
    const event = await api.getEventDetails(matchId);
    const games = (event.match?.games || []).filter((g) => g.state !== 'unneeded');
    const liveIdx = games.findIndex((g) => g.state === 'inProgress');
    const lastDone = games.map((g) => g.state).lastIndexOf('completed');
    sheetState = { matchId, event, games, gameIdx: liveIdx >= 0 ? liveIdx : Math.max(lastDone, 0) };
    drawMatch();
    sheetTimer = setInterval(refreshMatch, 10_000);
  } catch (err) {
    body.innerHTML = errorBox(err);
  }
}

async function refreshMatch() {
  if (!sheetState) return;
  const g = sheetState.games[sheetState.gameIdx];
  const anyLive = sheetState.games.some((x) => x.state === 'inProgress');
  if (!anyLive && g?.state !== 'inProgress') return;
  try {
    const event = await api.getEventDetails(sheetState.matchId);
    if (!sheetState) return;
    sheetState.event = event;
    sheetState.games = (event.match?.games || []).filter((x) => x.state !== 'unneeded');
    drawMatch(true);
  } catch {
    /* nächster Versuch */
  }
}

function drawMatch(keepStats = false) {
  const { event, games, gameIdx } = sheetState;
  const m = event.match || {};
  const teams = m.teams || [];
  const league = state.leaguesBySlug.get(event.league?.slug) || event.league || {};
  const live = games.some((g) => g.state === 'inProgress');
  const [a, b] = teams;
  const head = `<div class="mh">
    <div class="mh-league"><img src="${h(league.image)}" alt="">${h(league.name || '')} · ${h(event.tournament?.name || '')}${
      m.strategy?.count ? ' · Bo' + m.strategy.count : ''
    }</div>
    <div class="mh-teams">
      ${teamBig(a)}
      <div class="mh-score">${h(a?.result?.gameWins ?? 0)} : ${h(b?.result?.gameWins ?? 0)}${live ? '<span class="pill live">LIVE</span>' : ''}</div>
      ${teamBig(b)}
    </div>
    <div class="mh-actions">
      ${trackButton(m, games)}
      ${live && league.slug ? `<a class="btn ghost" href="https://lolesports.com/live/${h(league.slug)}" target="_blank" rel="noopener">▶ Stream</a>` : ''}
    </div>
    ${live ? germanStreamButtons() : ''}
  </div>`;
  const tabs = games.length
    ? `<div class="segmented">${games
        .map(
          (g, i) =>
            `<button class="${i === gameIdx ? 'active' : ''}" data-game="${i}">Spiel ${g.number}${g.state === 'inProgress' ? ' ●' : ''}</button>`
        )
        .join('')}</div>`
    : '';
  const prevStats = keepStats ? $('#gameStats')?.innerHTML : null;
  $('#sheetBody').innerHTML = `<button class="close" aria-label="Schließen">✕</button>${head}${tabs}<div id="gameStats">${prevStats || ''}</div>`;
  $('#sheetBody .close').addEventListener('click', closeSheet);
  loadGameStats();
}

// ---------- Verfolgen (Sperrbildschirm & Widget) ----------
function seriesFinished(m, games) {
  const count = m.strategy?.count || 1;
  const needed = Math.floor(count / 2) + 1;
  const wins = (m.teams || []).map((t) => t.result?.gameWins ?? 0);
  if (wins.some((w) => w >= needed)) return true;
  return games.length > 0 && games.every((g) => g.state === 'completed' || g.state === 'unneeded');
}

function trackButton(m, games) {
  if (seriesFinished(m, games)) return '';
  if (!Tracker) {
    if (!/Android/i.test(navigator.userAgent)) return '';
    return `<a class="btn ghost" href="${APK_URL}" title="Android-App herunterladen">📌 Live auf dem Sperrbildschirm: Android-App</a>`;
  }
  if (state.tracked === sheetState.matchId) {
    return state.trackedScheduled
      ? `<button class="btn tracking" data-track="stop">📌 Vorgemerkt – löschen</button>`
      : `<button class="btn tracking" data-track="stop">📌 Wird verfolgt – beenden</button>`;
  }
  const start = state.startTimes.get(sheetState.matchId);
  const live = games.some((g) => g.state === 'inProgress' || g.state === 'completed');
  const until = start ? new Date(start) - Date.now() : 0;
  if (!live && until > 24 * 60 * 60_000) {
    return `<button class="btn ghost" disabled>📌 Vormerken ab 24 h vor Start</button>`;
  }
  return `<button class="btn" data-track="start">📌 ${!live && until > 20 * 60_000 ? 'Vormerken' : 'Verfolgen'}</button>`;
}

async function toggleTracking(action) {
  if (!Tracker || !sheetState) return;
  try {
    if (action === 'start') {
      const start = state.startTimes.get(sheetState.matchId);
      const teams = sheetState.event.match?.teams || [];
      const res = await Tracker.start({
        matchId: sheetState.matchId,
        startTime: start ? new Date(start).getTime() : 0,
        teamA: teams[0]?.code || teams[0]?.name || '',
        teamB: teams[1]?.code || teams[1]?.name || '',
        league: sheetState.event.league?.name || '',
      });
      state.tracked = sheetState.matchId;
      state.trackedScheduled = !!res?.scheduled;
      toast(
        state.trackedScheduled
          ? `📌 Vorgemerkt – der Live-Stand startet 15 Min. vor Beginn (${fmtDay.format(new Date(start))}, ${fmtTime.format(new Date(start))} Uhr)`
          : '📌 Stand erscheint jetzt in der Benachrichtigung und im Widget'
      );
    } else {
      await Tracker.stop();
      toast(state.trackedScheduled ? 'Vormerkung gelöscht' : 'Verfolgung beendet');
      state.tracked = null;
      state.trackedScheduled = false;
    }
  } catch (err) {
    toast(err.message || String(err));
  }
  if (sheetState) drawMatch(true);
}

async function refreshTracked() {
  if (!Tracker) return;
  try {
    const s = await Tracker.getStatus();
    state.tracked = s.matchId || null;
    state.trackedScheduled = !!s.scheduled;
    return s;
  } catch {
    return null;
  }
}

function topBanners() {
  let html = '';
  if (state.update) {
    html += `<a class="banner update" href="${APK_URL}">⬇ Neue Version ${h(state.update)} verfügbar – jetzt herunterladen</a>`;
  }
  if (state.tracked) {
    html += `<div class="banner"><span>📌 ${
      state.trackedScheduled ? 'Match vorgemerkt – Live-Stand startet 15 Min. vor Beginn' : 'Du verfolgst ein Match auf dem Sperrbildschirm'
    }</span><button data-open-tracked>Öffnen</button><button data-stop-tracked>${state.trackedScheduled ? 'Löschen' : 'Beenden'}</button></div>`;
  }
  return html;
}

async function checkForUpdate(versionCode) {
  if (!versionCode) return;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    const rel = await res.json();
    const build = Number(String(rel.tag_name || '').replace(/^build-/, ''));
    if (build > versionCode) {
      state.update = `1.0.${build}`;
      if (state.tab === 'live') renderTab();
    }
  } catch {
    /* kein Update-Check möglich */
  }
}

let toastTimer;
function toast(msg) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

function teamBig(t) {
  if (!t) return `<div class="mh-team"><span>TBD</span></div>`;
  return `<div class="mh-team ${t.result?.outcome === 'win' ? 'win' : ''}"><img src="${h(t.image)}" alt="" onerror="this.style.visibility='hidden'"><span>${h(
    t.code || t.name
  )}</span><small>${h(t.name)}</small></div>`;
}

$('#sheetBody').addEventListener('click', (e) => {
  const track = e.target.closest('[data-track]');
  if (track) {
    toggleTracking(track.dataset.track);
    return;
  }
  const btn = e.target.closest('[data-game]');
  if (!btn || !sheetState) return;
  sheetState.gameIdx = Number(btn.dataset.game);
  drawMatch();
});

async function loadGameStats() {
  const box = $('#gameStats');
  const st = sheetState;
  const game = st.games[st.gameIdx];
  if (!game) {
    box.innerHTML = `<div class="empty compact"><p>Noch keine Spiele.</p></div>`;
    return;
  }
  if (game.state === 'unstarted') {
    box.innerHTML = `<div class="empty compact"><p>Spiel ${game.number} hat noch nicht begonnen.</p></div>`;
    return;
  }
  if (!box.innerHTML) box.innerHTML = loading('Lade Spielstatistik …');
  try {
    const [win, det] = await Promise.all([api.getGameWindow(game.id), api.getGameDetails(game.id)]);
    if (sheetState !== st || st.games[st.gameIdx]?.id !== game.id) return;
    box.innerHTML = gameStatsHtml(win, det, st.event.match?.teams || []);
  } catch (err) {
    box.innerHTML = `<div class="empty compact"><p>Live-Statistik nicht verfügbar.</p><small>${h(err.message)}</small></div>`;
  }
}

const ROLE = { top: 'Top', jungle: 'Jgl', mid: 'Mid', bottom: 'Bot', support: 'Sup' };
const DRAKE = { ocean: '🌊', infernal: '🔥', mountain: '⛰️', cloud: '🌪️', hextech: '⚡', chemtech: '🧪', elder: '🐉' };

function gameStatsHtml(win, det, teams) {
  const frame = win?.frames?.at(-1);
  if (!win || !frame) return `<div class="empty compact"><p>Für dieses Spiel liegen keine Live-Daten vor.</p></div>`;
  const meta = win.gameMetadata;
  const patch = (meta.patchVersion || '').split('.');
  const ddVersion = patch.length >= 2 ? `${patch[0]}.${patch[1]}.1` : null;
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const blueT = teamById.get(meta.blueTeamMetadata.esportsTeamId) || {};
  const redT = teamById.get(meta.redTeamMetadata.esportsTeamId) || {};
  const B = frame.blueTeam;
  const R = frame.redTeam;
  const totalGold = (B.totalGold || 0) + (R.totalGold || 0) || 1;
  const bluePct = ((B.totalGold || 0) / totalGold) * 100;
  const diff = (B.totalGold || 0) - (R.totalGold || 0);
  const stateTxt = { in_game: 'Läuft', paused: 'Pausiert', finished: 'Beendet' }[frame.gameState] || frame.gameState;

  const statRow = (label, bv, rv) => `<div class="srow"><span>${bv}</span><label>${label}</label><span>${rv}</span></div>`;
  const drakes = (arr) => (arr || []).map((d) => DRAKE[d] || '🐲').join('') || '–';

  const detFrame = det?.frames?.at(-1);
  const pStats = new Map((detFrame?.participants || []).map((p) => [p.participantId, p]));
  const playerRows = (md) =>
    md.participantMetadata
      .map((p) => {
        const s = pStats.get(p.participantId) || {};
        const img = ddVersion ? `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${encodeURIComponent(p.championId)}.png` : '';
        return `<div class="player">
          <img src="${h(img)}" alt="${h(p.championId)}" loading="lazy" onerror="this.style.visibility='hidden'">
          <div class="pn"><b>${h(p.summonerName)}</b><small>${h(ROLE[p.role] || p.role || '')} · ${h(p.championId)}${s.level ? ' · Lvl ' + s.level : ''}</small></div>
          <div class="kda">${s.kills ?? '–'}/${s.deaths ?? '–'}/${s.assists ?? '–'}<small>${s.creepScore ?? '–'} CS · ${kFmt(s.totalGoldEarned)}</small></div>
        </div>`;
      })
      .join('');

  return `<div class="gs">
    <div class="gs-state">${h(stateTxt)} · Patch ${h(meta.patchVersion?.split('.').slice(0, 2).join('.') || '?')}</div>
    <div class="gs-teams"><span class="blue">${h(blueT.code || 'Blau')}</span><span class="kills">${B.totalKills} – ${R.totalKills}</span><span class="red">${h(redT.code || 'Rot')}</span></div>
    <div class="goldbar"><i style="width:${bluePct}%"></i></div>
    <div class="golddiff">${diff === 0 ? 'Gold gleich' : `${diff > 0 ? h(blueT.code || 'Blau') : h(redT.code || 'Rot')} +${kFmt(Math.abs(diff))} Gold`}</div>
    <div class="stats">
      ${statRow('Gold', kFmt(B.totalGold), kFmt(R.totalGold))}
      ${statRow('Türme', B.towers, R.towers)}
      ${statRow('Inhibitoren', B.inhibitors, R.inhibitors)}
      ${statRow('Barons', B.barons, R.barons)}
      ${statRow('Drachen', drakes(B.dragons), drakes(R.dragons))}
    </div>
    <h3 class="sub blue">${h(blueT.name || 'Blaue Seite')}</h3>${playerRows(meta.blueTeamMetadata)}
    <h3 class="sub red">${h(redT.name || 'Rote Seite')}</h3>${playerRows(meta.redTeamMetadata)}
  </div>`;
}

// ---------- Teams ----------
const isRealTeam = (t) => t && t.id && t.id !== '0' && t.name && !/^tbd$/i.test(t.name);

// Teams einer Liga aus den Tabellen des aktuellen (sonst vorherigen) Turniers
async function loadLeagueTeams(league) {
  if (state.teamsByLeague.has(league.id)) return state.teamsByLeague.get(league.id);
  const tournaments = await api.getTournaments(league.id);
  const current = currentTournament(tournaments);
  const candidates = [current, ...tournaments.filter((t) => t !== current)].filter(Boolean).slice(0, 3);
  let teams = [];
  for (const t of candidates) {
    const standings = await api.getStandings(t.id);
    const found = new Map();
    for (const stage of standings.stages || []) {
      for (const sec of stage.sections || []) {
        for (const r of sec.rankings || []) {
          for (const team of r.teams || []) {
            if (isRealTeam(team)) found.set(team.id, { ...found.get(team.id), ...team });
          }
        }
        for (const m of sec.matches || []) {
          for (const team of m.teams || []) {
            if (isRealTeam(team) && !found.has(team.id)) found.set(team.id, team);
          }
        }
      }
    }
    const byName = new Map();
    for (const t of found.values()) if (!byName.has(t.name)) byName.set(t.name, t);
    teams = [...byName.values()];
    if (teams.length) break;
  }
  teams.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  state.teamsByLeague.set(league.id, teams);
  return teams;
}

async function renderTeams(view) {
  const leagues = activeLeagues();
  if (leagues.length !== 1) {
    view.innerHTML =
      `<h2 class="section-title">Liga / Event wählen</h2><div class="league-grid">` +
      leagues
        .map(
          (l) => `<button class="league-tile" data-pick-league="${h(l.id)}">
            <img src="${h(l.image)}" alt="" loading="lazy"><span>${h(l.name)}</span><small>${h(regionLabel(l.region))}</small></button>`
        )
        .join('') +
      `</div>` +
      (leagues.length ? '' : `<div class="empty"><p>Keine Ligen in dieser Auswahl.</p></div>`);
    return;
  }
  const league = leagues[0];
  if (!state.teamsByLeague.has(league.id)) view.innerHTML = loading('Lade Teams …');
  let teams;
  try {
    teams = await loadLeagueTeams(league);
  } catch (err) {
    view.innerHTML = errorBox(err);
    return;
  }
  if (state.tab !== 'teams' || activeLeagues()[0]?.id !== league.id) return;
  let html = `<div class="standings-head"><img src="${h(league.image)}" alt=""><div><h2>${h(league.name)}</h2><small class="muted">${teams.length} Teams</small></div></div>`;
  if (!teams.length) html += `<div class="empty"><p>Für ${h(league.name)} sind gerade keine Teams verfügbar.</p></div>`;
  html += `<div class="team-grid">${teams
    .map(
      (t) => `<button class="team-tile" data-team="${h(t.slug || t.id)}">
        <img src="${h(t.image)}" alt="" loading="lazy">
        <span>${h(t.name)}</span>
        <small>${h(t.code || '')}${t.record ? ` · ${t.record.wins}–${t.record.losses}` : ''}</small></button>`
    )
    .join('')}</div>`;
  view.innerHTML = html;
}

$('#view').addEventListener('click', (e) => {
  const tile = e.target.closest('[data-team]');
  if (!tile) return;
  const league = activeLeagues()[0];
  const team = (state.teamsByLeague.get(league?.id) || []).find((t) => (t.slug || t.id) === tile.dataset.team);
  if (team) openTeam(team, league);
});

// Team-Detail (eigenes Sheet, damit ein Match darüber geöffnet werden kann)
const teamSheet = $('#teamSheet');
let teamToken = 0;

function closeTeam() {
  teamSheet.classList.remove('open');
  teamToken++;
  if (location.hash.startsWith('#team')) history.back();
}
$('#teamBackdrop').addEventListener('click', closeTeam);
window.addEventListener('popstate', () => {
  if (teamSheet.classList.contains('open') && !location.hash.startsWith('#team') && !location.hash.startsWith('#match')) {
    teamSheet.classList.remove('open');
    teamToken++;
  }
});
$('#teamBody').addEventListener('click', (e) => {
  if (e.target.closest('.close')) return closeTeam();
  const m = e.target.closest('[data-match]');
  if (m && m.dataset.match) openMatch(m.dataset.match);
});

const ROLE_ORDER = ['top', 'jungle', 'mid', 'bottom', 'support'];
const ROLE_NAME = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bottom: 'Bot', support: 'Support', none: 'Ersatz / Staff' };

const sameTeam = (a, team) =>
  !!a && ((a.code && team.code && a.code.toLowerCase() === team.code.toLowerCase()) || (a.name && a.name === team.name));

async function openTeam(team, contextLeague) {
  const token = ++teamToken;
  const body = $('#teamBody');
  body.innerHTML = `<button class="close" aria-label="Schließen">✕</button>${teamHead(team, null)}${loading('Lade Kader und Ergebnisse …')}`;
  teamSheet.classList.add('open');
  if (!location.hash.startsWith('#team')) history.pushState(null, '', '#team');

  try {
    const details = await api.getTeam(team.slug || team.id).catch(() => null);
    if (token !== teamToken) return;
    const full = { ...team, ...(details || {}) };

    // Spiele aus der Liga, in der das Team angezeigt wird, plus seiner Heimatliga
    const leagueIds = new Set([contextLeague?.id].filter(Boolean));
    const home = details?.homeLeague?.name && state.leagues.find((l) => l.name === details.homeLeague.name);
    if (home) leagueIds.add(home.id);
    const { results, upcoming } = await loadTeamMatches(full, [...leagueIds]);
    if (token !== teamToken) return;

    body.innerHTML = `<button class="close" aria-label="Schließen">✕</button>${teamHead(full, details)}${rosterHtml(details)}${formHtml(full, results)}${
      upcoming.length ? `<h3 class="sub">Nächste Spiele</h3>` + upcoming.map((ev) => matchCard(ev, { showDate: true })).join('') : ''
    }<h3 class="sub">Letzte Ergebnisse</h3>${
      results.length ? results.map((ev) => resultRow(ev, full)).join('') : `<div class="empty compact"><p>Keine Ergebnisse gefunden.</p></div>`
    }`;
  } catch (err) {
    if (token === teamToken) body.innerHTML = `<button class="close" aria-label="Schließen">✕</button>${teamHead(team, null)}${errorBox(err)}`;
  }
}

async function loadTeamMatches(team, leagueIds) {
  const s = await api.getSchedule({ leagueIds });
  let events = s.events || [];
  let older = s.pages?.older;
  const mine = () => events.filter((ev) => ev.type === 'match' && (ev.match?.teams || []).some((t) => sameTeam(t, team)));
  // Bei Bedarf ältere Seiten nachladen, bis 10 Ergebnisse da sind
  for (let i = 0; i < 4 && older && mine().filter((ev) => ev.state === 'completed').length < 10; i++) {
    const page = await api.getSchedule({ leagueIds, pageToken: older });
    events = [...(page.events || []), ...events];
    older = page.pages?.older;
  }
  const seen = new Set();
  const list = mine().filter((ev) => {
    const key = ev.match?.id || ev.startTime;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const results = list
    .filter((ev) => ev.state === 'completed')
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    .slice(0, 10);
  const upcoming = list
    .filter((ev) => ev.state !== 'completed')
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .slice(0, 3);
  return { results, upcoming };
}

function teamHead(team, details) {
  const home = details?.homeLeague;
  return `<div class="th">
    <img src="${h(team.image)}" alt="">
    <div><h2>${h(team.name)}</h2>
    <small>${h(team.code || '')}${home?.name ? ` · ${h(home.name)}` : ''}${home?.region ? ` (${h(regionLabel(home.region))})` : ''}</small></div>
  </div>`;
}

function rosterHtml(details) {
  const players = details?.players || [];
  if (!players.length) return `<h3 class="sub">Kader</h3><div class="empty compact"><p>Kein Kader verfügbar.</p></div>`;
  const rank = (p) => {
    const i = ROLE_ORDER.indexOf(p.role);
    return i < 0 ? 99 : i;
  };
  const sorted = [...players].sort((a, b) => rank(a) - rank(b) || (a.summonerName || '').localeCompare(b.summonerName || ''));
  return (
    `<h3 class="sub">Aktueller Kader</h3><div class="roster">` +
    sorted
      .map((p) => {
        const real = [p.firstName, p.lastName].filter(Boolean).join(' ');
        return `<div class="player">
          <img src="${h(p.image)}" alt="" loading="lazy">
          <div class="pn"><b>${h(p.summonerName)}</b><small>${h(real)}</small></div>
          <span class="role role-${h(p.role || 'none')}">${h(ROLE_NAME[p.role] || p.role || 'Ersatz / Staff')}</span>
        </div>`;
      })
      .join('') +
    `</div>`
  );
}

function outcomeFor(ev, team) {
  const me = (ev.match?.teams || []).find((t) => sameTeam(t, team));
  return me?.result?.outcome; // 'win' | 'loss' | undefined
}

function formHtml(team, results) {
  if (!results.length) return '';
  const outcomes = results.map((ev) => outcomeFor(ev, team));
  const w = outcomes.filter((o) => o === 'win').length;
  const l = outcomes.filter((o) => o === 'loss').length;
  return `<h3 class="sub">Form (letzte ${results.length})</h3>
    <div class="form"><div class="dots">${outcomes
      .map((o) => `<span class="fdot ${o === 'win' ? 'w' : o === 'loss' ? 'l' : ''}">${o === 'win' ? 'S' : o === 'loss' ? 'N' : '–'}</span>`)
      .join('')}</div><b>${w} S – ${l} N</b></div>`;
}

function resultRow(ev, team) {
  const teams = ev.match?.teams || [];
  const me = teams.find((t) => sameTeam(t, team)) || teams[0] || {};
  const opp = teams.find((t) => t !== me) || {};
  const outcome = me.result?.outcome;
  const league = leagueOf(ev);
  const d = new Date(ev.startTime);
  return `<button class="result" data-match="${h(ev.match?.id || '')}">
    <span class="badge ${outcome === 'win' ? 'w' : outcome === 'loss' ? 'l' : ''}">${outcome === 'win' ? 'S' : outcome === 'loss' ? 'N' : '–'}</span>
    <span class="score">${h(me.result?.gameWins ?? 0)} : ${h(opp.result?.gameWins ?? 0)}</span>
    <span class="opp"><img src="${h(opp.image)}" alt="" loading="lazy"><span>vs ${h(opp.name || 'TBD')}</span></span>
    <span class="meta">${h(fmtDay.format(d))}<small>${h(league.name || ev.league?.name || '')}</small></span>
  </button>`;
}

// ---------- Favoriten-Verwaltung ----------
const favSheet = $('#favSheet');
$('#favBtn').addEventListener('click', () => {
  drawFavs();
  favSheet.classList.add('open');
});
$('#favBackdrop').addEventListener('click', () => {
  favSheet.classList.remove('open');
  renderFilters();
  if (state.region === 'fav') onFilterChange();
});
function drawFavs() {
  let html = `<h2>Ligen & Favoriten</h2><p class="hint">Markierte Ligen erscheinen unter „★ Favoriten“.</p>`;
  for (const r of regions()) {
    html += `<h3 class="sub">${h(r)}</h3>`;
    html += regionLeagues(r)
      .map(
        (l) => `<button class="fav-row" data-fav="${h(l.id)}"><img src="${h(l.image)}" alt="" loading="lazy"><span>${h(l.name)}</span>
        <b class="${state.favorites.has(l.id) ? 'on' : ''}">${state.favorites.has(l.id) ? '★' : '☆'}</b></button>`
      )
      .join('');
  }
  $('#favBody').innerHTML = html;
}
$('#favBody').addEventListener('click', (e) => {
  const row = e.target.closest('[data-fav]');
  if (!row) return;
  const id = row.dataset.fav;
  state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
  persist();
  const star = row.querySelector('b');
  star.textContent = state.favorites.has(id) ? '★' : '☆';
  star.classList.toggle('on', state.favorites.has(id));
});

// Fehlende/kaputte Logos unsichtbar machen statt Platzhalter-Symbol zu zeigen
document.addEventListener(
  'error',
  (e) => {
    if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden';
  },
  true
);

// ---------- Start ----------
async function init() {
  $('#view').innerHTML = loading('Lade Ligen …');
  try {
    const leagues = await api.getLeagues();
    state.leagues = leagues
      .filter((l) => l.displayPriority?.status !== 'hidden')
      .sort((a, b) => (a.displayPriority?.position ?? a.priority ?? 999) - (b.displayPriority?.position ?? b.priority ?? 999));
    state.leagues.forEach((l) => {
      state.leaguesById.set(l.id, l);
      state.leaguesBySlug.set(l.slug, l);
    });
  } catch (err) {
    $('#view').innerHTML = errorBox(err);
    return;
  }
  if (state.region !== 'all' && state.region !== 'fav' && !regions().includes(state.region)) state.region = 'all';
  if (state.league && !state.leaguesById.has(state.league)) state.league = null;
  renderFilters();

  if (Tracker) {
    const status = await refreshTracked();
    checkForUpdate(status?.versionCode);
    Tracker.addListener('openMatch', (d) => d?.matchId && openMatch(d.matchId));
    Tracker.consumeLaunchMatch()
      .then((d) => d?.matchId && openMatch(d.matchId))
      .catch(() => {});
  }
  renderTab();
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !state.leagues.length) return;
  await refreshTracked();
  if (state.tab === 'live') renderTab();
});

if (!Native && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

init();
