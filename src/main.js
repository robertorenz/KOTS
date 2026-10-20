import './style.css';
import * as THREE from 'three';
import { World } from './world.js';
import { Particles, Tracers } from './effects.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { BulletSystem, Bomb } from './weapons.js';
import { Aircraft, Parachute } from './entities.js';
import { AIPilot } from './ai.js';
import { ACES, NATIONS } from './data.js';
import { loadSettings, saveSettings, scoreFor } from './campaign.js';
import { MISSION_TYPES } from './mission.js';
import { UI } from './ui.js';
import { clamp, rand, pick } from './util.js';

const VIEWS = ['cockpit', 'chase', 'padlock', 'target'];
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();
const Y_FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

class Game {
  constructor() {
    const canvas = document.getElementById('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.25, 70000);
    this.scene.add(new THREE.HemisphereLight('#dfeaff', '#5d6b3c', 1.9));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
    sun.position.set(0.45, 1, 0.3);
    this.scene.add(sun);

    this.settings = loadSettings();
    this.audio = new Audio();
    this.audio.setVolume(this.settings.volume);
    this.input = new Input();
    this.input.invertPitch = this.settings.invertPitch;
    this.hud = new HUD(document.getElementById('hud'), this);
    this.particles = new Particles(this.scene);
    this.tracers = new Tracers(this.scene);
    this.bullets = new BulletSystem(this);

    this.aircraft = []; this.balloons = []; this.targets = []; this.aa = []; this.bombs = []; this.parachutes = []; this.wrecks = [];
    this.player = null;
    this.mission = null;
    this.mode = 'menu';
    this.view = 'cockpit';
    this.paused = false;
    this.timeScale = 1;
    this.events = {};
    this.units = { speed: 'mph', alt: 'ft' };
    this.world = null;
    this.worldShift = null;

    this.ui = new UI(this);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.clock = new THREE.Clock();
    this.startDemo();
    this.ui.showTitle();
    requestAnimationFrame(() => this.loop());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particles.setViewport(h, this.camera.fov);
    this.hud.resize();
  }

  applySettings() {
    saveSettings(this.settings);
    this.audio.setVolume(this.settings.volume);
    this.input.invertPitch = this.settings.invertPitch;
  }

  ensureWorld(shift) {
    shift = Math.round(shift / 100) * 100;
    if (this.world && this.worldShift === shift && this.worldClouds === this.settings.clouds) return;
    this.clearEntities();
    if (this.world) this.world.dispose();
    this.world = new World(this.scene, { frontShift: shift, clouds: this.settings.clouds });
    this.worldShift = shift;
    this.worldClouds = this.settings.clouds;
    this.mapCanvas = this.world.renderMap(360);
  }

  // ---------------- entity management ----------------
  clearEntities() {
    for (const list of [this.aircraft, this.balloons, this.targets, this.aa, this.bombs, this.parachutes]) {
      for (const e of list) e.dispose?.();
      list.length = 0;
    }
    this.wrecks.length = 0;
    this.bullets.clear();
    this.player = null;
    this.padTarget = null;
  }
  addAircraft(a) { this.aircraft.push(a); return a; }
  addBalloon(b) { this.balloons.push(b); return b; }
  addTarget(t) { this.targets.push(t); return t; }
  addAA(a) { this.aa.push(a); return a; }
  addWreck(pos) { this.wrecks.push({ pos, t: 0, timer: 0 }); }
  spawnParachute(pos) { this.parachutes.push(new Parachute(this, pos)); }
  setPlayer(p) { this.player = p; }

  nearestEnemy(maxD = 5000, from = this.player) {
    if (!from) return null;
    let best = null, bd = maxD;
    for (const a of this.aircraft) {
      if (a.team === from.team || a.state !== 'flying') continue;
      const d = a.pos.distanceTo(from.pos);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  // ---------------- attract mode ----------------
  startDemo() {
    this.mode = 'demo';
    this.mission = null;
    this.input.enabled = false;
    this.audio.silence();
    this.ensureWorld(0);
    this.clearEntities();
    this.events = { crashed: () => {}, shotDown: () => {} };
    this.demoTimer = 0;
    this.demoCam = 0;
    this.demoSpawn();
    this.camera.position.set(-1000, 1300, 0);
  }

  demoSpawn() {
    const allied = ['camel', 'se5a', 'spad13', 'triplane'];
    const ace = pick(ACES.filter((a) => ['mvr', 'jacobs', 'voss', 'udet', 'goer'].includes(a.id)));
    const fx = this.world.frontX(0);
    const mk = (o) => {
      const a = this.addAircraft(new Aircraft(this, o));
      a.ai = new AIPilot(a, this, { mode: 'patrol', anchor: o.pos.clone(), alt: o.pos.y });
      a.ammo = 99999;
      return a;
    };
    const live = this.aircraft.filter((a) => a.state === 'flying');
    const needA = 2 - live.filter((a) => a.team === 'A').length, needG = 2 - live.filter((a) => a.team === 'G').length;
    for (let i = 0; i < needA; i++) mk({ type: pick(allied), team: 'A', nation: pick(['GB', 'FR']), pos: new THREE.Vector3(fx - 900 - i * 80, 1300, rand(-200, 200)), heading: 90, skill: 0.7 });
    for (let i = 0; i < needG; i++) {
      const isAce = i === 0 && !live.some((a) => a.ace);
      mk({ type: isAce ? (ace.late) : pick(['albatros5', 'pfalz', 'd7']), team: 'G', ace: isAce ? ace : null, scheme: isAce ? { ...ace.scheme } : undefined, pos: new THREE.Vector3(fx + 900 + i * 80, 1350, rand(-200, 200)), heading: 270, skill: isAce ? 0.8 : 0.6 });
    }
  }

  // ---------------- missions ----------------
  startMission(mission, ctx) {
    this.ctx = ctx;
    this.ensureWorld(ctx.frontShift ?? 0);
    this.clearEntities();
    this.mode = 'flight';
    this.mission = mission;
    this.paused = false;
    this.timeScale = 1;
    this.flightOver = false;
    this.playerAirborne = !mission.onGround;
    this.hud.reset();
    const nat = NATIONS[ctx.nation] || NATIONS.GB;
    const units = this.settings.units === 'auto' ? nat : this.settings.units === 'metric' ? { speed: 'kmh', alt: 'm' } : { speed: 'mph', alt: 'ft' };
    this.units = { speed: units.speed, alt: units.alt };
    this.events = {
      shotDown: (v, k, c) => this.onShotDown(v, k, c),
      crashed: (a, wasFlying, impact) => this.onCrashed(a, wasFlying, impact),
      landed: (a) => this.onLanded(a),
      touchdown: (a) => { if (a.isPlayer) this.hud.message('Touchdown', 'info'); },
      balloonDown: (b, k) => this.mission.onBalloonDown(b, k),
      targetDestroyed: (t, k) => this.mission.onTargetDestroyed(t, k),
    };
    mission.setup(this);
    const p = this.player;
    p.fm.easy = this.settings.easyFlight;
    this.view = 'cockpit';
    this.setCockpitVisibility(true);
    this.input.reset();
    this.input.enabled = true;
    this.audio.init();
    this.hud.message(mission.onGround ? 'Open the throttle (+ or 0) and pull back gently at speed to take off' : `${MISSION_TYPES[mission.type].title} - good luck!`, 'info');
    this.camera.position.copy(p.pos);
  }

  onShotDown(v, killer, cause) {
    if (this.mode === 'demo') return;
    this.mission.onShotDown(v, killer, cause);
    if (v.isPlayer) {
      const why = cause === 'pilot' ? 'You have been hit!' : cause === 'fire' ? 'Your machine is on fire!' : cause === 'breakup' ? 'Your machine is breaking up!' : 'You are going down!';
      this.hud.message(why, 'bad');
    }
  }

  onCrashed(a, wasFlying, impact) {
    if (this.mode === 'demo') { return; }
    if (!a.isPlayer || this.flightOver) return;
    const side = this.world.sideAt(a.pos.x, a.pos.z);
    let outcome;
    const survivable = a.pilotHealth > 0 && a.fallCause !== 'fire' && impact < 16 && Math.random() < (wasFlying ? 0.85 : 0.55);
    if (this.settings.invulnerable) outcome = side === 'G' ? 'captured' : 'wounded';
    else if (!survivable) outcome = 'killed';
    else outcome = side === 'G' ? 'captured' : 'wounded';
    const msg = { killed: 'You have been killed.', captured: 'You crash-land behind enemy lines and are taken prisoner.', wounded: 'You survive the crash, badly hurt.' }[outcome];
    this.hud.message(msg, 'bad');
    this.finishFlight(outcome, 3.5);
  }

  onLanded(a) {
    if (!a.isPlayer || this.flightOver || !this.playerAirborne) return;
    const side = this.world.sideAt(a.pos.x, a.pos.z);
    if (side === 'G') { this.hud.message('You have landed behind enemy lines and are taken prisoner!', 'bad'); this.finishFlight('captured', 3); return; }
    const near = this.world.airfields.some((f) => f.side === 'A' && Math.hypot(f.x - a.pos.x, f.z - a.pos.z) < 900);
    this.hud.message(near ? 'Landed safely at the aerodrome' : 'Landed in a field behind our lines', 'ok');
    this.finishFlight(near ? 'landed' : 'returned', 2.5);
  }

  finishFlight(outcome, delay = 0) {
    if (this.flightOver) return;
    this.flightOver = true;
    this.pendingOutcome = outcome;
    this.endTimer = delay;
    this.timeScale = 1;
  }

  requestEndFlight() {
    const p = this.player;
    if (!p || this.flightOver) return;
    const side = this.world.sideAt(p.pos.x, p.pos.z);
    const kind = this.mission.kind;
    if (kind !== 'career') return this.finishFlight(p.state === 'flying' ? 'returned' : 'landed', 0);
    if (p.state === 'landed') return this.finishFlight(side === 'G' ? 'captured' : 'landed', 0);
    if (side === 'G') {
      return this.ui.modal({
        title: 'Over enemy territory',
        body: '<p>You are on the German side of the lines. If you end the flight here, your engine gives out and you come down behind enemy lines. <b>You will be taken prisoner.</b></p><p>Fly west across the trenches first to end the flight safely.</p>',
        buttons: [{ label: 'Keep flying', value: false, primary: true }, { label: 'End flight (captured)', value: true, danger: true }],
      }).then((v) => { if (v) this.finishFlight('captured', 0); else this.setPaused(false); });
    }
    const e = this.nearestEnemy(2500);
    if (e) {
      return this.ui.modal({
        title: 'Enemy nearby',
        body: '<p>There are enemy machines within 2.5 km. Disengage first, or end the flight and accept that you broke off under fire.</p>',
        buttons: [{ label: 'Keep flying', value: false, primary: true }, { label: 'End flight', value: true }],
      }).then((v) => { if (v) this.finishFlight('returned', 0); else this.setPaused(false); });
    }
    this.finishFlight('returned', 0);
  }

  buildResult(outcome) {
    const m = this.mission;
    const res = {
      title: m.title, type: m.type, kind: m.kind, outcome,
      kills: m.kills, balloons: m.balloonsDown, targets: m.targetsDestroyed,
      success: false, failReason: m.failReason, time: m.time,
    };
    const alive = outcome !== 'killed' && outcome !== 'captured';
    if (m.type === 'training') res.success = alive;
    else res.success = m.objectiveDone && !m.failed && alive;
    if (!m.objectiveDone && !m.failed && !res.failReason) res.failReason = 'The objective was not completed.';
    res.score = scoreFor(res, this.settings);
    const parts = [];
    const conf = res.kills.filter((k) => k.confirmed).length;
    if (res.kills.length) parts.push(`${res.kills.length} claim${res.kills.length > 1 ? 's' : ''} (${conf} confirmed)`);
    if (res.balloons) parts.push(`${res.balloons} balloon${res.balloons > 1 ? 's' : ''}`);
    if (res.targets) parts.push(`${res.targets} ground target${res.targets > 1 ? 's' : ''}`);
    parts.push({ landed: 'landed at the aerodrome', returned: 'returned safely', wounded: 'wounded', captured: 'taken prisoner', killed: 'killed in action' }[outcome]);
    res.summary = parts.join(', ') + '.';
    return res;
  }

  endFlightNow() {
    const res = this.buildResult(this.pendingOutcome);
    this.input.enabled = false;
    this.audio.silence();
    this.mode = 'debrief';
    this.ui.showDebrief(res);
  }

  quitToMenu() {
    this.input.enabled = false;
    this.paused = false;
    this.startDemo();
    this.ui.showTitle();
  }

  setPaused(v) {
    this.paused = v;
    if (v) this.audio.silence();
  }

  setCockpitVisibility(cockpit) {
    const p = this.player;
    if (!p) return;
    for (const o of p.model.cockpitHidden) o.visible = !cockpit;
  }

  // ---------------- per-frame ----------------
  loop() {
    requestAnimationFrame(() => this.loop());
    const rdt = Math.min(this.clock.getDelta(), 0.05);
    this.input.update(rdt);

    if (this.mode === 'flight') {
      this.handleFlightKeys(rdt);
      if (!this.paused) {
        const total = rdt * this.timeScale;
        const n = Math.max(1, Math.ceil(total / (1 / 60)));
        for (let i = 0; i < n; i++) this.stepSim(total / n);
        this.particles.update(total);
        if (this.flightOver) {
          this.endTimer -= rdt;
          if (this.endTimer <= 0) this.endFlightNow();
        }
      }
    } else if (this.mode === 'demo' || this.mode === 'debrief') {
      this.stepSim(rdt);
      this.particles.update(rdt);
      if (this.mode === 'demo') {
        this.demoTimer += rdt;
        if (this.demoTimer > 3 && this.aircraft.filter((a) => a.state === 'flying').length < 4) {
          this.aircraft = this.aircraft.filter((a) => { if (a.state === 'dead') { a.dispose(); return false; } return true; });
          this.demoSpawn();
          this.demoTimer = 0;
        }
      }
    }

    this.updateCamera(rdt);
    if (this.world) this.world.update(this.camera);
    this.renderer.render(this.scene, this.camera);
    if (this.mode === 'flight') {
      this.hud.draw(this.paused ? 0 : rdt);
      if (this.paused && !this.ui.modalOpen) this.hud.label('PAUSED - press P to resume', this.hud.w / 2, this.hud.h / 2 - 80, 'center', '#e8c872', 22);
    } else this.hud.clear();
    this.input.endFrame();
  }

  handleFlightKeys(dt) {
    const inp = this.input, p = this.player;
    if (!p) return;
    if (inp.wasPressed('Escape') && !this.ui.modalOpen) { this.setPaused(true); this.ui.showPauseMenu(); return; }
    if (inp.wasPressed('KeyP')) this.setPaused(!this.paused);
    if (inp.wasPressed('KeyM')) this.hud.showMap = !this.hud.showMap;
    if (inp.wasPressed('KeyH')) { this.setPaused(true); this.ui.showControlsModal().then(() => this.setPaused(false)); }
    if (this.paused) return;

    if (inp.wasPressed('KeyV')) this.setView(VIEWS[(VIEWS.indexOf(this.view) + 1) % VIEWS.length]);
    if (inp.wasPressed('KeyF')) this.setView(this.view === 'padlock' ? 'cockpit' : 'padlock');
    if (inp.wasPressed('KeyN')) this.cyclePadTarget();
    if (inp.wasPressed('KeyT')) {
      if (this.nearestEnemy(3000)) this.hud.message('Time compression unavailable - enemy nearby', 'warn');
      else this.timeScale = this.timeScale >= 4 ? 1 : this.timeScale * 2;
    }
    if (this.timeScale > 1 && this.nearestEnemy(2500)) { this.timeScale = 1; this.hud.message('Enemy aircraft sighted!', 'warn'); }

    const fm = p.fm;
    const controllable = p.state === 'flying' || p.state === 'landed';
    if (controllable) {
      fm.controls.pitch = inp.axes.pitch;
      fm.controls.roll = inp.axes.roll;
      fm.controls.yaw = inp.axes.yaw;
      if (inp.throttleDelta) fm.throttle = clamp(fm.throttle + inp.throttleDelta * dt * 0.6, 0, 1);
      for (let i = 0; i <= 9; i++) if (inp.wasPressed(`Digit${i}`)) fm.throttle = i === 0 ? 1 : i / 10;
      if (inp.wasPressed('Backquote')) fm.throttle = 0;
      p.firing = inp.fire;
      if (inp.wasPressed('KeyJ')) p.tryClearJam();
      if (inp.wasPressed('KeyB')) this.dropBomb(p);
      if (!fm.onGround) this.playerAirborne = true;
    } else {
      p.firing = false;
    }
    this.lookBack = inp.isDown('KeyR');
    this.audio.setEngine(fm.rpm, fm.throttle, fm.airspeed, p.state !== 'dead' && fm.engineRunning && fm.fuel > 0);
  }

  dropBomb(p) {
    if (p.bombs <= 0) { if (p.spec.bombs) this.hud.message('No bombs left', 'warn'); return; }
    if (p.fm.onGround) return;
    p.bombs--;
    const pos = p.pos.clone().add(new THREE.Vector3(0, -1.2, 0));
    this.bombs.push(new Bomb(this, p, pos, p.vel));
    this.hud.message(`Bomb away! (${p.bombs} left)`, 'info');
    this.audio.click();
  }

  setView(v) {
    if (v === 'padlock' || v === 'target') {
      if (!this.padTarget || this.padTarget.state !== 'flying') this.padTarget = this.nearestEnemy(8000) || this.nearestBalloon();
      if (!this.padTarget) { this.hud.message('No target in sight', 'warn'); v = 'cockpit'; }
    }
    this.view = v;
    this.setCockpitVisibility(v === 'cockpit' || v === 'padlock');
  }

  nearestBalloon() {
    let best = null, bd = 6000;
    for (const b of this.balloons) {
      if (b.state !== 'up' || b.side === 'A') continue;
      const d = b.pos.distanceTo(this.player.pos);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  cyclePadTarget() {
    const list = this.aircraft.filter((a) => a.team !== 'A' && a.state === 'flying').sort((a, b) => a.pos.distanceTo(this.player.pos) - b.pos.distanceTo(this.player.pos));
    if (!list.length) return;
    const i = list.indexOf(this.padTarget);
    this.padTarget = list[(i + 1) % list.length];
    this.hud.message(`Target: ${this.padTarget.ace ? this.padTarget.ace.name : this.padTarget.spec.name}`, 'info');
  }

  stepSim(dt) {
    for (const a of this.aircraft) {
      if (a.ai && a.state === 'flying') a.ai.update(dt);
      a.update(dt);
    }
    this.bullets.update(dt);
    for (const b of this.bombs) b.update(dt);
    if (this.bombs.length > 20) this.bombs = this.bombs.filter((b) => !b.done);
    for (const b of this.balloons) b.update(dt);
    if (this.mode === 'flight') for (const s of this.aa) s.update(dt);
    for (const p of this.parachutes) p.update(dt);
    for (const w of this.wrecks) {
      w.t += dt; w.timer -= dt;
      if (w.t < 45 && w.timer <= 0) {
        w.timer = 0.18;
        this.particles.smoke(w.pos, new THREE.Vector3(rand(-1, 1), 4, rand(-1, 1)), 0.95, 6);
      }
    }
    // mid-air collisions
    const ac = this.aircraft;
    for (let i = 0; i < ac.length; i++) {
      const a = ac[i];
      if (a.state !== 'flying' && a.state !== 'falling') continue;
      for (let j = i + 1; j < ac.length; j++) {
        const b = ac[j];
        if (b.state !== 'flying' && b.state !== 'falling') continue;
        if (a.pos.distanceToSquared(b.pos) < 30) {
          if (a.isPlayer || b.isPlayer) this.hud.message('Mid-air collision!', 'bad');
          for (const c of [a, b]) {
            c.lastAttacker = null;
            if (c.fm.onGround || c.state === 'falling') c.crash();
            else c.shotDown('breakup');
          }
        }
      }
    }
    if (this.mission && this.mode === 'flight') this.mission.update(dt);
  }

  updateCamera(dt) {
    const cam = this.camera;
    if (this.mode === 'demo' || this.mode === 'debrief' || !this.player) return this.demoCamera(dt);
    const p = this.player, fm = p.fm;
    if (p.state === 'dead') {
      // slow orbit around the crash site
      this.deathT = (this.deathT || 0) + dt;
      const r = 60;
      cam.position.set(p.pos.x + Math.cos(this.deathT * 0.3) * r, p.pos.y + 25, p.pos.z + Math.sin(this.deathT * 0.3) * r);
      cam.up.set(0, 1, 0);
      cam.lookAt(p.pos);
      return;
    }
    this.deathT = 0;
    let view = this.view;
    if (this.lookBack && view === 'cockpit') view = 'back';
    if ((view === 'padlock' || view === 'target') && (!this.padTarget || (this.padTarget.state !== 'flying' && this.padTarget.state !== 'up'))) {
      const nt = this.nearestEnemy(8000);
      if (nt) this.padTarget = nt; else { this.setView('cockpit'); view = 'cockpit'; }
    }
    const eye = _v.copy(p.model.eye).applyQuaternion(fm.quat).add(fm.pos);
    switch (view) {
      case 'cockpit':
        cam.position.copy(eye);
        cam.quaternion.copy(fm.quat);
        break;
      case 'back':
        cam.position.copy(eye).addScaledVector(fm.up(_u), 0.25);
        cam.quaternion.copy(fm.quat).multiply(Y_FLIP);
        break;
      case 'padlock':
        cam.position.copy(eye);
        cam.up.copy(fm.up(_u));
        cam.lookAt(this.padTarget.pos);
        break;
      case 'target': {
        const t = this.padTarget;
        const dir = _f.copy(t.pos).sub(fm.pos).normalize();
        cam.position.copy(fm.pos).addScaledVector(dir, -24).add(_u.set(0, 6, 0));
        cam.up.set(0, 1, 0);
        cam.lookAt(t.pos);
        break;
      }
      default: { // chase
        fm.forward(_f);
        const desired = _u.copy(fm.pos).addScaledVector(_f, -18).add(new THREE.Vector3(0, 4.5, 0));
        if (this._chaseInit !== p.id) { cam.position.copy(desired); this._chaseInit = p.id; }
        cam.position.lerp(desired, 1 - Math.exp(-dt * 6));
        cam.up.set(0, 1, 0);
        cam.lookAt(_v.copy(fm.pos).addScaledVector(_f, 12));
      }
    }
  }

  demoCamera(dt) {
    const cam = this.camera;
    const live = this.aircraft.filter((a) => a.state === 'flying');
    if (!live.length) return;
    this.demoCam += dt;
    if (!this.demoFocus || this.demoFocus.state !== 'flying' || this.demoCam > 9) {
      this.demoFocus = live[Math.floor(Math.random() * live.length)];
      this.demoCam = 0;
      this.demoAngle = rand(-1, 1);
      this.demoDist = rand(16, 30);
      cam.position.copy(this.demoFocus.pos).add(new THREE.Vector3(30, 8, 30));
    }
    const a = this.demoFocus, fm = a.fm;
    fm.forward(_f);
    const side = new THREE.Vector3(-_f.z, 0, _f.x).normalize();
    const desired = _u.copy(fm.pos).addScaledVector(_f, -this.demoDist * Math.cos(this.demoAngle)).addScaledVector(side, this.demoDist * Math.sin(this.demoAngle)).add(new THREE.Vector3(0, 5, 0));
    cam.position.lerp(desired, 1 - Math.exp(-dt * 2.5));
    cam.up.set(0, 1, 0);
    cam.lookAt(fm.pos);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
