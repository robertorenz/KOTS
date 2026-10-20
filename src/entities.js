// Game entities: aircraft, balloons, ground targets, AA sites.
import * as THREE from 'three';
import { AIRCRAFT, defaultScheme } from './data.js';
import { FlightModel, GEAR_HEIGHT } from './flight.js';
import { buildAircraft, buildBalloon, buildStructure, buildAAGun, buildParachute } from './models.js';
import { clamp, rand, chance } from './util.js';

let nextId = 1;
const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();

export class Aircraft {
  constructor(game, o) {
    this.id = nextId++;
    this.game = game;
    this.type = o.type;
    this.spec = AIRCRAFT[o.type];
    this.team = o.team;
    this.isPlayer = !!o.isPlayer;
    this.ace = o.ace || null;
    this.skill = o.skill ?? 0.5;
    this.callsign = o.callsign || (this.ace ? this.ace.name : this.spec.name);
    this.role = this.spec.role;
    this.fm = new FlightModel(this.spec);
    this.fm.pos.copy(o.pos);
    this.fm.setAttitude(o.heading || 0, 0, 0);
    this.fm.vel.copy(this.fm.forward(_f)).multiplyScalar(o.speed ?? this.spec.vmax * 0.8);
    this.fm.throttle = o.throttle ?? 0.85;
    if (o.onGround) { this.fm.onGround = true; this.fm.vel.set(0, 0, 0); this.fm.throttle = 0; }
    this.model = buildAircraft(this.spec, o.scheme || defaultScheme(o.type, o.nation));
    this.mesh = this.model.group;
    game.scene.add(this.mesh);
    this.radius = Math.max(3.0, this.spec.model.span * 0.36);
    this.ammo = this.spec.ammo * this.spec.guns;
    this.bombs = o.bombs ?? 0;
    this.gunTimer = 0;
    this.gunSide = 1;
    this.jammed = false;
    this.jamTimer = 0;
    this.heat = 0;
    this.firing = false;
    this.gunnerAmmo = this.spec.gunner ? 500 : 0;
    this.gunnerTimer = 0;
    this.gunnerBurst = 0;
    this.structure = this.role === 'twoseater' ? 44 : 32;
    this.pilotHealth = 100;
    this.state = 'flying'; // flying | falling | landed | dead
    this.fallCause = null;
    this.onFire = false;
    this.smoke = 0;
    this.fxTimer = 0;
    this.lastAttacker = null;
    this.hitTimer = 0;
    this.ai = null;
    this.landedTime = 0;
    this.leaking = false;
  }

  get pos() { return this.fm.pos; }
  get vel() { return this.fm.vel; }
  get alive() { return this.state === 'flying' || this.state === 'landed'; }

  update(dt) {
    if (this.state === 'dead') return;
    const game = this.game, fm = this.fm;
    const gy = game.world.groundHeight(fm.pos.x, fm.pos.z);

    if (this.state === 'falling') {
      const c = fm.controls;
      if (this.fallCause === 'pilot') { c.pitch = 0.25; c.roll = 0.5; c.yaw = 0.3; }
      else if (this.fallCause === 'breakup') { c.pitch = -0.3; c.roll = 1; c.yaw = 0; }
      else { c.pitch = -0.5; c.roll = 0.25; c.yaw = 0; }
    }

    fm.step(dt, gy);
    this.heat = Math.max(0, this.heat - dt * 0.35);
    this.hitTimer = Math.max(0, this.hitTimer - dt);

    // ground contact
    if (!fm.onGround && fm.pos.y - GEAR_HEIGHT <= gy) {
      const vy = fm.vel.y, bank = Math.abs(fm.bankAngle()), pitch = fm.pitchAngle();
      const soft = this.state === 'flying' && vy > -4.5 && bank < 0.35 && pitch > -0.15 && fm.airspeed < this.spec.vmax * 0.9;
      const easy = this.isPlayer && game.settings.easyLanding && this.state === 'flying' && vy > -8 && bank < 0.6 && pitch > -0.3;
      if (soft || easy) {
        fm.onGround = true;
        fm.vel.y = 0;
        fm.pos.y = gy + GEAR_HEIGHT;
        game.events.touchdown?.(this);
      } else {
        this.crash();
        return;
      }
    }
    if (fm.onGround && this.state === 'flying' && fm.airspeed < 2.5) {
      this.landedTime += dt;
      if (this.landedTime > 1.0) { this.state = 'landed'; game.events.landed?.(this); }
    } else if (!fm.onGround) this.landedTime = 0;
    if (this.state === 'landed' && !fm.onGround) this.state = 'flying';

    // weapons
    if (this.firing && this.state === 'flying') this.fireGuns(dt);
    else this.gunTimer = 0;
    if (this.jammed && !this.isPlayer) {
      this.jamTimer -= dt;
      if (this.jamTimer <= 0) this.jammed = false;
    }
    if (this.spec.gunner && this.state === 'flying') this.updateGunner(dt);

    // effects
    this.fxTimer -= dt;
    if (this.fxTimer <= 0) {
      const p = game.particles;
      fm.forward(_f);
      _v.copy(fm.pos).addScaledVector(_f, -1.0);
      if (this.onFire) { p.fire(_v, _d.copy(fm.vel).multiplyScalar(0.3)); this.fxTimer = 0.025; }
      else if (this.state === 'falling') { p.smoke(_v, _d.copy(fm.vel).multiplyScalar(0.2), 0.95, 4); this.fxTimer = 0.05; }
      else if (fm.engineHealth < 0.75) { p.smoke(_v, _d.copy(fm.vel).multiplyScalar(0.2), 1 - fm.engineHealth, 2.5); this.fxTimer = 0.03 + fm.engineHealth * 0.12; }
      else this.fxTimer = 0.2;
    }

    // sync mesh
    this.mesh.position.copy(fm.pos);
    this.mesh.quaternion.copy(fm.quat);
    const spin = fm.rpm / 60 * Math.PI * 2;
    this.model.prop.rotation.z += spin * dt;
    const fast = fm.rpm > 350;
    this.model.prop.visible = !fast || (this.isPlayer && game.view !== 'cockpit');
    const inCockpit = this.isPlayer && (game.view === 'cockpit' || game.view === 'padlock');
    this.model.propDisc.visible = fast && !inCockpit;
  }

  fireGuns(dt) {
    const game = this.game;
    if (this.jammed) return;
    const unlimited = this.isPlayer && game.settings.unlimitedAmmo;
    if (this.ammo <= 0 && !unlimited) return;
    const fm = this.fm;
    const interval = 1 / (this.spec.rof * this.spec.guns);
    this.gunTimer -= dt;
    fm.forward(_f); fm.up(_u); fm.right(_r);
    while (this.gunTimer <= 0) {
      this.gunTimer += interval;
      if (!unlimited) this.ammo--;
      this.gunSide = -this.gunSide;
      const origin = _v.copy(fm.pos).addScaledVector(_f, 3).addScaledVector(_u, 0.6).addScaledVector(_r, this.spec.guns > 1 ? 0.17 * this.gunSide : 0.1);
      const spread = 0.0035 + (this.isPlayer ? 0 : (1 - this.skill) * 0.004);
      _d.copy(_f).addScaledVector(_u, (Math.random() - 0.5) * spread).addScaledVector(_r, (Math.random() - 0.5) * spread).normalize();
      game.bullets.spawn(this, origin, _d.multiplyScalar(780).add(fm.vel), this.team);
      if (this.isPlayer) game.audio.gun();
      else game.audio.enemyGun(game.camera.position.distanceTo(fm.pos));
      this.heat = Math.min(1, this.heat + 0.045);
      const jamOn = this.isPlayer ? !game.settings.noJams : true;
      if (jamOn && Math.random() < 0.0005 + this.heat * this.heat * 0.006) {
        this.jammed = true;
        this.jamTimer = rand(2, 5);
        if (this.isPlayer) { game.hud.message('Guns jammed! Tap J to clear', 'warn'); game.audio.jam(); }
        break;
      }
      if (this.ammo <= 0 && !unlimited) {
        if (this.isPlayer) game.hud.message('Out of ammunition', 'warn');
        break;
      }
    }
  }

  tryClearJam() {
    if (!this.jammed) return;
    this.game.audio.click();
    if (Math.random() < 0.3) {
      this.jammed = false;
      this.heat *= 0.5;
      this.game.hud.message('Guns cleared', 'ok');
    }
  }

  updateGunner(dt) {
    if (this.gunnerAmmo <= 0) return;
    this.gunnerTimer -= dt;
    const game = this.game;
    let best = null, bestD = 550;
    this.fm.forward(_f);
    for (const o of game.aircraft) {
      if (o.team === this.team || o.state !== 'flying') continue;
      const d = o.pos.distanceTo(this.pos);
      if (d > bestD) continue;
      _d.copy(o.pos).sub(this.pos).divideScalar(d);
      if (_d.dot(_f) > 0.35) continue; // gunner covers the rear and sides
      best = o; bestD = d;
    }
    if (!best) { this.gunnerBurst = 0; return; }
    if (this.gunnerBurst <= 0) {
      if (this.gunnerTimer > 0) return;
      this.gunnerBurst = rand(0.8, 1.8);
      this.gunnerTimer = rand(0.8, 2.0);
    }
    this.gunnerBurst -= dt;
    this._gunnerAcc = (this._gunnerAcc || 0) + dt;
    while (this._gunnerAcc > 1 / 8) {
      this._gunnerAcc -= 1 / 8;
      this.gunnerAmmo--;
      const t = bestD / 760;
      const aim = _v.copy(best.pos).addScaledVector(best.vel, t).sub(this.vel.clone().multiplyScalar(t));
      const err = (1 - this.skill) * 0.05 + 0.012;
      _d.copy(aim).sub(this.pos).normalize();
      _d.x += (Math.random() - 0.5) * err; _d.y += (Math.random() - 0.5) * err; _d.z += (Math.random() - 0.5) * err;
      _d.normalize();
      const origin = this.pos.clone().addScaledVector(_d, 3).add(new THREE.Vector3(0, 0.9, 0));
      game.bullets.spawn(this, origin, _d.multiplyScalar(760).add(this.vel), this.team);
      game.audio.enemyGun(game.camera.position.distanceTo(this.pos));
    }
  }

  hit(dmg, attacker, point) {
    const game = this.game;
    if (point) game.particles.sparks(point);
    if (this.state !== 'flying' && this.state !== 'landed') return;
    if (this.isPlayer) { game.audio.hit(); game.hud.hitFlash(); }
    if (this.isPlayer && game.settings.invulnerable) return;
    if (attacker) this.lastAttacker = attacker;
    this.hitTimer = 2;
    this.structure -= dmg;
    const fm = this.fm;
    const r = Math.random();
    const say = (t, k = 'warn') => { if (this.isPlayer) game.hud.message(t, k); };
    if (r < 0.03) {
      this.pilotHealth -= rand(25, 80);
      if (this.isPlayer) { game.hud.woundFlash(); say(this.pilotHealth > 0 ? 'You are wounded!' : 'You have been hit...', 'bad'); }
      if (this.pilotHealth <= 0) return this.shotDown('pilot');
    } else if (r < 0.1) {
      fm.engineHealth -= rand(0.2, 0.45);
      if (fm.engineHealth <= 0) { fm.engineHealth = 0; fm.engineRunning = false; say('Engine destroyed!', 'bad'); }
      else say('Engine hit!');
      if (this.isPlayer) game.hud.oil = Math.min(1, game.hud.oil + 0.35);
    } else if (r < 0.135) {
      fm.fuelLeak += 0.0025;
      say('Fuel tank holed!');
      if (chance(0.25)) return this.shotDown('fire');
    } else if (r < 0.17) {
      fm.controlHealth = Math.max(0.35, fm.controlHealth - 0.15);
      say('Control wires damaged!');
    } else if (r < 0.19) {
      fm.liftFactor = Math.max(0.65, fm.liftFactor - 0.07);
      say('Wing damaged!');
    }
    if (this.structure <= 0) this.shotDown('breakup');
  }

  shotDown(cause) {
    if (this.state === 'falling' || this.state === 'dead') return;
    this.state = 'falling';
    this.fallCause = cause;
    this.firing = false;
    if (cause === 'fire') { this.onFire = true; this.fm.engineRunning = false; }
    if (cause === 'breakup') this.fm.liftFactor = 0.3;
    if (this.fm.onGround) { this.crash(); }
    this.game.events.shotDown?.(this, this.lastAttacker, cause);
  }

  crash() {
    if (this.state === 'dead') return;
    const wasFlying = this.state === 'flying' || this.state === 'landed';
    const impact = Math.abs(this.fm.vel.y);
    this.state = 'dead';
    this.firing = false;
    const g = this.game;
    g.particles.explosion(this.pos, 1);
    g.audio.explosion(g.camera.position.distanceTo(this.pos));
    this.mesh.visible = false;
    g.addWreck(this.pos.clone());
    g.events.crashed?.(this, wasFlying, impact);
  }

  dispose() {
    this.game.scene.remove(this.mesh);
  }
}

export class Balloon {
  constructor(game, { pos, side, name }) {
    this.id = nextId++;
    this.game = game;
    this.side = side;
    this.team = side;
    this.name = name || 'Observation balloon';
    this.anchor = new THREE.Vector3(pos.x, game.world.groundHeight(pos.x, pos.z), pos.z);
    this.pos = new THREE.Vector3(pos.x, this.anchor.y + (pos.y || 900), pos.z);
    this.mesh = buildBalloon(side);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = Math.PI / 2;
    game.scene.add(this.mesh);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.tether = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#222222' }));
    game.scene.add(this.tether);
    this.hp = 10;
    this.state = 'up'; // up | burning | down
    this.winching = false;
    this.fxTimer = 0;
    this.vy = 0;
    this.radius = 11;
    this.lastAttacker = null;
  }

  update(dt) {
    const g = this.game;
    if (this.state === 'up') {
      // winch down when enemy aircraft approach
      let threat = false;
      for (const a of g.aircraft) {
        if (a.team !== this.side && a.state === 'flying' && a.pos.distanceTo(this.pos) < 2200) { threat = true; break; }
      }
      const minY = this.anchor.y + 250;
      if (threat && this.pos.y > minY) this.pos.y -= 4 * dt;
    } else if (this.state === 'burning') {
      this.vy -= 6 * dt;
      this.pos.y += this.vy * dt;
      this.fxTimer -= dt;
      if (this.fxTimer <= 0) {
        this.fxTimer = 0.02;
        const p = this.pos.clone().add(new THREE.Vector3(rand(-6, 6), rand(-4, 6), rand(-12, 12)));
        g.particles.spawn(p, { vel: new THREE.Vector3(0, 5, 0), color0: '#ffe08a', color1: '#d0451b', size0: 9, size1: 4, alpha: 1, life: 0.7, drag: 1 });
        if (Math.random() < 0.6) g.particles.smoke(p, new THREE.Vector3(0, 3, 0), 0.95, 8);
      }
      this.mesh.scale.multiplyScalar(1 - dt * 0.25);
      if (this.pos.y <= this.anchor.y + 3) {
        this.state = 'down';
        this.mesh.visible = false;
        g.particles.explosion(this.pos, 1.5);
        g.addWreck(this.pos.clone());
      }
    }
    this.mesh.position.copy(this.pos);
    const a = this.tether.geometry.attributes.position;
    a.setXYZ(0, this.pos.x, this.pos.y - 11, this.pos.z);
    a.setXYZ(1, this.anchor.x, this.anchor.y, this.anchor.z);
    a.needsUpdate = true;
    this.tether.visible = this.state === 'up';
  }

  testHit(p0, p1) {
    if (this.state !== 'up') return false;
    // elongated bag: two spheres along the balloon's axis (world X after rotation)
    const c1 = this.pos.clone().add(new THREE.Vector3(-7, 0, 0)), c2 = this.pos.clone().add(new THREE.Vector3(7, 0, 0));
    return segDist(p0, p1, c1) < 9 || segDist(p0, p1, c2) < 9;
  }

  hit(dmg, attacker) {
    if (this.state !== 'up') return;
    this.lastAttacker = attacker;
    this.hp -= dmg;
    if (this.hp <= 0 || chance(0.04)) this.ignite();
  }

  ignite() {
    if (this.state !== 'up') return;
    this.state = 'burning';
    this.vy = 0;
    const g = this.game;
    g.audio.explosion(g.camera.position.distanceTo(this.pos) * 0.7);
    g.spawnParachute(this.pos.clone().add(new THREE.Vector3(0, -12, 0)));
    g.events.balloonDown?.(this, this.lastAttacker);
  }

  dispose() { this.game.scene.remove(this.mesh); this.game.scene.remove(this.tether); }
}

function segDist(p0, p1, c) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 0 ? ((c.x - p0.x) * dx + (c.y - p0.y) * dy + (c.z - p0.z) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(p0.x + dx * t - c.x, p0.y + dy * t - c.y, p0.z + dz * t - c.z);
}

export class GroundTarget {
  constructor(game, { pos, kind, side, rot = 0, group = null }) {
    this.id = nextId++;
    this.game = game;
    this.kind = kind;
    this.side = side;
    this.group = group;
    const y = game.world.groundHeight(pos.x, pos.z);
    this.pos = new THREE.Vector3(pos.x, y, pos.z);
    this.mesh = buildStructure(kind, side);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = rot;
    game.scene.add(this.mesh);
    this.hp = kind === 'hangar' ? 14 : kind === 'shed' ? 10 : 6;
    this.radius = kind === 'hangar' ? 15 : kind === 'shed' ? 12 : 7;
    this.alive = true;
  }
  hit(dmg, attacker) {
    if (!this.alive) return;
    this.hp -= dmg;
    if (this.hp <= 0) this.destroy(attacker);
  }
  destroy(attacker) {
    if (!this.alive) return;
    this.alive = false;
    const g = this.game;
    g.particles.explosion(this.pos.clone().add(new THREE.Vector3(0, 3, 0)), 1.3);
    g.audio.explosion(g.camera.position.distanceTo(this.pos));
    this.mesh.scale.y = 0.2;
    this.mesh.traverse((o) => { if (o.material) o.material = o.material.clone(); if (o.material) o.material.color.multiplyScalar(0.35); });
    g.addWreck(this.pos.clone());
    g.events.targetDestroyed?.(this, attacker);
  }
  dispose() { this.game.scene.remove(this.mesh); }
}

export class AASite {
  constructor(game, { pos, side }) {
    this.game = game;
    this.side = side;
    this.pos = new THREE.Vector3(pos.x, game.world.groundHeight(pos.x, pos.z), pos.z);
    this.mesh = buildAAGun();
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = Math.random() * 6;
    game.scene.add(this.mesh);
    this.timer = rand(1, 4);
    this.accuracy = side === 'G' ? 0.5 : 0.35;
  }
  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = rand(1.6, 3.4);
    const g = this.game;
    let target = null, best = 5200;
    for (const a of g.aircraft) {
      if (a.team === this.side || a.state !== 'flying') continue;
      const dh = Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z);
      const agl = a.pos.y - this.pos.y;
      if (agl < 220 || dh > best) continue;
      if (!a.isPlayer && a.pos.distanceTo(g.camera.position) > 6000) continue;
      best = dh; target = a;
    }
    if (!target) return;
    const dist = target.pos.distanceTo(this.pos);
    const tof = dist / 500;
    const err = 30 + dist * 0.035 * (1 - this.accuracy) + rand(0, 40);
    const p = target.pos.clone().addScaledVector(target.vel, tof * rand(0.6, 1.1));
    p.x += rand(-1, 1) * err; p.y += rand(-1, 1) * err * 0.6; p.z += rand(-1, 1) * err;
    g.particles.flak(p);
    g.audio.flak(g.camera.position.distanceTo(p));
    const miss = p.distanceTo(target.pos);
    if (miss < 18) target.hit(3, null, null);
    else if (miss < 40) target.hit(1, null, null);
  }
  dispose() { this.game.scene.remove(this.mesh); }
}

export class Parachute {
  constructor(game, pos) {
    this.game = game;
    this.pos = pos;
    this.mesh = buildParachute();
    this.mesh.position.copy(pos);
    game.scene.add(this.mesh);
    this.done = false;
  }
  update(dt) {
    if (this.done) return;
    this.pos.y -= 5 * dt;
    this.pos.x += 2 * dt;
    this.mesh.position.copy(this.pos);
    if (this.pos.y <= this.game.world.groundHeight(this.pos.x, this.pos.z)) { this.done = true; this.game.scene.remove(this.mesh); }
  }
  dispose() { this.game.scene.remove(this.mesh); }
}
