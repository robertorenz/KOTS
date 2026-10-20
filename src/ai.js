// AI pilots: patrol, formation, route following, dogfighting, evasion and retreat.
import * as THREE from 'three';
import { clamp, rand, chance } from './util.js';

const _q = new THREE.Quaternion(), _l = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
const _aim = new THREE.Vector3(), _dir = new THREE.Vector3(), _tmp = new THREE.Vector3();

export class AIPilot {
  /**
   * opts: mode ('patrol' | 'route' | 'escort' | 'hunt'), anchor (Vector3), route ([Vector3]),
   *       leader (Aircraft), offset (Vector3 body-space slot), protect (Aircraft), home (Vector3),
   *       alt (cruise altitude), passive (route aircraft that never engage)
   */
  constructor(ac, game, opts = {}) {
    this.ac = ac;
    this.game = game;
    this.skill = ac.skill;
    this.mode = opts.mode || 'patrol';
    this.anchor = opts.anchor ? opts.anchor.clone() : ac.pos.clone();
    this.route = opts.route || [];
    this.wp = 0;
    this.leader = opts.leader || null;
    this.offset = opts.offset || new THREE.Vector3(30, 0, 30);
    this.protect = opts.protect || null;
    this.home = opts.home || ac.pos.clone();
    this.alt = opts.alt || ac.pos.y;
    this.passive = !!opts.passive;
    this.preferTarget = opts.preferTarget || null;
    this.target = null;
    this.threat = null;
    this.state = 'cruise';
    this.think = rand(0, 0.5);
    this.evadeTime = 0;
    this.evadeDir = 1;
    this.fleeing = false;
    this.routeDone = false;
    this.noise = new THREE.Vector3();
    this.noiseTimer = 0;
    this.burst = 0;
    this.sightRange = 2600 + this.skill * 2200;
    this.orbit = rand(0, Math.PI * 2);
  }

  update(dt) {
    const ac = this.ac;
    if (ac.state !== 'flying') { ac.firing = false; return; }
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.35 + (1 - this.skill) * 0.5;
      this.decide();
    }
    this.noiseTimer -= dt;
    if (this.noiseTimer <= 0) {
      this.noiseTimer = rand(0.6, 1.4);
      const n = (1 - this.skill) * 1.2 + 0.15;
      this.noise.set(rand(-n, n), rand(-n, n), rand(-n, n));
    }

    ac.firing = false;
    if (this.groundAvoid()) return;

    switch (this.state) {
      case 'attack': this.doAttack(dt); break;
      case 'evade': this.doEvade(dt); break;
      case 'flee': this.flyTo(this.home, this.alt * 0.6, 1); break;
      default: this.doCruise(dt);
    }
  }

  enemies() {
    return this.game.aircraft.filter((a) => a.team !== this.ac.team && a.state === 'flying');
  }

  decide() {
    const ac = this.ac, fm = ac.fm;
    const lowAmmo = ac.ammo <= 0 && !ac.spec.gunner;
    const hurt = fm.engineHealth < 0.35 || ac.pilotHealth < 40 || ac.structure < 8;
    if (!this.fleeing && (lowAmmo || (hurt && chance(0.6)))) this.fleeing = true;

    // threat assessment: an enemy sitting on my tail with its nose on me
    this.threat = null;
    fm.forward(_f);
    const awareness = 0.45 + this.skill * 0.55;
    for (const e of this.enemies()) {
      const d = e.pos.distanceTo(ac.pos);
      if (d > 650) continue;
      _dir.copy(ac.pos).sub(e.pos).normalize();
      const theirAim = e.fm.forward(_tmp).dot(_dir);
      const behind = _dir.dot(_f) > 0.2; // they are behind me
      if (theirAim > 0.93 && behind && chance(awareness)) { this.threat = e; break; }
    }

    if (this.fleeing) {
      this.state = this.threat && chance(0.5) ? 'evade' : 'flee';
      if (this.state === 'evade') this.startEvade();
      return;
    }
    if (this.passive) {
      // two-seaters on a job: break only when someone is shooting at them
      if (this.threat && ac.hitTimer > 0 && chance(0.6)) { this.state = 'evade'; this.startEvade(); }
      else this.state = 'cruise';
      return;
    }
    if (this.threat && (this.state !== 'evade') && chance(0.4 + this.skill * 0.5)) {
      this.state = 'evade';
      this.startEvade();
      return;
    }
    if (this.state === 'evade' && this.evadeTime > 0) return;

    // pick a target
    let best = null, bestScore = Infinity;
    for (const e of this.enemies()) {
      const d = e.pos.distanceTo(ac.pos);
      if (d > this.sightRange) continue;
      let score = d;
      if (e === this.target) score *= 0.6;
      if (e === this.preferTarget) score *= 0.4;
      if (this.protect && e.ai?.target === this.protect) score *= 0.5;
      if (e.role === 'twoseater' && ac.team === 'G') score *= 0.9;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    // escorts stay close to their charge unless the enemy comes near
    if (best && this.mode === 'escort' && this.protect?.state === 'flying' && best.pos.distanceTo(this.protect.pos) > 1800) best = null;
    this.target = best;
    this.state = best ? 'attack' : 'cruise';
  }

  startEvade() {
    this.evadeTime = rand(1.5, 3.5) * (0.6 + this.skill * 0.6);
    const t = this.threat;
    if (t) {
      _q.copy(this.ac.fm.quat).invert();
      _l.copy(t.pos).sub(this.ac.pos).applyQuaternion(_q);
      this.evadeDir = _l.x >= 0 ? 1 : -1;
    } else this.evadeDir = chance(0.5) ? 1 : -1;
    this.evadeStyle = this.skill > 0.6 ? (chance(0.7) ? 'break' : 'climb') : chance(0.5) ? 'break' : 'dive';
  }

  // ---------------- behaviours ----------------
  doCruise() {
    const ac = this.ac;
    if (this.mode === 'route' || (this.mode === 'escort' && !this.protect)) {
      if (this.wp < this.route.length) {
        const p = this.route[this.wp];
        this.flyTo(p, p.y, 0.85);
        if (Math.hypot(p.x - ac.pos.x, p.z - ac.pos.z) < 700) {
          this.wp++;
          this.game.events.waypointReached?.(ac, this.wp - 1);
        }
        return;
      }
      this.routeDone = true;
      this.flyTo(this.home, this.alt, 0.85);
      return;
    }
    if (this.leader && this.leader.state === 'flying') return this.doFormation(this.leader);
    if (this.mode === 'escort' && this.protect && this.protect.state === 'flying') {
      const off = new THREE.Vector3(this.offset.x * 3, 60, this.offset.z * 3);
      return this.doFormation(this.protect, off);
    }
    // patrol orbit around anchor
    this.orbit += 0.0006 * 16;
    _aim.set(this.anchor.x + Math.cos(this.orbit) * 1600, this.alt, this.anchor.z + Math.sin(this.orbit) * 1600);
    this.flyTo(_aim, this.alt, 0.8);
  }

  doFormation(lead, offset = this.offset) {
    const ac = this.ac;
    lead.fm.forward(_f);
    _tmp.copy(offset).applyQuaternion(lead.fm.quat);
    _aim.copy(lead.pos).add(_tmp);
    const toSlot = _dir.copy(_aim).sub(ac.pos);
    const along = toSlot.dot(_f);
    _aim.addScaledVector(_f, 120);
    this.steer(_dir.copy(_aim).sub(ac.pos).normalize(), 0.7);
    ac.fm.throttle = clamp(0.75 + along * 0.01, 0.35, 1);
  }

  flyTo(p, alt, throttle) {
    const ac = this.ac;
    _dir.set(p.x - ac.pos.x, 0, p.z - ac.pos.z);
    const d = _dir.length() || 1;
    _dir.divideScalar(d);
    _dir.y = clamp((alt - ac.pos.y) / 900, -0.35, 0.35);
    _dir.normalize();
    this.steer(_dir, 0.6);
    ac.fm.throttle = throttle;
  }

  doAttack(dt) {
    const ac = this.ac, t = this.target;
    if (!t || t.state !== 'flying') { this.state = 'cruise'; return; }
    const dist = t.pos.distanceTo(ac.pos);
    const tof = dist / 780;
    _aim.copy(t.pos).addScaledVector(t.vel, tof * (0.75 + this.skill * 0.25)).addScaledVector(ac.vel, -tof * 0.2);
    _aim.addScaledVector(this.noise, Math.min(dist, 400) * 0.02);
    _dir.copy(_aim).sub(ac.pos).normalize();

    // avoid ramming: break off when very close and closing
    _tmp.copy(t.vel).sub(ac.vel);
    const closing = -_tmp.dot(_dir);
    if (dist < 70 && closing > 8) {
      ac.fm.up(_u);
      _dir.addScaledVector(_u, 1.2).normalize();
    }
    this.steer(_dir, 1);
    ac.fm.throttle = dist < 150 && closing > 5 ? 0.6 : 1;

    // shoot
    ac.fm.forward(_f);
    const off = Math.acos(clamp(_f.dot(_dir), -1, 1));
    const tol = 0.03 + (1 - this.skill) * 0.05;
    const range = 220 + this.skill * 220;
    if (dist < range && off < tol) {
      if (this.burst <= 0) this.burst = rand(0.4, 1.0) + this.skill * 0.6;
    }
    if (this.burst > 0) {
      this.burst -= dt;
      if (dist < range * 1.2 && off < tol * 2.5) ac.firing = true;
      else this.burst = 0;
    }
  }

  doEvade(dt) {
    const ac = this.ac, fm = ac.fm;
    this.evadeTime -= dt;
    if (this.evadeTime <= 0) { this.state = 'cruise'; this.think = 0; return; }
    fm.forward(_f); fm.right(_r); fm.up(_u);
    if (this.evadeStyle === 'dive') {
      _dir.copy(_f).addScaledVector(_r, this.evadeDir * 0.4); _dir.y -= 0.7;
    } else if (this.evadeStyle === 'climb') {
      _dir.copy(_r).multiplyScalar(this.evadeDir).addScaledVector(_f, 0.3); _dir.y += 0.6;
    } else {
      _dir.copy(_r).multiplyScalar(this.evadeDir).addScaledVector(_f, 0.15);
    }
    this.steer(_dir.normalize(), 1);
    fm.throttle = 1;
  }

  groundAvoid() {
    const ac = this.ac, fm = ac.fm;
    const gy = this.game.world.groundHeight(ac.pos.x, ac.pos.z);
    const agl = ac.pos.y - gy;
    const sink = Math.max(0, -fm.vel.y);
    if (agl < 120 + sink * 5) {
      fm.forward(_f);
      _dir.set(_f.x, 0, _f.z).normalize();
      _dir.y = 0.9;
      this.steer(_dir.normalize(), 1);
      fm.throttle = 1;
      return true;
    }
    return false;
  }

  // Convert a desired world direction into stick inputs.
  steer(dir, urgency = 1) {
    const fm = this.ac.fm, spec = this.ac.spec;
    _q.copy(fm.quat).invert();
    _l.copy(dir).applyQuaternion(_q);
    const fwd = -_l.z;
    const ang = Math.acos(clamp(fwd, -1, 1));
    let pitch, roll, yaw;
    if (ang < 0.12) {
      pitch = clamp(_l.y * 14, -1, 1);
      yaw = clamp(_l.x * 10, -1, 1);
      roll = clamp(-fm.bankAngle() * 0.6 + _l.x * 4, -0.5, 0.5);
    } else {
      const rollErr = Math.atan2(_l.x, _l.y);
      roll = clamp(rollErr * 2.4, -1, 1);
      const align = Math.cos(rollErr);
      pitch = align > 0.4 ? clamp(ang * 1.8, 0, 1) * urgency * (0.55 + this.skill * 0.45) : (align > -0.2 ? 0.15 : -0.05);
      yaw = clamp(_l.x * 1.5, -0.5, 0.5);
    }
    // keep flying speed: poor pilots stall more
    const vs = spec.vstall;
    const margin = 1.15 + this.skill * 0.15;
    if (fm.airspeed < vs * margin) pitch = Math.min(pitch, (fm.airspeed - vs) / vs);
    fm.controls.pitch = pitch;
    fm.controls.roll = roll;
    fm.controls.yaw = yaw;
  }
}
