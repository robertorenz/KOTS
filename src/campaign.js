// Career mode: pilot records, the calendar, aces, promotions, medals and the moving front.
import { ACES, NATIONS, RANK_SCORE, FRONT_KEYS, ARMISTICE, aceVictoriesAt, availablePlayerTypes, AIRCRAFT } from './data.js';
import { AIRFIELDS } from './world.js';
import { addDays, yearFrac, fmtDate, interpKeys, pick, randInt, chance, clamp } from './util.js';

const KEY = 'kots.pilots.v1';
const SETTINGS_KEY = 'kots.settings.v1';

export function loadPilots() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export function savePilots(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}
export function savePilot(p) {
  const list = loadPilots();
  const i = list.findIndex((x) => x.id === p.id);
  if (i >= 0) list[i] = p; else list.push(p);
  savePilots(list);
}
export function deletePilot(id) { savePilots(loadPilots().filter((p) => p.id !== id)); }

export const DEFAULT_SETTINGS = {
  unlimitedAmmo: false, noJams: false, invulnerable: false, easyFlight: false, easyLanding: false,
  indicator: true, invertPitch: false, volume: 0.7, clouds: 0.5, units: 'auto', startOnRunway: false, difficulty: 3,
};
export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function realismFactor(s) {
  let f = 1;
  if (s.unlimitedAmmo) f -= 0.15;
  if (s.noJams) f -= 0.1;
  if (s.invulnerable) f -= 0.5;
  if (s.easyFlight) f -= 0.1;
  if (s.easyLanding) f -= 0.05;
  if (s.indicator) f -= 0.05;
  f *= 0.6 + (s.difficulty - 1) * 0.2;
  return Math.max(0.1, Math.round(f * 100) / 100);
}

export function newPilot(name, nation) {
  const N = NATIONS[nation];
  const yf = yearFrac(N.start);
  const home = pick(AIRFIELDS.filter((a) => a.side === 'A'));
  const types = availablePlayerTypes(nation, yf);
  return {
    id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
    name, nation, unit: pick(N.units), homeId: home.id,
    rank: 0, score: 0, victories: 0, unconfirmed: 0, balloons: 0, groundTargets: 0, missions: 0, successes: 0,
    date: N.start, created: N.start, status: 'active', medals: [], log: [], aceKills: [], aceFates: {},
    frontInfluence: 0, aircraft: types[types.length - 1], wounds: 0,
  };
}

export function pilotRank(p) { return NATIONS[p.nation].ranks[p.rank]; }
export function pilotService(p) { return NATIONS[p.nation].service(yearFrac(p.date)); }
export function homeField(p) { return AIRFIELDS.find((a) => a.id === p.homeId) || AIRFIELDS[0]; }

export function frontShift(p) {
  const yf = yearFrac(p.date);
  return interpKeys(FRONT_KEYS, yf) + p.frontInfluence;
}

export function aceStatus(p, ace) {
  const yf = yearFrac(p.date);
  if (p.aceKills.includes(ace.id)) return { state: 'shot down by you', alive: false };
  const fate = p.aceFates[ace.id];
  if (fate) return { state: fate, alive: false };
  if (yf < ace.from) return { state: 'not yet at the front', alive: false };
  if (yf > ace.to) return { state: ace.to < 1918.85 ? 'killed in action' : 'survived the war', alive: false };
  return { state: 'active', alive: true };
}
export function activeAces(p) { return ACES.filter((a) => aceStatus(p, a).alive); }

export function availableAircraft(p) { return availablePlayerTypes(p.nation, yearFrac(p.date)); }

export function pickMissionType(p) {
  const yf = yearFrac(p.date);
  const pool = ['patrol', 'patrol', 'patrol', 'balloon', 'escort', 'intercept', 'ground'];
  if (yf > 1917.6) pool.push('ground');
  if (p.victories >= 3 && activeAces(p).length) pool.push('ace');
  if (p.victories >= 8 && activeAces(p).length) pool.push('ace');
  return pick(pool);
}

/**
 * Apply a mission result to the pilot. Returns { news[], promotion, medals[], ended }
 */
export function applyResult(p, res, settings) {
  const out = { news: [], promotion: null, medals: [], ended: null };
  const N = NATIONS[p.nation];
  const today = p.date;
  p.missions++;
  if (res.success) p.successes++;
  const conf = res.kills.filter((k) => k.confirmed);
  p.victories += conf.length;
  p.unconfirmed += res.kills.length - conf.length;
  p.balloons += res.balloons;
  p.groundTargets += res.targets;
  for (const k of conf) if (k.ace && !p.aceKills.includes(k.ace)) p.aceKills.push(k.ace);
  p.score += res.score;
  p.frontInfluence = clamp(p.frontInfluence + (res.success ? 120 : -80), -1500, 1500);

  const entry = `${fmtDate(today)} - ${res.title}: ${res.success ? 'success' : 'failure'}. ${res.summary}`;
  p.log.unshift(entry);
  p.log = p.log.slice(0, 60);

  // fate of the pilot
  if (res.outcome === 'killed') { p.status = 'killed'; out.ended = 'killed'; }
  else if (res.outcome === 'captured') { p.status = 'captured'; out.ended = 'captured'; }

  // promotion
  if (!out.ended) {
    while (p.rank < RANK_SCORE.length - 1 && p.score >= RANK_SCORE[p.rank + 1]) {
      p.rank++;
      out.promotion = N.ranks[p.rank];
    }
    for (const md of N.medals) {
      if (!p.medals.includes(md.id) && p.victories >= md.victories) {
        p.medals.push(md.id);
        out.medals.push(md);
      }
    }
  }

  // advance the calendar
  let days = randInt(3, 6);
  if (res.outcome === 'wounded') { days += randInt(14, 35); out.news.push(`You spend ${days} days recovering in hospital.`); p.wounds++; }
  const before = yearFrac(p.date);
  p.date = addDays(p.date, days);
  const after = yearFrac(p.date);

  // historical ace fates during the interval
  for (const a of ACES) {
    if (p.aceKills.includes(a.id) || p.aceFates[a.id]) continue;
    if (a.to >= before && a.to < after && a.to < 1918.85) {
      p.aceFates[a.id] = 'killed in action';
      out.news.push(`News from the front: <b>${a.name}</b> (${aceVictoriesAt(a, a.to)} victories) has been killed in action.`);
    }
    if (a.from >= before && a.from < after) out.news.push(`Rumours of a new German ace: <b>${a.name}</b> of ${a.unit}.`);
  }
  // new aircraft
  const prevTypes = availablePlayerTypes(p.nation, before);
  for (const t of availablePlayerTypes(p.nation, after)) {
    if (!prevTypes.includes(t)) out.news.push(`The ${AIRCRAFT[t].name} has arrived at the squadron.`);
  }
  if (before < 1918.25 && after >= 1918.25 && p.nation === 'GB') out.news.push('1 April 1918: the RFC and RNAS merge to form the <b>Royal Air Force</b>.');
  if (before < 1918.22 && after >= 1918.22) out.news.push('21 March 1918: the German <b>Spring Offensive</b> has begun. The front is falling back!');
  if (before < 1918.6 && after >= 1918.6) out.news.push('8 August 1918: the Allied <b>Hundred Days Offensive</b> opens at Amiens.');

  if (!out.ended && p.date >= ARMISTICE) {
    p.date = ARMISTICE;
    p.status = 'survived';
    out.ended = 'armistice';
  }
  void settings;
  return out;
}

export function scoreFor(res, settings) {
  let s = 0;
  for (const k of res.kills) {
    if (!k.confirmed) continue;
    s += k.ace ? 60 : k.twoSeater ? 20 : 15;
  }
  s += res.balloons * 25 + res.targets * 4;
  if (res.success) s += 30;
  if (res.outcome === 'landed') s += 10;
  if (res.outcome === 'captured' || res.outcome === 'killed') s = Math.round(s * 0.5);
  return Math.round(s * realismFactor(settings));
}
