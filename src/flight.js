// Simplified WWI flight model.
// Body axes: forward = -Z, up = +Y, right = +X. World: +X east, -Z north, +Y up.
import * as THREE from 'three';
import { G } from './data.js';
import { clamp, smoothstep, DEG } from './util.js';

const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
const _vb = new THREE.Vector3(), _vd = new THREE.Vector3(), _ld = new THREE.Vector3();
const _force = new THREE.Vector3(), _qi = new THREE.Quaternion(), _dq = new THREE.Quaternion();
const _e = new THREE.Euler();

export const GEAR_HEIGHT = 1.55;

export class FlightModel {
  constructor(spec) {
    this.spec = spec;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.rates = new THREE.Vector3(); // body rates: x pitch, y yaw, z roll (rad/s)
    this.controls = { pitch: 0, roll: 0, yaw: 0 };
    this.throttle = 1;
    this.rpm = 0;
    this.engineHealth = 1;
    this.controlHealth = 1;
    this.liftFactor = 1;
    this.engineRunning = true;
    this.fuel = 1;
    this.fuelLeak = 0;
    this.onGround = false;
    this.stalled = false;
    this.alpha = 0;
    this.beta = 0;
    this.airspeed = 0;
    this.gLoad = 1;
    this.easy = false;
    this._wobble = 0;

    const s = spec;
    this.kL = (s.mass * G) / (s.vstall * s.vstall); // CLmax = 1 at stall angle
    this.T0 = s.mass * G * s.thrust;
    const tAtVmax = this.T0 * (1 - 1 / 1.35);
    this.kD = (tAtVmax / (s.vmax * s.vmax)) * 0.93;
    this.alphaStall = 0.26;
  }

  forward(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(this.quat); }
  up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  right(out = new THREE.Vector3()) { return out.set(1, 0, 0).applyQuaternion(this.quat); }

  setAttitude(headingDeg, pitchDeg = 0, rollDeg = 0) {
    _e.set(pitchDeg * DEG, -headingDeg * DEG, -rollDeg * DEG, 'YXZ');
    this.quat.setFromEuler(_e);
  }

  heading() {
    const f = this.forward(_f);
    let h = Math.atan2(f.x, -f.z) / DEG;
    if (h < 0) h += 360;
    return h;
  }
  pitchAngle() { return Math.asin(clamp(this.forward(_f).y, -1, 1)); }
  bankAngle() {
    const r = this.right(_r), u = this.up(_u);
    return Math.atan2(-r.y, u.y);
  }

  step(dt, groundY) {
    const s = this.spec;
    const f = this.forward(_f), u = this.up(_u), r = this.right(_r);
    const V = this.vel.length();
    this.airspeed = V;

    _qi.copy(this.quat).invert();
    _vb.copy(this.vel).applyQuaternion(_qi);
    const fwd = Math.max(-_vb.z, 0.5);
    this.alpha = V > 1 ? Math.atan2(-_vb.y, fwd) : 0;
    this.beta = V > 1 ? Math.atan2(_vb.x, fwd) : 0;

    // ---- engine ----
    if (this.fuelLeak > 0) this.fuel = Math.max(0, this.fuel - this.fuelLeak * dt);
    const running = this.engineRunning && this.fuel > 0 && this.engineHealth > 0;
    const maxRpm = s.rpm || 1250;
    const rpmTarget = running
      ? (0.3 + 0.7 * this.throttle) * maxRpm * (0.6 + 0.4 * this.engineHealth)
      : Math.min(V * 10, maxRpm * 0.35);
    this.rpm += (rpmTarget - this.rpm) * Math.min(1, dt * 1.8);
    const power = running ? this.throttle * (0.45 + 0.55 * this.engineHealth) : 0;
    const thrust = this.T0 * power * Math.max(0, 1 - V / (s.vmax * 1.35));
    if (running) this.fuel = Math.max(0, this.fuel - dt * this.throttle * 0.00012);

    // ---- aerodynamics ----
    const a = this.alpha, aa = Math.abs(a), as = this.alphaStall;
    let CL;
    if (aa <= as) CL = a / as;
    else CL = Math.sign(a) * Math.max(0.35, 1 - (aa - as) * 2.5);
    this.stalled = aa > as && V > 2 && !this.onGround;
    CL *= this.liftFactor;
    const q = V * V;
    const L = this.kL * q * CL;
    const D = this.kD * q + this.kL * q * CL * CL * 0.15 + (this.stalled ? this.kL * q * 0.12 : 0);

    if (V > 0.5) _vd.copy(this.vel).divideScalar(V); else _vd.copy(f);
    _ld.copy(u).addScaledVector(_vd, -u.dot(_vd));
    if (_ld.lengthSq() > 1e-6) _ld.normalize();

    _force.set(0, -s.mass * G, 0);
    _force.addScaledVector(f, thrust);
    _force.addScaledVector(_ld, L);
    _force.addScaledVector(_vd, -D);
    _force.addScaledVector(r, -_vb.x * V * this.kL * 0.25);
    this.gLoad = L / (s.mass * G);

    if (this.onGround) {
      this._groundStep(dt, groundY, thrust, D);
      return;
    }

    this.vel.addScaledVector(_force, dt / s.mass);
    this.pos.addScaledVector(this.vel, dt);

    // ---- rotation ----
    const eff = clamp(V / (s.vstall * 1.5), 0.08, 1) * this.controlHealth;
    // auto-trim: hold 1 g, but never trim slower than 1.35 x stall (positive speed stability)
    const vTrim = Math.max(V, s.vstall * 1.35);
    const trimCL = V > 1 ? clamp((s.mass * G) / (this.kL * vTrim * vTrim), 0, 0.8) : 0;
    const alphaTrim = trimCL * as * smoothstep(-0.2, 0.3, u.y);
    const stab = 2.5 * clamp(V / (s.vstall * 2), 0.2, 1.6);
    const stallFx = this.stalled && !this.easy ? 0.55 : 1;

    let pitchCmd = this.controls.pitch;
    if (this.easy && pitchCmd > 0) {
      // easy mode: never pull past the stall
      const room = clamp((as * 0.92 - a) / 0.08, 0, 1);
      pitchCmd *= room;
    }
    // elevator authority falls off with dynamic pressure at low speed (mushy controls near the stall)
    const effP = Math.min(eff, clamp((V / (s.vstall * 1.6)) ** 2, 0.08, 1) * this.controlHealth);
    const tp = pitchCmd * s.pitch * DEG * effP * stallFx - stab * (a - alphaTrim);
    const ty = -this.controls.yaw * s.yaw * DEG * eff - stab * 1.2 * this.beta;
    let tr = -this.controls.roll * s.roll * DEG * eff;
    if (this.stalled && !this.easy) {
      this._wobble += (Math.random() - 0.5) * dt * 8;
      this._wobble *= 0.98;
      tr += this._wobble * 2.2;
    }
    const k = Math.min(1, dt * 6);
    this.rates.x += (tp - this.rates.x) * k;
    this.rates.y += (ty - this.rates.y) * k;
    this.rates.z += (tr - this.rates.z) * k;

    _dq.set(this.rates.x * dt * 0.5, this.rates.y * dt * 0.5, this.rates.z * dt * 0.5, 1).normalize();
    this.quat.multiply(_dq).normalize();
  }

  _groundStep(dt, groundY, thrust, drag) {
    const s = this.spec;
    const V = this.vel.length();
    const heading = this.heading() * DEG;
    // rudder steering on the ground
    let h = heading + this.controls.yaw * dt * clamp(V / 6, 0, 1) * 0.9;
    // tail-down attitude, tail rises with speed; pilot can pull to rotate
    const tailUp = clamp(V / (s.vstall * 0.9), 0, 1);
    let pitch = 0.17 * (1 - tailUp) + 0.02;
    if (V > s.vstall * 0.8) pitch += Math.max(0, this.controls.pitch) * 0.22;
    _e.set(pitch, -h, 0, 'YXZ');
    this.quat.setFromEuler(_e);
    // forward along heading (flat)
    const dirx = Math.sin(h), dirz = -Math.cos(h);
    const brake = this.throttle < 0.08 ? 0.35 : 0.05;
    const fric = brake * s.mass * G * (V > 0.2 ? 1 : 0);
    let speed = this.vel.x * dirx + this.vel.z * dirz;
    speed += ((thrust - drag - fric) / s.mass) * dt;
    if (speed < 0) speed = 0;
    // lift on the ground uses the pitch as angle of attack
    const liftNow = this.kL * speed * speed * clamp(pitch / this.alphaStall, 0, 1) * this.liftFactor;
    this.vel.set(dirx * speed, 0, dirz * speed);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y = groundY + GEAR_HEIGHT;
    this.rates.set(0, 0, 0);
    if (liftNow > s.mass * G * 1.02) {
      this.onGround = false;
      this.vel.y = 1.0;
      this.pos.y += 0.1;
    }
  }
}
