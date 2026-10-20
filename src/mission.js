// Mission generation, objective tracking and evaluation.
import * as THREE from 'three';
import { AIRCRAFT, germanFighterTypes, germanTwoSeaterTypes, aceTypeAt, defaultScheme } from './data.js';
import { Aircraft, Balloon, GroundTarget, AASite } from './entities.js';
import { AIPilot } from './ai.js';
import { clamp, rand, randInt, pick, chance, yearFrac, fmtDate } from './util.js';
import { HALF } from './world.js';

export const MISSION_TYPES = {
  patrol: { title: 'Offensive Patrol', icon: '✈' },
  balloon: { title: 'Balloon Busting', icon: '◉' },
  escort: { title: 'Reconnaissance Escort', icon: '⛨' },
  ground: { title: 'Ground Attack', icon: '✷' },
  intercept: { title: 'Interception', icon: '⚑' },
  ace: { title: 'Ace Hunt', icon: '♛' },
  dogfight: { title: 'Dogfight', icon: '⚔' },
  training: { title: 'Training Flight', icon: '◎' },
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function nearestTown(world, x, z) {
  let best = null, bd = Infinity;
  for (const t of world.towns) { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = t; } }
  return best;
}

export class Mission {
  constructor(def) {
    Object.assign(this, {
      waypoints: [], kills: [], balloonsDown: 0, targetsDestroyed: 0, targetsTotal: 0,
      time: 0, objectiveDone: false, failed: false, failReason: '', notes: [], triggers: [],
      ace: null, aceDown: false, escortee: null, interceptors: [], quickEnemies: [],
    }, def);
  }

  // Build all entities for the mission into the running game
  setup(game) {
    this.game = game;
    const s = this.spawn;
    for (const fn of s) fn(game, this);
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    const p = g.player;
    if (!p) return;
    for (const wp of this.waypoints) {
      if (!wp.done && wp.forPlayer !== false && Math.hypot(p.pos.x - wp.x, p.pos.z - wp.z) < (wp.radius || 1300)) {
        wp.done = true;
        g.hud.message(`Reached ${wp.label}`, 'ok');
        this.checkObjective();
      }
    }
    for (const t of this.triggers) {
      if (!t.fired && t.cond(g, this)) { t.fired = true; t.run(g, this); }
    }
    if (this.type === 'escort' && this.escortee) {
      const e = this.escortee;
      if (e.state !== 'flying' && !this.failed && !this.objectiveDone) { this.failed = true; this.failReason = 'The reconnaissance machine was lost.'; g.hud.message('The two-seater has gone down!', 'bad'); }
      if (this.reconDone && !this.objectiveDone && e.state === 'flying' && e.pos.x < g.world.frontX(e.pos.z) - 800) {
        this.objectiveDone = true;
        g.hud.message('The two-seater is safely home. Objective complete!', 'ok');
      }
    }
    if (this.type === 'intercept' && !this.objectiveDone && !this.failed) {
      if (this.interceptors.some((a) => a.ai?.routeDone && a.state === 'flying')) {
        this.failed = true; this.failReason = 'Enemy reconnaissance completed its mission.';
        g.hud.message('The enemy two-seater has completed its reconnaissance!', 'bad');
      }
    }
  }

  checkObjective() {
    if (this.objectiveDone || this.failed) return;
    const g = this.game;
    let done = false;
    switch (this.type) {
      case 'patrol': done = this.waypoints.every((w) => w.done); break;
      case 'balloon': done = this.targetBalloon && this.targetBalloon.state !== 'up'; break;
      case 'ground': done = this.targetsDestroyed >= Math.ceil(this.targetsTotal * 0.5); break;
      case 'intercept': done = this.interceptors.filter((a) => a.state !== 'flying').length >= Math.ceil(this.interceptors.length / 2); break;
      case 'ace': done = this.aceDown; break;
      case 'dogfight': done = this.quickEnemies.length > 0 && this.quickEnemies.every((a) => a.state !== 'flying'); break;
      default: done = false;
    }
    if (done) {
      this.objectiveDone = true;
      g.hud.message(this.type === 'dogfight' ? 'All enemy aircraft destroyed!' : 'Objective complete! Return to friendly lines.', 'ok');
    }
  }

  onShotDown(victim, killer) {
    const g = this.game;
    if (killer && killer.isPlayer && victim.team !== 'A') {
      const friendly = g.world.sideAt(victim.pos.x, victim.pos.z) === 'A';
      const confirmed = this.kind !== 'career' || friendly || chance(0.72);
      this.kills.push({ type: victim.type, name: victim.spec.name, ace: victim.ace ? victim.ace.id : null, aceName: victim.ace?.name, twoSeater: victim.role === 'twoseater', confirmed, friendly });
      g.hud.message(victim.ace ? `You shot down ${victim.ace.name}!` : `${victim.spec.name} going down!`, 'kill');
    } else if (victim.isPlayer) {
      // nothing here; handled by game
    } else if (victim.team === 'A') {
      g.hud.message(`A friendly ${victim.spec.name} has gone down`, 'warn');
    } else if (killer && killer.team === 'A') {
      g.hud.message(`${victim.spec.name} shot down by a wingman`, 'info');
    }
    if (victim.ace && victim === this.aceCraft) this.aceDown = true;
    this.checkObjective();
  }

  onBalloonDown(b, killer) {
    if (killer?.isPlayer && b.side === 'G') {
      this.balloonsDown++;
      this.game.hud.message('Balloon in flames!', 'kill');
    }
    this.checkObjective();
  }

  onTargetDestroyed(t, killer) {
    if (t.group === 'mission') this.targetsDestroyed++;
    if (killer?.isPlayer) this.game.hud.message(`${t.kind[0].toUpperCase() + t.kind.slice(1)} destroyed`, 'ok');
    this.checkObjective();
  }

  statusLines() {
    const lines = [`${MISSION_TYPES[this.type].title}`];
    const t = Math.floor(this.time);
    lines[0] += `  ·  ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (this.failed) lines.push('Objective failed');
    else if (this.objectiveDone) lines.push(this.type === 'dogfight' || this.type === 'training' ? 'Objective complete' : 'Objective complete - return home');
    else lines.push(this.objectiveText());
    const conf = this.kills.length;
    if (conf) lines.push(`Victories this flight: ${conf}`);
    return lines;
  }

  objectiveText() {
    switch (this.type) {
      case 'patrol': return `Patrol: ${this.waypoints.filter((w) => w.done).length}/${this.waypoints.length} points`;
      case 'balloon': return 'Destroy the observation balloon';
      case 'escort': return this.reconDone ? 'Bring the two-seater home' : 'Protect the two-seater';
      case 'ground': return `Targets destroyed: ${this.targetsDestroyed}/${this.targetsTotal}`;
      case 'intercept': return `Two-seaters down: ${this.interceptors.filter((a) => a.state !== 'flying').length}/${this.interceptors.length}`;
      case 'ace': return `Shoot down ${this.ace?.name || 'the ace'}`;
      case 'dogfight': return `Enemies remaining: ${this.quickEnemies.filter((a) => a.state === 'flying').length}`;
      default: return 'Free flight - press Esc to end';
    }
  }
}

// ------------------------------------------------------------------
// Spawning helpers
// ------------------------------------------------------------------
function spawnAircraft(game, o) {
  const a = new Aircraft(game, o);
  game.addAircraft(a);
  return a;
}

function enemyFlight(game, m, { types, count, skill, anchor, alt, ace = null, yf, mode = 'patrol', route, leaderOpts = {} }) {
  const out = [];
  let leader = null;
  for (let i = 0; i < count; i++) {
    const isAce = ace && i === 0;
    const type = isAce ? aceTypeAt(ace, yf) : pick(types);
    const pos = V(anchor.x + rand(-300, 300) + i * 60, alt + rand(-80, 80), anchor.z + rand(-300, 300) + i * 50);
    const a = spawnAircraft(game, {
      type, team: 'G', pos, heading: rand(0, 360), skill: isAce ? ace.skill : clamp(skill + rand(-0.12, 0.12), 0.1, 0.92),
      ace: isAce ? ace : null, scheme: isAce ? { ...ace.scheme } : defaultScheme(type),
    });
    a.ai = new AIPilot(a, game, {
      mode, anchor: V(anchor.x, alt, anchor.z), alt, route, home: V(anchor.x + 9000, alt, anchor.z),
      leader: i > 0 ? leader : null, offset: V((i % 2 ? 1 : -1) * 40 * Math.ceil(i / 2), 0, 40 * Math.ceil(i / 2)), ...leaderOpts,
    });
    if (i === 0) leader = a;
    if (isAce) m.aceCraft = a;
    out.push(a);
  }
  return out;
}

function wingmen(game, m, { count, type, nation, skill, start, heading }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    const off = V(side * 45 * (i + 1), 0, 45 * (i + 1));
    const pos = start.clone().add(off.clone().applyAxisAngle(V(0, 1, 0), -heading * Math.PI / 180));
    const a = spawnAircraft(game, { type, team: 'A', pos, heading, skill, nation, callsign: `Wingman ${i + 1}` });
    a.ai = new AIPilot(a, game, { mode: 'patrol', leader: game.player, offset: off, alt: start.y, home: V(start.x - 8000, start.y, start.z) });
    out.push(a);
  }
  return out;
}

function addAA(game, center, n, side, spread = 700) {
  for (let i = 0; i < n; i++) {
    game.addAA(new AASite(game, { pos: V(center.x + rand(-spread, spread), 0, center.z + rand(-spread, spread)), side }));
  }
}

function frontDressing(game, zc) {
  // balloons and archie along the front near the action
  const w = game.world;
  for (let z = zc - 14000; z <= zc + 14000; z += 7000) {
    if (Math.abs(z) > HALF - 1000) continue;
    const zz = z + rand(-800, 800);
    game.addBalloon(new Balloon(game, { pos: V(w.frontX(zz) + 3200 + rand(-400, 400), 850 + rand(0, 250), zz), side: 'G' }));
    const za = z + 3500 + rand(-800, 800);
    if (Math.abs(za) < HALF - 1000) game.addBalloon(new Balloon(game, { pos: V(w.frontX(za) - 3200 + rand(-400, 400), 800 + rand(0, 250), za), side: 'A' }));
  }
  for (let z = zc - 15000; z <= zc + 15000; z += 2500) {
    if (Math.abs(z) > HALF - 500) continue;
    addAA(game, V(w.frontX(z) + rand(1200, 5000), 0, z), 1, 'G', 300);
    if (chance(0.5)) addAA(game, V(w.frontX(z) - rand(1200, 5000), 0, z), 1, 'A', 300);
  }
}

// ------------------------------------------------------------------
// Generators
// ------------------------------------------------------------------
/**
 * ctx: { kind: 'career'|'quick'|'training', type, date, nation, playerType, home (airfield), skill (enemy base),
 *        aces (available ace objects), wingmen, onRunway, quick: {...} }
 */
export function generateMission(game, ctx) {
  const w = game.world;
  const yf = yearFrac(ctx.date);
  const home = ctx.home;
  const type = ctx.type;
  const nation = ctx.nation;
  const pType = ctx.playerType;
  const zc = clamp(home.z + rand(-9000, 9000), -HALF + 6000, HALF - 6000);
  const fx = w.frontX(zc);
  const baseSkill = ctx.skill ?? clamp(0.35 + (yf - 1917.2) * 0.25, 0.3, 0.7);
  const fighters = germanFighterTypes(yf);
  const twoSeaters = germanTwoSeaterTypes(yf);
  const town = nearestTown(w, fx + 3000, zc);
  const alt = 1100 + rand(0, 500);

  // player start
  let start, heading, onGround = !!ctx.onRunway;
  if (onGround) {
    const hd = home.heading;
    start = V(home.x, 0, home.z);
    heading = hd;
  } else {
    start = V(fx - 4500, alt, zc + rand(-1500, 1500));
    heading = 90;
  }

  const m = new Mission({
    kind: ctx.kind, type, date: ctx.date, nation, playerType: pType, home, start, heading, onGround,
    title: MISSION_TYPES[type].title, sectorTown: town?.name || 'the lines', spawn: [],
  });
  const brief = [];
  const pspec = AIRCRAFT[pType];

  // Player + wingmen
  m.spawn.push((g) => {
    const p = spawnAircraft(g, {
      type: pType, team: 'A', isPlayer: true, nation, pos: start.clone(), heading, onGround,
      bombs: type === 'ground' ? pspec.bombs : 0, skill: 1, speed: onGround ? 0 : pspec.vmax * 0.8, throttle: onGround ? 0 : 0.85,
      scheme: ctx.scheme,
    });
    if (onGround) p.fm.pos.y = g.world.groundHeight(start.x, start.z) + 1.55;
    g.setPlayer(p);
    const wn = ctx.wingmen ?? 0;
    if (wn > 0 && !onGround) wingmen(g, m, { count: wn, type: pType, nation, skill: 0.5, start, heading });
    if (type !== 'training' && type !== 'dogfight') frontDressing(g, zc);
  });

  const pickAce = () => (ctx.aces && ctx.aces.length ? pick(ctx.aces) : null);

  switch (type) {
    case 'patrol': {
      const wps = [
        { x: fx + 1500, z: zc - 3500, label: 'Patrol A' },
        { x: fx + 2000, z: zc + 3500, label: 'Patrol B' },
      ];
      m.waypoints = wps.map((x) => ({ ...x, done: false }));
      const n = randInt(2, yf > 1918 ? 4 : 3);
      const ace = chance(0.25) ? pickAce() : null;
      m.ace = ace;
      m.spawn.push((g) => enemyFlight(g, m, { types: fighters, count: n, skill: baseSkill, anchor: V(fx + 4500, 0, zc + rand(-2000, 2000)), alt: alt + rand(100, 500), ace, yf }));
      if (chance(0.4)) m.spawn.push((g) => enemyFlight(g, m, { types: twoSeaters, count: 1, skill: baseSkill, anchor: V(fx + 3000, 0, zc - 5000), alt: alt - 200, yf }));
      brief.push(`Fly an offensive patrol over the lines near <b>${m.sectorTown}</b>. Visit both patrol points and engage any enemy machines you find.`);
      brief.push(`Intelligence expects <b>${n}</b> enemy scouts in the sector${ace ? `, possibly led by <b>${ace.name}</b>` : ''}.`);
      break;
    }
    case 'balloon': {
      const bp = V(fx + rand(2600, 3800), 950, zc);
      m.waypoints = [{ x: bp.x, z: bp.z, label: 'Balloon', done: false, radius: 900 }];
      m.spawn.push((g) => {
        const b = new Balloon(g, { pos: bp, side: 'G', name: 'Target balloon' });
        g.addBalloon(b);
        m.targetBalloon = b;
        addAA(g, bp, 4, 'G', 650);
      });
      const guarded = chance(0.55);
      if (guarded) m.spawn.push((g) => enemyFlight(g, m, { types: fighters, count: randInt(1, 3), skill: baseSkill, anchor: V(bp.x + 1500, 0, bp.z), alt: 1300, yf }));
      brief.push(`A German observation balloon is directing artillery fire near <b>${m.sectorTown}</b>. Destroy it.`);
      brief.push('Expect heavy archie. The ground crew will winch it down when they see you coming, so be quick.');
      if (guarded) brief.push('Balloons are usually guarded by a flight of scouts.');
      break;
    }
    case 'escort': {
      const reconPt = V(fx + rand(4000, 6000), 1300, zc + rand(-2000, 2000));
      m.waypoints = [{ x: reconPt.x, z: reconPt.z, label: 'Recon target', done: false, forPlayer: false }];
      m.spawn.push((g) => {
        const eType = yf >= 1917.3 && chance(0.4) ? 'bristol' : 're8';
        const p0 = start.clone().add(V(onGround ? 0 : 250, 0, 0));
        if (onGround) { p0.set(home.x + 1500, 900, home.z); }
        const e = spawnAircraft(g, { type: eType, team: 'A', nation, pos: p0, heading: 90, skill: 0.5, callsign: 'Recon two-seater' });
        e.ai = new AIPilot(e, g, { mode: 'route', route: [reconPt.clone(), V(fx - 5000, 1100, zc)], passive: true, alt: 1200, home: V(home.x, 1000, home.z) });
        m.escortee = e;
        m.triggers.push({
          cond: () => e.pos.distanceTo(reconPt) < 2500 || e.pos.x > fx + 1500,
          run: (gg) => enemyFlight(gg, m, { types: fighters, count: randInt(2, 3), skill: baseSkill, anchor: V(reconPt.x + 2500, 0, reconPt.z + rand(-1500, 1500)), alt: 1500, yf, leaderOpts: { preferTarget: e } }),
        });
        g.events.waypointReached = (ac, idx) => {
          if (ac === e && idx === 0 && !m.reconDone) { m.reconDone = true; m.waypoints[0].done = true; gg_msg(g, 'Photographs taken - the two-seater turns for home'); }
        };
      });
      brief.push(`Escort a two-seater on a photographic reconnaissance over <b>${m.sectorTown}</b>.`);
      brief.push('Stay with it, drive off any attackers, and see it safely back over our lines.');
      break;
    }
    case 'ground': {
      const tp = V(fx + rand(3500, 5500), 0, zc + rand(-2000, 2000));
      const kinds = ['crates', 'tent', 'tent', 'shed', 'wagon', 'crates', 'shed', 'wagon'];
      m.targetsTotal = kinds.length;
      m.waypoints = [{ x: tp.x, z: tp.z, label: 'Supply depot', done: false, radius: 700 }];
      m.spawn.push((g) => {
        kinds.forEach((k, i) => {
          const a = (i / kinds.length) * Math.PI * 2;
          g.addTarget(new GroundTarget(g, { pos: V(tp.x + Math.cos(a) * rand(40, 140), 0, tp.z + Math.sin(a) * rand(40, 140)), kind: k, side: 'G', rot: rand(0, 3), group: 'mission' }));
        });
        addAA(g, tp, 3, 'G', 500);
      });
      if (chance(0.5)) m.spawn.push((g) => enemyFlight(g, m, { types: fighters, count: randInt(1, 3), skill: baseSkill, anchor: V(tp.x + 2500, 0, tp.z), alt: 1200, yf }));
      brief.push(`Attack the German supply depot behind the lines near <b>${m.sectorTown}</b>. Destroy at least half of the stores.`);
      brief.push(pspec.bombs ? `Your ${pspec.name} carries <b>${pspec.bombs} Cooper bombs</b> (press B). Release low, about 150 m, and lead the target. Strafe the rest.` : `Your ${pspec.name} carries no bombs. You will have to strafe the targets with your guns.`);
      m.bombs = pspec.bombs;
      break;
    }
    case 'intercept': {
      const tgtTown = nearestTown(w, fx - 6000, zc);
      const n = 2;
      const startE = V(fx + 7000, 1500, zc + rand(-2500, 2500));
      const route = [V(tgtTown ? tgtTown.x : fx - 6000, 1400, tgtTown ? tgtTown.z : zc)];
      m.waypoints = [{ x: route[0].x, z: route[0].z, label: tgtTown ? tgtTown.name : 'Target', done: false, forPlayer: false }];
      m.spawn.push((g) => {
        const two = enemyFlight(g, m, { types: twoSeaters, count: n, skill: baseSkill, anchor: startE, alt: 1500, yf, mode: 'route', route, leaderOpts: { passive: true, home: V(fx + 9000, 1500, zc) } });
        two.forEach((a) => { a.ai.leader = null; a.ai.mode = 'route'; a.ai.route = route.map((r) => r.clone().add(V(rand(-200, 200), 0, rand(-200, 200)))); });
        m.interceptors = two;
        if (chance(0.6)) enemyFlight(g, m, { types: fighters, count: randInt(1, 2), skill: baseSkill, anchor: startE.clone().add(V(300, 200, 0)), alt: 1700, yf, mode: 'escort', leaderOpts: { protect: two[0] } });
      });
      if (!onGround) m.start = start.set(fx - 7000, 1300, zc);
      brief.push(`Enemy two-seaters have been reported crossing the lines toward <b>${tgtTown?.name || 'our rear areas'}</b>.`);
      brief.push(`Intercept them and shoot down at least ${Math.ceil(n / 2)} before they finish their reconnaissance.`);
      break;
    }
    case 'ace': {
      const ace = ctx.forceAce || pickAce() || null;
      m.ace = ace;
      const ap = V(fx + rand(2000, 3500), 0, zc);
      m.waypoints = [{ x: ap.x, z: ap.z, label: 'Last sighting', done: false, radius: 1500 }];
      m.spawn.push((g) => enemyFlight(g, m, { types: fighters, count: randInt(2, 3), skill: baseSkill + 0.1, anchor: ap, alt: 1700, ace, yf }));
      brief.push(ace
        ? `Rumour in the mess says that <b>${ace.name}</b>, "${ace.nick}" of ${ace.unit}, has been hunting over <b>${m.sectorTown}</b>.`
        : `A crack Jasta has been active over <b>${m.sectorTown}</b>.`);
      brief.push('Find him and bring him down. He will not be alone.');
      break;
    }
    case 'training': {
      m.spawn.push((g) => {
        // an unarmed target tug to practice gunnery on
        const tp = V(home.x + 3000, 800, home.z + 1500);
        const t = spawnAircraft(g, { type: 'dfw', team: 'G', pos: tp, heading: 0, skill: 0.2, scheme: defaultScheme('dfw'), callsign: 'Practice target' });
        t.gunnerAmmo = 0; t.ammo = 0;
        t.ai = new AIPilot(t, g, { mode: 'patrol', anchor: tp, alt: 800, passive: true });
      });
      brief.push('Free flight from your home aerodrome. Practise take-offs, landings and gunnery against the captured DFW circling nearby.');
      brief.push('Press <b>Esc</b> to end the flight at any time.');
      break;
    }
    case 'dogfight': {
      const q = ctx.quick;
      const qa = q.alt || 1500;
      onGround = false;
      heading = 90;
      m.onGround = false;
      m.heading = 90;
      m.start = start.set(fx - 800, qa, zc);
      m.spawn.push((g) => {
        const anchor = V(fx + 1400, qa, zc + rand(-300, 300));
        for (let i = 0; i < q.count; i++) {
          const isAce = q.ace && i === 0;
          const type = isAce ? aceTypeAt(q.ace, yf) : q.enemyType;
          const a = spawnAircraft(g, {
            type, team: 'G', pos: anchor.clone().add(V(i * 60, rand(-50, 50), (i % 2 ? 1 : -1) * 60 * Math.ceil(i / 2))),
            heading: 270, skill: isAce ? q.ace.skill : q.skill, ace: isAce ? q.ace : null, scheme: isAce ? { ...q.ace.scheme } : defaultScheme(type),
          });
          a.ai = new AIPilot(a, g, { mode: 'patrol', anchor, alt: qa, home: V(fx + 9000, qa, zc) });
          a.ai.fleeing = false;
          m.quickEnemies.push(a);
          if (isAce) m.aceCraft = a;
        }
      });
      brief.push('Head-on encounter over the lines. Good hunting.');
      break;
    }
  }
  m.briefing = brief;
  m.dateText = fmtDate(ctx.date);
  return m;
}

function gg_msg(g, t) { g.hud.message(t, 'ok'); }
