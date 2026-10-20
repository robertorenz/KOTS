// The Western Front: terrain, front line, trenches, towns, aerodromes, forests, clouds and sky.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep, valueNoise, hash2, mulberry32, distToSegment2 } from './util.js';

export const HALF = 30000;
const N = 160;
const CELL = (HALF * 2) / N;

export const TOWNS = [
  { name: 'Ypres', x: -2500, z: -18000, size: 46 },
  { name: 'Poperinghe', x: -12000, z: -19500, size: 30 },
  { name: 'Bailleul', x: -14500, z: -6500, size: 28 },
  { name: 'Béthune', x: -16500, z: 3500, size: 34 },
  { name: 'Arras', x: -4200, z: 12500, size: 44 },
  { name: 'Albert', x: -9000, z: 22500, size: 30 },
  { name: 'Amiens', x: -24500, z: 25000, size: 52 },
  { name: 'Lille', x: 12000, z: -6000, size: 56 },
  { name: 'Roulers', x: 9500, z: -22500, size: 30 },
  { name: 'Courtrai', x: 21000, z: -16500, size: 38 },
  { name: 'Douai', x: 13500, z: 10000, size: 40 },
  { name: 'Cambrai', x: 16500, z: 22500, size: 42 },
  { name: 'St-Omer', x: -26000, z: -9000, size: 36 },
];

export const AIRFIELDS = [
  { id: 'estree', name: 'Estrée-Blanche', side: 'A', x: -18500, z: -1500, heading: 90 },
  { id: 'bertangles', name: 'Bertangles', side: 'A', x: -20500, z: 17500, heading: 80 },
  { id: 'abeele', name: 'Abeele', side: 'A', x: -16500, z: -15000, heading: 100 },
  { id: 'marcke', name: 'Marckebeke', side: 'G', x: 18500, z: -11500, heading: 270 },
  { id: 'roucourt', name: 'Roucourt', side: 'G', x: 17500, z: 5500, heading: 260 },
  { id: 'lechelle', name: 'Léchelle', side: 'G', x: 11500, z: 19500, heading: 280 },
];

const RIVER = [[-31000, 7500], [-22000, 5500], [-14000, 8500], [-6000, 6800], [1500, 9000], [8000, 13800], [15000, 14600], [22000, 12800], [31000, 15800]];
const CANAL = [[-7000, -31000], [-6200, -20000], [-5400, -9000], [-4800, 1000]];

const FIELD_COLORS = ['#61803b', '#6c8b40', '#58743a', '#7b9248', '#869a4f', '#5a7a3e', '#a69a58', '#9a8e50', '#b3a868', '#7a6644', '#6f5d3e'];
const MUD = ['#5e4b33', '#6b563b', '#54442f', '#625037'];
const SCAR = ['#6f6a42', '#75693f', '#66643d'];
const FOREST = ['#3d5b2d', '#37552a', '#425f30'];

export class World {
  constructor(scene, { frontShift = 0, seed = 7, clouds = 0.5 } = {}) {
    this.scene = scene;
    this.frontShift = frontShift;
    this.seed = seed;
    this.cloudCover = clouds;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.heights = new Float32Array((N + 1) * (N + 1));
    this.airfields = AIRFIELDS.map((a) => ({ ...a }));
    for (const a of this.airfields) a.h = this.baseHeight(a.x, a.z, false);
    this.towns = TOWNS.map((t) => ({ ...t }));
    this.computeHeights();
    this.buildTerrain();
    this.buildTrenches();
    this.buildRivers();
    this.buildTowns();
    this.buildRoads();
    this.buildForests();
    this.buildAirfields();
    this.buildClouds();
    this.buildSky();
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    if (this.sky) { this.scene.remove(this.sky); this.sky.geometry.dispose(); this.sky.material.dispose(); }
  }

  frontX(z) {
    return this.frontShift + 2000 * Math.sin(z / 9000) + 700 * Math.sin(z / 2700 + 1.3);
  }
  sideAt(x, z) { return x < this.frontX(z) ? 'A' : 'G'; }

  riverDist(x, z) {
    let d = 1e9;
    for (let i = 0; i < RIVER.length - 1; i++) d = Math.min(d, distToSegment2(x, z, RIVER[i][0], RIVER[i][1], RIVER[i + 1][0], RIVER[i + 1][1]));
    return d;
  }

  baseHeight(x, z, flatten = true) {
    const s = this.seed;
    let h = 70 * valueNoise(x / 7000, z / 7000, s) + 30 * valueNoise(x / 2200 + 7, z / 2200 + 3, s) + 8 * valueNoise(x / 700, z / 700, s);
    h *= smoothstep(150, 2000, this.riverDist(x, z));
    if (flatten) {
      for (const a of this.airfields) {
        const d = Math.hypot(x - a.x, z - a.z);
        if (d < 1300) h = lerp(h, a.h, 1 - smoothstep(550, 1300, d));
      }
    }
    return h;
  }

  computeHeights() {
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        this.heights[j * (N + 1) + i] = this.baseHeight(-HALF + i * CELL, -HALF + j * CELL);
      }
    }
  }

  groundHeight(x, z) {
    const gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    if (gx < 0 || gz < 0 || gx >= N || gz >= N) return 0;
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const H = this.heights, W = N + 1;
    const a = H[j * W + i], b = H[j * W + i + 1], c = H[(j + 1) * W + i], d = H[(j + 1) * W + i + 1];
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  // Colour of the ground at a point (used for terrain and the briefing map)
  groundColor(x, z, out) {
    const fd = Math.abs(x - this.frontX(z));
    const ci = Math.floor((x + HALF) / CELL), cj = Math.floor((z + HALF) / CELL);
    const hv = hash2(ci, cj, this.seed + 11);
    let col;
    if (fd < 650) col = MUD[Math.floor(hv * MUD.length)];
    else if (fd < 1600 && hv < smoothstep(1600, 650, fd) * 1.2) col = SCAR[Math.floor(hv * 7) % SCAR.length];
    else if (valueNoise(x / 3500 + 11, z / 3500 + 5, this.seed) > 0.68) col = FOREST[Math.floor(hv * FOREST.length)];
    else col = FIELD_COLORS[Math.floor(hv * FIELD_COLORS.length)];
    for (const t of this.towns) {
      if (Math.hypot(x - t.x, z - t.z) < t.size * 11) { col = this.isRuined(t) ? '#6e6658' : '#7d7563'; break; }
    }
    for (const a of this.airfields) {
      if (Math.hypot(x - a.x, z - a.z) < 520) { col = '#7d9a4c'; break; }
    }
    return out.set(col);
  }

  isRuined(t) { return Math.abs(t.x - this.frontX(t.z)) < 3200; }
  isForest(x, z) { return valueNoise(x / 3500 + 11, z / 3500 + 5, this.seed) > 0.7 && Math.abs(x - this.frontX(z)) > 1700; }

  buildTerrain() {
    const tris = N * N * 2;
    const pos = new Float32Array(tris * 9), col = new Float32Array(tris * 9);
    const c = new THREE.Color();
    const H = this.heights, W = N + 1;
    let p = 0;
    const rng = mulberry32(this.seed);
    const put = (i, j, cc) => {
      pos[p] = -HALF + i * CELL; pos[p + 1] = H[j * W + i]; pos[p + 2] = -HALF + j * CELL;
      col[p] = cc.r; col[p + 1] = cc.g; col[p + 2] = cc.b; p += 3;
    };
    const c2 = new THREE.Color();
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const cx = -HALF + (i + 0.5) * CELL, cz = -HALF + (j + 0.5) * CELL;
        this.groundColor(cx, cz, c);
        c2.copy(c).multiplyScalar(0.95 + rng() * 0.08);
        put(i, j, c2); put(i, j + 1, c2); put(i + 1, j, c2);
        c2.copy(c).multiplyScalar(0.95 + rng() * 0.08);
        put(i + 1, j, c2); put(i, j + 1, c2); put(i + 1, j + 1, c2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(g, m);
    this.group.add(mesh);

    // Endless plain beyond the map edge
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(400000, 400000).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#5f7a3c' }),
    );
    outer.position.y = -3;
    this.group.add(outer);
  }

  // Flat ribbon following a 2D polyline, draped on the terrain
  ribbon(points, width, color, lift = 0.6) {
    const pos = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i], [bx, bz] = points[i + 1];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * width * 0.5, nz = (dx / l) * width * 0.5;
      const ha = this.groundHeight(ax, az) + lift, hb = this.groundHeight(bx, bz) + lift;
      pos.push(ax - nx, ha, az - nz, ax + nx, ha, az + nz, bx - nx, hb, bz - nz);
      pos.push(bx - nx, hb, bz - nz, ax + nx, ha, az + nz, bx + nx, hb, bz + nz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    // ensure the ribbon faces up regardless of winding
    const m = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    this.group.add(mesh);
    return mesh;
  }

  // Resample polyline so the ribbon hugs the terrain
  densify(pts, step = 120) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
      for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  buildTrenches() {
    const lines = [
      { off: -380, col: '#3b2f22', w: 7 }, { off: -560, col: '#43362a', w: 5 },
      { off: 380, col: '#3b2f22', w: 7 }, { off: 560, col: '#43362a', w: 5 },
    ];
    for (const L of lines) {
      const pts = [];
      let k = 0;
      for (let z = -HALF; z <= HALF; z += 45, k++) pts.push([this.frontX(z) + L.off + (k % 2 ? 14 : -14), z]);
      this.ribbon(pts, L.w, L.col, 0.8);
    }
    // communication trenches
    const rng = mulberry32(this.seed + 3);
    for (let z = -HALF + 800; z < HALF; z += 1800 + rng() * 1200) {
      for (const dir of [-1, 1]) {
        const x0 = this.frontX(z) + dir * 380;
        const pts = [];
        let x = x0, zz = z;
        for (let s = 0; s < 18; s++) { pts.push([x, zz]); x += dir * 60; zz += (rng() - 0.5) * 70; }
        this.ribbon(pts, 4, '#3f3226', 0.8);
      }
    }
    // shell craters in no-man's land
    const geo = new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2);
    const count = 2600;
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: '#3f3022' }), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const z = -HALF + rng() * HALF * 2;
      const x = this.frontX(z) + (rng() - 0.5) * 1300;
      const r = 3 + rng() * 9;
      p.set(x, this.groundHeight(x, z) + 0.9, z); s.set(r, 1, r);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    this.group.add(inst);
  }

  buildRivers() {
    this.ribbon(this.densify(RIVER, 150), 70, '#4f7891', 0.9);
    this.ribbon(this.densify(CANAL, 150), 30, '#4f7891', 0.9);
  }

  buildTowns() {
    const geoms = [];
    const c = new THREE.Color();
    const rng = mulberry32(this.seed + 5);
    const box = (w, h, d, x, y, z, ry, color) => {
      const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
      g.rotateY(ry); g.translate(x, y + h / 2, z);
      tint(g, c.set(color)); geoms.push(g);
    };
    const roof = (w, h, d, x, y, z, ry, color) => {
      // gabled roof: triangular prism
      const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
      const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }).toNonIndexed();
      g.translate(0, 0, -d / 2); g.rotateY(ry); g.translate(x, y, z);
      tint(g, c.set(color)); geoms.push(g);
    };
    for (const t of this.towns) {
      const ruined = this.isRuined(t);
      const R = t.size * 9;
      for (let i = 0; i < t.size * 2.2; i++) {
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * R;
        const x = t.x + Math.cos(a) * rr, z = t.z + Math.sin(a) * rr;
        const gy = this.groundHeight(x, z);
        const w = 7 + rng() * 8, d = 8 + rng() * 9, h = ruined ? 2 + rng() * 5 : 6 + rng() * 7;
        const ry = Math.floor(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.2;
        const wall = ruined ? ['#8a8478', '#7b756a', '#6d675d'][Math.floor(rng() * 3)] : ['#d8ccb0', '#c9b796', '#b9a789', '#d4c8b4'][Math.floor(rng() * 4)];
        box(w, h, d, x, gy, z, ry, wall);
        if (!ruined || rng() < 0.15) roof(w + 1, 4 + rng() * 2, d + 1, x, gy + h, z, ry, ['#a3452f', '#8f3c2a', '#5b5f63', '#b0533a'][Math.floor(rng() * 4)]);
      }
      // church
      const gy = this.groundHeight(t.x, t.z);
      if (ruined) {
        box(14, 14, 26, t.x, gy, t.z, 0.3, '#7b756a');
        box(7, 22, 7, t.x + 8, gy, t.z - 12, 0.3, '#6d675d');
      } else {
        box(14, 16, 30, t.x, gy, t.z, 0.3, '#cfc3a8');
        box(8, 34, 8, t.x + 3, gy, t.z - 17, 0.3, '#c2b498');
        const spire = new THREE.ConeGeometry(5.5, 16, 4).toNonIndexed();
        spire.rotateY(Math.PI / 4 + 0.3); spire.translate(t.x + 3, gy + 42, t.z - 17);
        tint(spire, c.set('#5b5f63')); geoms.push(spire);
      }
    }
    const merged = mergeGeometries(geoms);
    merged.computeVertexNormals();
    this.group.add(new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  }

  buildRoads() {
    const ts = this.towns;
    const done = new Set();
    for (let i = 0; i < ts.length; i++) {
      const near = ts.map((t, j) => ({ j, d: Math.hypot(t.x - ts[i].x, t.z - ts[i].z) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2);
      for (const { j } of near) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (done.has(key)) continue;
        done.add(key);
        const pts = this.densify([[ts[i].x, ts[i].z], [ts[j].x, ts[j].z]], 150);
        // break the road across no-man's land
        let seg = [];
        for (const p of pts) {
          if (Math.abs(p[0] - this.frontX(p[1])) < 900) { if (seg.length > 1) this.ribbon(seg, 9, '#b09d74', 0.7); seg = []; }
          else seg.push(p);
        }
        if (seg.length > 1) this.ribbon(seg, 9, '#b09d74', 0.7);
      }
    }
  }

  buildForests() {
    const rng = mulberry32(this.seed + 9);
    const cone = new THREE.ConeGeometry(4.5, 14, 5);
    cone.translate(0, 7, 0);
    const max = 5000;
    const inst = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ color: '#2f4a24', flatShading: true }), max);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0, tries = 0;
    while (n < max && tries < 60000) {
      tries++;
      const x = (rng() * 2 - 1) * (HALF - 500), z = (rng() * 2 - 1) * (HALF - 500);
      const forest = this.isForest(x, z);
      if (!forest && rng() > 0.04) continue;
      if (Math.abs(x - this.frontX(z)) < 1700) continue;
      if (this.riverDist(x, z) < 90) continue;
      if (this.airfields.some((a) => Math.hypot(x - a.x, z - a.z) < 700)) continue;
      if (this.towns.some((t) => Math.hypot(x - t.x, z - t.z) < t.size * 11)) continue;
      const sc = 0.7 + rng() * 0.8;
      p.set(x, this.groundHeight(x, z) - 0.5, z); s.set(sc, sc * (0.8 + rng() * 0.5), sc);
      m.compose(p, q, s);
      inst.setMatrixAt(n++, m);
    }
    inst.count = n;
    this.group.add(inst);

    // shattered tree stumps near the front
    const stump = new THREE.CylinderGeometry(0.3, 0.5, 6, 4);
    stump.translate(0, 3, 0);
    const st = new THREE.InstancedMesh(stump, new THREE.MeshLambertMaterial({ color: '#3a3026' }), 500);
    for (let i = 0; i < 500; i++) {
      const z = -HALF + rng() * HALF * 2;
      const x = this.frontX(z) + (rng() - 0.5) * 2600;
      q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5));
      p.set(x, this.groundHeight(x, z) - 0.3, z); s.set(1, 0.5 + rng(), 1);
      m.compose(p, q, s);
      st.setMatrixAt(i, m);
    }
    this.group.add(st);
  }

  buildAirfields() {
    const geoms = [];
    const c = new THREE.Color();
    for (const a of this.airfields) {
      const h = a.h;
      const ry = -a.heading * (Math.PI / 180);
      const strip = new THREE.PlaneGeometry(70, 900).rotateX(-Math.PI / 2).toNonIndexed();
      strip.rotateY(ry); strip.translate(a.x, h + 0.5, a.z);
      tint(strip, c.set('#93ad5c')); geoms.push(strip);
      // hangars along one side of the strip
      const side = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
      const along = new THREE.Vector3(Math.sin(ry) * -1, 0, -Math.cos(ry));
      for (let k = 0; k < 4; k++) {
        const off = side.clone().multiplyScalar(110).add(along.clone().multiplyScalar(-90 + k * 60));
        const x = a.x + off.x, z = a.z + off.z;
        const canvas = a.side === 'A' ? '#cdbb8e' : '#7d6247';
        const g = new THREE.BoxGeometry(22, 7, 26).toNonIndexed();
        g.translate(0, 3.5, 0); g.rotateY(ry); g.translate(x, h, z);
        tint(g, c.set(canvas)); geoms.push(g);
        const shape = new THREE.Shape([new THREE.Vector2(-11.5, 0), new THREE.Vector2(11.5, 0), new THREE.Vector2(0, 5)]);
        const rg = new THREE.ExtrudeGeometry(shape, { depth: 27, bevelEnabled: false }).toNonIndexed();
        rg.translate(0, 7, -13.5); rg.rotateY(ry); rg.translate(x, h, z);
        tint(rg, c.set(a.side === 'A' ? '#b9a679' : '#6a523b')); geoms.push(rg);
      }
      // windsock pole
      const pole = new THREE.CylinderGeometry(0.2, 0.2, 10, 4).toNonIndexed();
      pole.translate(a.x - side.x * 60, h + 5, a.z - side.z * 60);
      tint(pole, c.set('#e8e2d4')); geoms.push(pole);
      const sock = new THREE.ConeGeometry(0.8, 4, 6).toNonIndexed();
      sock.rotateZ(Math.PI / 2); sock.translate(a.x - side.x * 60 + 2, h + 9.5, a.z - side.z * 60);
      tint(sock, c.set('#e07a2f')); geoms.push(sock);
    }
    const merged = mergeGeometries(geoms);
    merged.computeVertexNormals();
    this.group.add(new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));
  }

  buildClouds() {
    const rng = mulberry32(this.seed + 21);
    const geoms = [];
    const count = Math.round(14 + this.cloudCover * 50);
    this.cloudList = [];
    for (let i = 0; i < count; i++) {
      const cx = (rng() * 2 - 1) * 34000, cz = (rng() * 2 - 1) * 34000, cy = 1300 + rng() * 1400;
      const puffs = 4 + Math.floor(rng() * 6);
      for (let k = 0; k < puffs; k++) {
        const g = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
        const r = 90 + rng() * 150;
        g.scale(r * (1.2 + rng() * 0.8), r * (0.45 + rng() * 0.25), r * (1 + rng() * 0.6));
        g.translate(cx + (rng() - 0.5) * 520, cy + (rng() - 0.5) * 70, cz + (rng() - 0.5) * 420);
        geoms.push(g);
      }
      this.cloudList.push({ x: cx, y: cy, z: cz, r: 450 });
    }
    const merged = mergeGeometries(geoms);
    merged.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: '#f3f5f7', emissive: '#9aa6b2', flatShading: true });
    this.group.add(new THREE.Mesh(merged, mat));
  }

  buildSky() {
    const g = new THREE.SphereGeometry(36000, 24, 16);
    const col = [];
    const top = new THREE.Color('#3d6fa8'), hor = new THREE.Color('#c4d6e4'), below = new THREE.Color('#9fb3c0');
    const c = new THREE.Color();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 36000;
      if (y >= 0) c.copy(hor).lerp(top, Math.pow(clamp(y, 0, 1), 0.55));
      else c.copy(hor).lerp(below, clamp(-y * 4, 0, 1));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(g, m);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog('#c4d6e4', 7000, 33000);
  }

  update(camera) {
    if (this.sky) this.sky.position.copy(camera.position);
  }

  // Pre-render a top-down map image for briefings / in-flight map
  renderMap(size = 360) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const c = new THREE.Color();
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = -HALF + ((px + 0.5) / size) * HALF * 2, z = -HALF + ((py + 0.5) / size) * HALF * 2;
        this.groundColor(x, z, c);
        if (this.riverDist(x, z) < 120) c.set('#4f7891');
        const i = (py * size + px) * 4;
        const sc = c.clone().convertLinearToSRGB();
        img.data[i] = sc.r * 255; img.data[i + 1] = sc.g * 255; img.data[i + 2] = sc.b * 255; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

function tint(g, color) {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.normal) g.deleteAttribute('normal');
}

export function worldToMap(x, z, size) {
  return [((x + HALF) / (HALF * 2)) * size, ((z + HALF) / (HALF * 2)) * size];
}
