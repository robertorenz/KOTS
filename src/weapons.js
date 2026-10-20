// Bullets and bombs.
import * as THREE from 'three';
import { buildBomb } from './models.js';
import { segmentPointDist } from './util.js';

const TRACER_A = new THREE.Color('#ffe9a0');
const TRACER_G = new THREE.Color('#ffc27a');

export class BulletSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.pool = [];
  }

  spawn(owner, origin, vel, team) {
    const b = this.pool.pop() || { pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3() };
    b.pos.copy(origin); b.prev.copy(origin); b.vel.copy(vel);
    b.owner = owner; b.team = team; b.life = 2.4;
    this.list.push(b);
  }

  clear() { this.pool.push(...this.list); this.list.length = 0; }

  update(dt) {
    const g = this.game;
    const tracers = g.tracers;
    tracers.begin();
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      b.prev.copy(b.pos);
      b.vel.y -= 9.81 * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      let dead = b.life <= 0;

      if (!dead) {
        for (const a of g.aircraft) {
          if (a === b.owner || a.team === b.team || a.state === 'dead') continue;
          const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
          if (dx * dx + dz * dz > 3600 || Math.abs(a.pos.y - b.pos.y) > 60) continue;
          if (segmentPointDist(b.prev, b.pos, a.pos) < a.radius) {
            a.hit(1, b.owner, b.pos);
            if (b.owner?.isPlayer) g.audio.thud();
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const bl of g.balloons) {
          if (bl.side === b.team) continue;
          if (bl.testHit(b.prev, b.pos)) { bl.hit(1, b.owner); g.particles.sparks(b.pos); dead = true; break; }
        }
      }
      if (!dead) {
        const gy = g.world.groundHeight(b.pos.x, b.pos.z);
        if (b.pos.y - gy < 25) {
          for (const t of g.targets) {
            if (!t.alive || t.side === b.team) continue;
            if (segmentPointDist(b.prev, b.pos, t.pos) < t.radius) { t.hit(1, b.owner); g.particles.sparks(b.pos); dead = true; break; }
          }
        }
        if (!dead && b.pos.y <= gy) {
          if (b.pos.distanceToSquared(g.camera.position) < 2500 * 2500) g.particles.dust(b.pos);
          dead = true;
        }
      }
      if (dead) {
        list[i] = list[list.length - 1];
        list.pop();
        this.pool.push(b);
      } else {
        tracers.add(b.pos, b.vel, 12, b.team === 'A' ? TRACER_A : TRACER_G);
      }
    }
    tracers.end();
  }
}

export class Bomb {
  constructor(game, owner, pos, vel) {
    this.game = game;
    this.owner = owner;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.mesh = buildBomb();
    game.scene.add(this.mesh);
    this.done = false;
  }
  update(dt) {
    if (this.done) return;
    const g = this.game;
    this.vel.y -= 9.81 * dt;
    this.vel.multiplyScalar(1 - dt * 0.02);
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.lookAt(this.pos.clone().add(this.vel));
    const gy = g.world.groundHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= gy) {
      this.done = true;
      this.pos.y = gy + 1;
      g.particles.explosion(this.pos, 1.2);
      g.audio.explosion(g.camera.position.distanceTo(this.pos));
      for (const t of g.targets) {
        if (!t.alive) continue;
        const d = t.pos.distanceTo(this.pos);
        if (d < 30 + t.radius) t.hit(d < 14 + t.radius ? 100 : 6, this.owner);
      }
      for (const a of g.aircraft) {
        if (a.fm.onGround && a.pos.distanceTo(this.pos) < 25) a.hit(30, this.owner, a.pos);
      }
      g.scene.remove(this.mesh);
    }
  }
  dispose() { this.game.scene.remove(this.mesh); }
}
