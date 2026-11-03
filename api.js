// Zugriff auf die (inoffizielle, öffentliche) LoL-Esports-API, die auch lolesports.com nutzt.
const API_BASE = 'https://esports-api.lolesports.com/persisted/gw';
const FEED_BASE = 'https://feed.lolesports.com/livestats/v1';
const API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z'; // öffentlicher Key von lolesports.com
const HL = 'de-DE';

async function get(path, params = {}) {
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set('hl', HL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { 'x-api-key': API_KEY } });
  if (!res.ok) throw new Error(`API ${path}: HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function getLeagues() {
  const data = await get('getLeagues');
  return data.leagues || [];
}

export async function getSchedule({ leagueIds = [], pageToken } = {}) {
  const data = await get('getSchedule', {
    leagueId: leagueIds.join(','),
    pageToken,
  });
  return data.schedule || { events: [], pages: {} };
}

export async function getLive() {
  const data = await get('getLive');
  return (data.schedule && data.schedule.events) || [];
}

export async function getTournaments(leagueId) {
  const data = await get('getTournamentsForLeague', { leagueId });
  const league = (data.leagues || [])[0];
  return (league && league.tournaments) || [];
}

export async function getStandings(tournamentId) {
  const data = await get('getStandings', { tournamentId });
  return (data.standings || [])[0] || { stages: [] };
}

export async function getEventDetails(matchId) {
  const data = await get('getEventDetails', { id: matchId });
  return data.event;
}

// Live-Feed verlangt einen Startzeitpunkt, der auf 10 s gerundet ist und etwas
// in der Vergangenheit liegt.
function feedStartTime() {
  const d = new Date(Date.now() - 60_000);
  d.setMilliseconds(0);
  d.setSeconds(d.getSeconds() - (d.getSeconds() % 10));
  return d.toISOString();
}

async function feed(kind, gameId) {
  const url = `${FEED_BASE}/${kind}/${gameId}?startingTime=${encodeURIComponent(feedStartTime())}`;
  const res = await fetch(url);
  if (res.status === 204 || res.status === 404) return null; // noch keine Daten
  if (!res.ok) throw new Error(`Feed ${kind}: HTTP ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const getGameWindow = (gameId) => feed('window', gameId);
export const getGameDetails = (gameId) => feed('details', gameId);
