// Particle effects (smoke, fire, flak, explosions) and tracer rendering.
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
varying vec3 vColor;
varying float vAlpha;
uniform float scale;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vColor = pcolor;
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(size * scale / max(-mv.z, 0.5), 1.0, 512.0);
  #include <logdepthbuf_vertex>
}`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = vAlpha * smoothstep(0.5, 0.18, d);
  gl_FragColor = vec4(vColor, a);
  #include <logdepthbuf_fragment>
  #include <colorspace_fragment>
}`;

export class Particles {
  constructor(scene, max = 5000) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.rise = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { scale: { value: 500 } },
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._c = new THREE.Color();
    this._c2 = new THREE.Color();
  }

  dispose(scene) {
    scene.remove(this.points);
    this.geo.dispose();
    this.material.dispose();
  }

  setViewport(height, fovDeg) {
    this.material.uniforms.scale.value = height / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  spawn(p, o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    const v = o.vel;
    this.vel[i3] = v ? v.x : 0; this.vel[i3 + 1] = v ? v.y : 0; this.vel[i3 + 2] = v ? v.z : 0;
    this._c.set(o.color0 || '#888888');
    this._c2.set(o.color1 || o.color0 || '#888888');
    this.c0[i3] = this._c.r; this.c0[i3 + 1] = this._c.g; this.c0[i3 + 2] = this._c.b;
    this.c1[i3] = this._c2.r; this.c1[i3 + 1] = this._c2.g; this.c1[i3 + 2] = this._c2.b;
    this.s0[i] = o.size0 ?? 2; this.s1[i] = o.size1 ?? this.s0[i];
    this.a0[i] = o.alpha ?? 0.8;
    this.life[i] = o.life ?? 2;
    this.age[i] = 0;
    this.drag[i] = o.drag ?? 0.5;
    this.rise[i] = o.rise ?? 0;
  }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this._kill(i); continue; }
      const t = this.age[i] / this.life[i];
      const i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr + this.rise[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const ct = Math.min(1, t * 2.5);
      this.col[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * ct;
      this.col[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * ct;
      this.col[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * ct;
      this.alpha[i] = this.a0[i] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
      i++;
    }
    const g = this.geo;
    g.setDrawRange(0, this.n);
    for (const k of ['position', 'pcolor', 'size', 'alpha']) g.attributes[k].needsUpdate = true;
  }

  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    for (const arr of [this.pos, this.vel, this.col, this.c0, this.c1]) {
      arr[i3] = arr[j3]; arr[i3 + 1] = arr[j3 + 1]; arr[i3 + 2] = arr[j3 + 2];
    }
    for (const arr of [this.size, this.s0, this.s1, this.alpha, this.a0, this.life, this.age, this.drag, this.rise]) arr[i] = arr[j];
  }

  // ---------- presets ----------
  smoke(p, vel, dark = 0.4, size = 4) {
    const g = Math.round(40 + (1 - dark) * 120).toString(16).padStart(2, '0');
    this.spawn(p, { vel, color0: `#${g}${g}${g}`, size0: size, size1: size * 4, alpha: 0.55, life: 3.5, drag: 1.2, rise: 1.2 });
  }
  fire(p, vel) {
    this.spawn(p, { vel, color0: '#ffd36b', color1: '#c2401b', size0: 3, size1: 1.5, alpha: 0.95, life: 0.5, drag: 2 });
    if (Math.random() < 0.5) this.smoke(p, vel, 0.9, 3);
  }
  flak(p) {
    for (let k = 0; k < 6; k++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
      this.spawn(p, { vel: v, color0: '#ffb347', color1: '#1c1c1c', size0: 6, size1: 26, alpha: 0.85, life: 6 + Math.random() * 3, drag: 1.5, rise: 0.2 });
    }
  }
  explosion(p, scale = 1) {
    for (let k = 0; k < 18; k++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5)).multiplyScalar(30 * scale);
      this.spawn(p, { vel: v, color0: '#fff1a8', color1: '#d2481c', size0: 8 * scale, size1: 3 * scale, alpha: 1, life: 0.6 + Math.random() * 0.5, drag: 3 });
    }
    for (let k = 0; k < 14; k++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.6, (Math.random() - 0.5)).multiplyScalar(14 * scale);
      this.spawn(p, { vel: v, color0: '#5a4a3a', color1: '#2a2a2a', size0: 10 * scale, size1: 40 * scale, alpha: 0.7, life: 5 + Math.random() * 3, drag: 1.5, rise: 2 });
    }
  }
  dust(p) {
    this.spawn(p, { vel: new THREE.Vector3(0, 3, 0), color0: '#8a7656', size0: 1.5, size1: 5, alpha: 0.6, life: 1.2, drag: 2 });
  }
  sparks(p) {
    for (let k = 0; k < 3; k++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
      this.spawn(p, { vel: v, color0: '#fff4c0', color1: '#ff9a3c', size0: 0.8, size1: 0.3, alpha: 1, life: 0.25, drag: 1 });
    }
    this.spawn(p, { color0: '#9a9a9a', size0: 1, size1: 3, alpha: 0.5, life: 0.8 });
  }
}

// Tracer line segments
export class Tracers {
  constructor(scene, max = 1200) {
    this.max = max;
    this.pos = new Float32Array(max * 6);
    this.col = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, fog: false }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.n = 0;
  }
  dispose(scene) { scene.remove(this.lines); this.geo.dispose(); this.lines.material.dispose(); }
  begin() { this.n = 0; }
  add(p, v, len, color) {
    if (this.n >= this.max) return;
    const i = this.n++ * 6;
    const s = len / Math.max(1, Math.hypot(v.x, v.y, v.z));
    this.pos[i] = p.x; this.pos[i + 1] = p.y; this.pos[i + 2] = p.z;
    this.pos[i + 3] = p.x - v.x * s; this.pos[i + 4] = p.y - v.y * s; this.pos[i + 5] = p.z - v.z * s;
    this.col[i] = color.r; this.col[i + 1] = color.g; this.col[i + 2] = color.b;
    this.col[i + 3] = color.r * 0.4; this.col[i + 4] = color.g * 0.4; this.col[i + 5] = color.b * 0.4;
  }
  end() {
    this.geo.setDrawRange(0, this.n * 2);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
