// Low-poly, flat-shaded models in the spirit of the 1990 original.
import * as THREE from 'three';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  return matCache.get(key);
}

function taperBox(w1, h1, w2, h2, len, yOff2 = 0) {
  // front face at z=-len/2, back face at z=+len/2
  const f = -len / 2, b = len / 2;
  const v = [
    [-w1 / 2, -h1 / 2, f], [w1 / 2, -h1 / 2, f], [w1 / 2, h1 / 2, f], [-w1 / 2, h1 / 2, f],
    [-w2 / 2, -h2 / 2 + yOff2, b], [w2 / 2, -h2 / 2 + yOff2, b], [w2 / 2, h2 / 2 + yOff2, b], [-w2 / 2, h2 / 2 + yOff2, b],
  ];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  const pos = [];
  for (const [a, b2, c, d] of quads) pos.push(...v[a], ...v[b2], ...v[c], ...v[a], ...v[c], ...v[d]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function box(parent, w, h, d, x, y, z, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const ROUNDELS = {
  GB: ['#1f3f8a', '#f2efe6', '#b3221c'],
  FR: ['#b3221c', '#f2efe6', '#1f3f8a'],
  US: ['#b3221c', '#1f3f8a', '#f2efe6'],
};

// Flat roundel facing +Y, built from non-overlapping rings
function roundel(nation, r) {
  const g = new THREE.Group();
  const cols = ROUNDELS[nation];
  const radii = [r, r * 0.66, r * 0.33];
  for (let i = 0; i < 3; i++) {
    const inner = i < 2 ? radii[i + 1] : 0;
    const geo = inner > 0 ? new THREE.RingGeometry(inner, radii[i], 16) : new THREE.CircleGeometry(radii[i], 16);
    geo.rotateX(-Math.PI / 2);
    g.add(new THREE.Mesh(geo, mat(cols[i], { side: THREE.DoubleSide })));
  }
  return g;
}

function ironCross(r) {
  const g = new THREE.Group();
  const white = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), mat('#efece4', { side: THREE.DoubleSide }));
  g.add(white);
  const a = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.7, r * 0.5).rotateX(-Math.PI / 2), mat('#151515', { side: THREE.DoubleSide }));
  const b = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.5, r * 1.7).rotateX(-Math.PI / 2), mat('#151515', { side: THREE.DoubleSide }));
  a.position.y = b.position.y = 0.03;
  g.add(a, b);
  return g;
}

function marking(nation, r) {
  return nation === 'DE' ? ironCross(r * 0.85) : roundel(nation, r);
}

/**
 * Build an aircraft.
 * Returns { group, prop, propDisc, cockpitHidden[], eye, gunnerPos, radius }
 */
export function buildAircraft(spec, scheme) {
  const md = spec.model;
  const S = md.span, L = md.length, C = md.chord;
  const group = new THREE.Group();
  const hidden = [];
  const nose = -L * 0.42, tail = L * 0.58;

  // ---- fuselage ----
  const fw = 0.86, fh = 0.98;
  const fus = new THREE.Mesh(taperBox(fw, fh, 0.14, 0.32, L, 0.2), mat(scheme.fuselage));
  fus.position.z = (nose + tail) / 2;
  group.add(fus);
  hidden.push(fus);
  if (md.shark) {
    // Albatros-style rounded nose spinner
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 6).rotateX(-Math.PI / 2), mat(scheme.cowl));
    sp.position.set(0, 0, nose - 0.25);
    group.add(sp); hidden.push(sp);
  }

  // ---- engine ----
  if (md.engine === 'rotary') {
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.48, 0.6, 10).rotateX(Math.PI / 2), mat(scheme.cowl));
    cowl.position.set(0, 0, nose - 0.25);
    group.add(cowl); hidden.push(cowl);
  } else {
    const rad = box(group, 0.8, 0.85, 0.2, 0, 0, nose - 0.08, '#4a4a46');
    hidden.push(rad);
    const eng = box(group, 0.3, 0.25, 1.2, 0, 0.55, nose + 0.7, '#3d3d3a');
    hidden.push(eng);
  }
  if (md.hump) {
    const h = box(group, 0.6, 0.25, 1.1, 0, 0.58, nose + 1.0, scheme.fuselage);
    hidden.push(h);
  }

  // ---- propeller ----
  const prop = new THREE.Group();
  prop.position.set(0, 0, nose - 0.62);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.06), mat('#6b4a2b'));
  prop.add(blade);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 6).rotateX(Math.PI / 2), mat('#2a2a2a'));
  prop.add(hub);
  group.add(prop);
  const propDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 20),
    new THREE.MeshBasicMaterial({ color: '#3a3026', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
  );
  propDisc.position.copy(prop.position);
  group.add(propDisc);
  hidden.push(propDisc);

  // ---- wings ----
  const wingMat = scheme.wingTop;
  const wings = [];
  const stagger = md.negStagger ? 0.35 : -0.3;
  const addWing = (span, chord, y, z, upperMarks, lowerMarks, cutout = 0) => {
    const w = new THREE.Group();
    w.position.set(0, y, z);
    if (cutout > 0) {
      // centre-section cut-out over the cockpit, as on the Camel and S.E.5a
      const half = (span - cutout) / 2;
      for (const sx of [-1, 1]) {
        const top = new THREE.Mesh(new THREE.BoxGeometry(half, 0.07, chord), mat(wingMat));
        top.position.x = sx * (cutout / 2 + half / 2);
        w.add(top);
        const under = new THREE.Mesh(new THREE.PlaneGeometry(half * 0.995, chord * 0.98).rotateX(Math.PI / 2), mat(scheme.wingBottom));
        under.position.set(sx * (cutout / 2 + half / 2), -0.04, 0);
        w.add(under);
      }
      const front = new THREE.Mesh(new THREE.BoxGeometry(cutout, 0.07, chord * 0.16), mat(wingMat));
      front.position.z = -chord * 0.42;
      w.add(front);
    } else {
      const top = new THREE.Mesh(new THREE.BoxGeometry(span, 0.07, chord), mat(wingMat));
      w.add(top);
      const under = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.995, chord * 0.98).rotateX(Math.PI / 2), mat(scheme.wingBottom));
      under.position.y = -0.04;
      w.add(under);
    }
    const r = Math.min(chord * 0.42, 0.75);
    for (const sx of [-1, 1]) {
      if (upperMarks) { const m = marking(scheme.marking, r); m.position.set(sx * span * 0.36, 0.045, 0); w.add(m); }
      if (lowerMarks) { const m = marking(scheme.marking, r); m.rotation.x = Math.PI; m.position.set(sx * span * 0.36, -0.06, 0); w.add(m); }
    }
    group.add(w);
    wings.push({ group: w, span, y, z, chord });
    return w;
  };

  let upperY = 1.25;
  if (md.wings === 'tri') {
    addWing(S, C, 1.35, stagger - 0.1, true, false);
    addWing(S * 0.94, C, 0.5, 0.0, false, false);
    addWing(S * 0.86, C, -0.45, 0.1, false, true);
    upperY = 1.35;
  } else if (md.wings === 'parasol') {
    addWing(S, C, 1.05, -0.15, true, true);
    upperY = 1.05;
  } else {
    const lowerChord = md.wings === 'sesqui' ? C * 0.55 : C;
    addWing(S, C, 1.25, stagger, true, false, 1.3);
    addWing(md.wings === 'sesqui' ? S * 0.86 : S * 0.95, lowerChord, -0.45, 0.05, false, true);
  }

  // interplane struts
  const strutCol = scheme.strut || '#4a3b2a';
  if (md.wings !== 'parasol') {
    const lowY = -0.45, h = upperY - lowY;
    const sx = S * 0.33;
    for (const s of [-1, 1]) {
      if (md.wings === 'sesqui') {
        const v = box(group, 0.07, h, 0.07, s * sx, lowY + h / 2, stagger * 0.5, strutCol);
        v.rotation.x = -0.25;
      } else {
        box(group, 0.07, h, 0.07, s * sx, lowY + h / 2, stagger * 0.5 - C * 0.3, strutCol);
        box(group, 0.07, h, 0.07, s * sx, lowY + h / 2, stagger * 0.5 + C * 0.3, strutCol);
      }
    }
  }
  // cabane struts
  for (const s of [-1, 1]) {
    const cab = box(group, 0.06, upperY - 0.45, 0.06, s * 0.38, (upperY + 0.45) / 2, stagger - 0.2, strutCol);
    cab.rotation.z = s * 0.12;
  }

  // ---- tail ----
  const ty = 0.2 + 0.05;
  const tailplane = box(group, md.wings === 'tri' ? 2.4 : 2.9, 0.06, 0.95, 0, ty, tail - 0.5, scheme.tail);
  void tailplane;
  const fin = box(group, 0.06, 1.0, 0.95, 0, ty + 0.5, tail - 0.4, scheme.tail);
  void fin;
  if (scheme.marking === 'DE') {
    const ic = ironCross(0.35); ic.rotation.z = -Math.PI / 2; ic.position.set(0.04, ty + 0.5, tail - 0.4); group.add(ic);
    const ic2 = ironCross(0.35); ic2.rotation.z = Math.PI / 2; ic2.position.set(-0.04, ty + 0.5, tail - 0.4); group.add(ic2);
  } else {
    const stripes = scheme.marking === 'GB' ? ['#1f3f8a', '#f2efe6', '#b3221c'] : scheme.marking === 'FR' ? ['#1f3f8a', '#f2efe6', '#b3221c'] : ['#1f3f8a', '#f2efe6', '#b3221c'];
    stripes.forEach((col, i) => box(group, 0.075, 0.98, 0.3, 0, ty + 0.5, tail - 0.4 - 0.3 + i * 0.3, col));
  }

  // fuselage side markings
  for (const s of [-1, 1]) {
    const m = marking(scheme.marking, 0.33);
    m.rotation.z = s * -Math.PI / 2;
    m.position.set(s * 0.29, 0.08, tail - L * 0.32);
    group.add(m);
    hidden.push(m);
  }

  // ---- undercarriage ----
  for (const s of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.12, 10).rotateZ(Math.PI / 2), mat('#2b2b2b'));
    wheel.position.set(s * 0.75, -1.22, nose + 0.9);
    group.add(wheel);
    const leg = box(group, 0.06, 0.9, 0.06, s * 0.5, -0.85, nose + 0.9, strutCol);
    leg.rotation.z = s * 0.35;
  }
  box(group, 1.6, 0.06, 0.06, 0, -1.22, nose + 0.9, strutCol);
  box(group, 0.05, 0.4, 0.05, 0, -0.25, tail - 0.3, '#3a3026');

  // ---- guns ----
  const gunY = fh / 2 + 0.08;
  for (let i = 0; i < Math.min(spec.guns, 2); i++) {
    const x = spec.guns === 1 ? 0.12 : (i ? 0.17 : -0.17);
    box(group, 0.08, 0.09, 0.85, x, gunY, nose + 0.75, '#1f1f1f');
  }

  // ---- crew ----
  const eye = new THREE.Vector3(0, 0.82, stagger + C * 0.5 + 0.85);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), mat('#5a3b24'));
  head.position.set(0, 0.62, eye.z);
  group.add(head); hidden.push(head);
  let gunnerPos = null;
  if (spec.gunner) {
    gunnerPos = new THREE.Vector3(0, 0.75, eye.z + 1.1);
    const gh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), mat('#5a3b24'));
    gh.position.set(0, 0.62, gunnerPos.z);
    group.add(gh);
    box(group, 0.08, 0.08, 0.9, 0, 0.95, gunnerPos.z + 0.3, '#1f1f1f');
  }

  // windscreen
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.22), new THREE.MeshBasicMaterial({ color: '#cfe1ea', transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  ws.position.set(0, fh / 2 + 0.11, eye.z - 0.5);
  ws.rotation.x = -0.3;
  group.add(ws); hidden.push(ws);

  return { group, prop, propDisc, cockpitHidden: hidden, eye, gunnerPos, radius: Math.max(S, L) * 0.42, wings };
}

// Observation balloon (Drachen / Caquot)
export function buildBalloon(side) {
  const g = new THREE.Group();
  const col = side === 'G' ? '#a99c78' : '#b7b09a';
  const bag = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), mat(col));
  bag.scale.set(7.5, 7.5, 18);
  g.add(bag);
  for (const a of [0, 2.1, -2.1]) {
    const fin = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 5), mat(col));
    fin.scale.set(2.2, 2.2, 4.5);
    fin.position.set(Math.sin(a) * 6.5, -Math.cos(a) * 6.5 + (a === 0 ? 0 : 1), 13);
    g.add(fin);
  }
  if (side === 'G') {
    const c = ironCross(2.0); c.rotation.z = -Math.PI / 2; c.position.set(7.4, 0, 4); g.add(c);
    const c2 = ironCross(2.0); c2.rotation.z = Math.PI / 2; c2.position.set(-7.4, 0, 4); g.add(c2);
  }
  box(g, 1.3, 1.2, 1.3, 0, -11, 0, '#5b4a35');
  for (const s of [-1, 1]) {
    const line = box(g, 0.04, 4.5, 0.04, s * 0.7, -8.5, 0, '#2a2a2a');
    line.rotation.z = s * 0.15;
  }
  return g;
}

export function buildAAGun() {
  const g = new THREE.Group();
  box(g, 3, 1.2, 4, 0, 0.6, 0, '#4d4a3a');
  const barrel = box(g, 0.25, 0.25, 4, 0, 2.0, -0.8, '#2a2a2a');
  barrel.rotation.x = 0.8;
  return g;
}

// Ground target structure: depot crates, tents, sheds
export function buildStructure(kind, side) {
  const g = new THREE.Group();
  if (kind === 'tent') {
    const shape = new THREE.Shape([new THREE.Vector2(-5, 0), new THREE.Vector2(5, 0), new THREE.Vector2(0, 5)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: false });
    geo.translate(0, 0, -6);
    g.add(new THREE.Mesh(geo, mat(side === 'G' ? '#7c7457' : '#c4b48a')));
  } else if (kind === 'shed') {
    box(g, 14, 6, 22, 0, 3, 0, '#6e5a42');
    const shape = new THREE.Shape([new THREE.Vector2(-7.5, 0), new THREE.Vector2(7.5, 0), new THREE.Vector2(0, 3.5)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 23, bevelEnabled: false });
    geo.translate(0, 6, -11.5);
    g.add(new THREE.Mesh(geo, mat('#4f4a45')));
  } else if (kind === 'hangar') {
    box(g, 22, 7, 26, 0, 3.5, 0, '#7d6247');
    const shape = new THREE.Shape([new THREE.Vector2(-11.5, 0), new THREE.Vector2(11.5, 0), new THREE.Vector2(0, 5)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 27, bevelEnabled: false });
    geo.translate(0, 7, -13.5);
    g.add(new THREE.Mesh(geo, mat('#6a523b')));
  } else if (kind === 'wagon') {
    box(g, 3, 3, 9, 0, 2.0, 0, '#5a4632');
    box(g, 3.2, 0.3, 9.4, 0, 3.6, 0, '#3e3e3a');
  } else {
    // ammunition crates
    for (let i = 0; i < 6; i++) box(g, 2.5, 1.6, 4, (i % 3) * 3 - 3, 0.8 + Math.floor(i / 3) * 1.6, 0, '#6b5537');
  }
  return g;
}

export function buildBomb() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 6).rotateX(Math.PI / 2), mat('#3a3a36'));
  g.add(body);
  return g;
}

export function buildParachute() {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e9e4d6', { side: THREE.DoubleSide }));
  canopy.position.y = 6;
  g.add(canopy);
  box(g, 0.4, 1.6, 0.4, 0, 0.8, 0, '#5a4632');
  return g;
}
