// 2D overlay: cockpit instrument panel, gunsight, messages, map, indicators.
import * as THREE from 'three';
import { clamp, DEG } from './util.js';
import { HALF, worldToMap } from './world.js';

const _p = new THREE.Vector3();

export class HUD {
  constructor(canvas, game) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.messages = [];
    this.flash = 0;
    this.wound = 0;
    this.oil = 0;
    this.showMap = false;
    this.oilBlobs = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random() * 0.7, r: 8 + Math.random() * 40 }));
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.cv.width = this.w * dpr;
    this.cv.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.panelH = Math.round(clamp(this.h * 0.24, 140, 240));
    this.panelCache = null;
  }

  reset() { this.messages = []; this.flash = 0; this.wound = 0; this.oil = 0; this.showMap = false; }

  message(text, kind = 'info') {
    this.messages.push({ text, kind, t: 0 });
    if (this.messages.length > 6) this.messages.shift();
  }
  hitFlash() { this.flash = Math.min(0.5, this.flash + 0.18); }
  woundFlash() { this.wound = 1; }

  clear() { this.ctx.clearRect(0, 0, this.w, this.h); }

  draw(dt) {
    const g = this.game, ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    const p = g.player;
    if (!p) return;
    this.flash = Math.max(0, this.flash - dt * 1.5);
    this.wound = Math.max(0, this.wound - dt * 0.6);
    for (const m of this.messages) m.t += dt;
    this.messages = this.messages.filter((m) => m.t < 5);

    const cockpit = g.view === 'cockpit';
    if (cockpit) {
      this.drawOil();
      this.drawSight();
      this.drawPanel(p);
    } else {
      this.drawStatusStrip(p);
    }
    if (g.settings.indicator && (g.view === 'cockpit' || g.view === 'chase')) this.drawIndicator();
    if (g.view === 'padlock' && g.padTarget) this.drawPadlockInfo(g.padTarget);
    this.drawMessages();
    this.drawObjectives();
    if (this.showMap) this.drawMap();

    // damage overlays
    const hurt = p.pilotHealth < 100 ? (100 - p.pilotHealth) / 100 : 0;
    if (this.flash > 0 || this.wound > 0 || hurt > 0.3) {
      const a = Math.max(this.flash, this.wound * 0.45, (hurt - 0.3) * 0.4);
      const grad = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.2, this.w / 2, this.h / 2, this.h * 0.8);
      grad.addColorStop(0, 'rgba(150,0,0,0)');
      grad.addColorStop(1, `rgba(150,0,0,${a})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (g.timeScale > 1) this.label(`TIME x${g.timeScale}`, this.w - 16, 24, 'right', '#e8c872');
  }

  label(text, x, y, align = 'left', color = '#f2ede1', size = 14) {
    const ctx = this.ctx;
    ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  drawMessages() {
    const ctx = this.ctx;
    let y = 44;
    for (const m of this.messages) {
      const a = m.t < 4 ? 1 : 1 - (m.t - 4);
      ctx.globalAlpha = a;
      const col = m.kind === 'bad' ? '#ff8a7a' : m.kind === 'warn' ? '#f2c66d' : m.kind === 'ok' ? '#9fe0a0' : m.kind === 'kill' ? '#ffe9a6' : '#f2ede1';
      this.label(m.text, this.w / 2, y, 'center', col, 17);
      y += 24;
    }
    ctx.globalAlpha = 1;
  }

  drawObjectives() {
    const g = this.game;
    if (!g.mission) return;
    const lines = g.mission.statusLines();
    let y = 24;
    for (const l of lines) { this.label(l, 16, y, 'left', '#f2ede1', 13); y += 18; }
  }

  drawSight() {
    const ctx = this.ctx;
    const cx = this.w / 2, cy = (this.h - this.panelH) / 2 + this.panelH * 0.18;
    this.sightY = cy;
    ctx.strokeStyle = 'rgba(30,30,28,0.85)';
    ctx.lineWidth = 2;
    // Aldis-style ring sight
    ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 56, cy); ctx.lineTo(cx - 20, cy);
    ctx.moveTo(cx + 20, cy); ctx.lineTo(cx + 56, cy);
    ctx.moveTo(cx, cy - 56); ctx.lineTo(cx, cy - 20);
    ctx.moveTo(cx, cy + 20); ctx.lineTo(cx, cy + 56);
    ctx.stroke();
    ctx.fillStyle = 'rgba(30,30,28,0.9)';
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
  }

  drawOil() {
    if (this.oil <= 0) return;
    const ctx = this.ctx;
    const ah = this.h - this.panelH;
    for (const b of this.oilBlobs) {
      ctx.fillStyle = `rgba(40,30,10,${0.5 * this.oil})`;
      ctx.beginPath(); ctx.arc(b.x * this.w, b.y * ah, b.r * this.oil * 1.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  buildPanel() {
    const c = document.createElement('canvas');
    const W = this.w, H = this.panelH;
    c.width = W * this.dpr; c.height = (H + 30) * this.dpr;
    const x = c.getContext('2d');
    x.scale(this.dpr, this.dpr);
    // shaped coaming: curved top edge
    x.beginPath();
    x.moveTo(0, 30 + H);
    x.lineTo(0, 30 + 18);
    x.quadraticCurveTo(W / 2, -10, W, 30 + 18);
    x.lineTo(W, 30 + H);
    x.closePath();
    const grad = x.createLinearGradient(0, 0, 0, H + 30);
    grad.addColorStop(0, '#6e4a2a');
    grad.addColorStop(0.4, '#5a3b20');
    grad.addColorStop(1, '#3d2814');
    x.fillStyle = grad;
    x.fill();
    x.save();
    x.clip();
    // wood grain
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = `rgba(${30 + Math.random() * 30},${18 + Math.random() * 15},8,${0.12 + Math.random() * 0.15})`;
      x.lineWidth = 1 + Math.random() * 2;
      x.beginPath();
      const y0 = Math.random() * (H + 30);
      x.moveTo(0, y0);
      for (let k = 0; k <= 8; k++) x.lineTo((W / 8) * k, y0 + Math.sin(k + i) * 3 + (Math.random() - 0.5) * 3);
      x.stroke();
    }
    x.restore();
    // leather rim
    x.strokeStyle = '#2a1a0c';
    x.lineWidth = 6;
    x.beginPath();
    x.moveTo(0, 30 + 18);
    x.quadraticCurveTo(W / 2, -10, W, 30 + 18);
    x.stroke();
    this.panelCache = c;
  }

  gauge(cx, cy, r, title) {
    const ctx = this.ctx;
    const bez = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r * 1.1);
    bez.addColorStop(0, '#e2c27a'); bez.addColorStop(1, '#7a5b26');
    ctx.fillStyle = bez;
    ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#16140f';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9cfb4';
    ctx.font = `600 ${Math.max(8, r * 0.17)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(title, cx, cy + r * 0.45);
  }

  dial(cx, cy, r, value, min, max, a0, a1, majors, labelFn) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#e9e2cf';
    ctx.fillStyle = '#e9e2cf';
    ctx.font = `500 ${Math.max(8, r * 0.16)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= majors; i++) {
      const t = i / majors, a = a0 + (a1 - a0) * t;
      const ca = Math.cos(a), sa = Math.sin(a);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + ca * r * 0.82, cy + sa * r * 0.82); ctx.lineTo(cx + ca * r * 0.96, cy + sa * r * 0.96); ctx.stroke();
      if (labelFn) ctx.fillText(labelFn(min + (max - min) * t, i), cx + ca * r * 0.64, cy + sa * r * 0.64);
    }
    ctx.textBaseline = 'alphabetic';
    const t = clamp((value - min) / (max - min), 0, 1);
    const a = a0 + (a1 - a0) * t;
    this.needle(cx, cy, r * 0.85, a, '#f5f0e2');
  }

  needle(cx, cy, len, a, col) {
    const ctx = this.ctx;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * len * 0.15, cy - Math.sin(a) * len * 0.15); ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke();
    ctx.fillStyle = '#8a6a30';
    ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  drawPanel(p) {
    if (!this.panelCache) this.buildPanel();
    const ctx = this.ctx, g = this.game, fm = p.fm;
    const top = this.h - this.panelH - 30;
    ctx.drawImage(this.panelCache, 0, top, this.w, this.panelH + 30);
    const r = Math.min(this.panelH * 0.3, this.w * 0.055);
    const cy = this.h - this.panelH * 0.48;
    const cx = this.w / 2;
    const gap = r * 2.55;
    const imperial = g.units.speed === 'mph';

    // airspeed
    const spd = imperial ? fm.airspeed * 2.237 : fm.airspeed * 3.6;
    const smax = imperial ? 160 : 260;
    let x = cx - gap * 1.5;
    this.gauge(x, cy, r, imperial ? 'MPH' : 'KM/H');
    this.dial(x, cy, r, spd, 0, smax, Math.PI * 0.75, Math.PI * 2.25, 8, (v) => Math.round(v));

    // altimeter (one turn = 1000 ft or 1000 m; small hand = 10 000)
    const altRaw = fm.pos.y;
    const alt = imperial ? altRaw * 3.281 : altRaw;
    x = cx - gap * 0.5;
    this.gauge(x, cy, r, imperial ? 'ALT FT' : 'ALT M');
    this.dial(x, cy, r, alt % 1000, 0, 1000, -Math.PI / 2, Math.PI * 1.5, 10, (v, i) => (i < 10 ? i : ''));
    this.needle(x, cy, r * 0.5, -Math.PI / 2 + (alt / 10000) * Math.PI * 2, '#d9a441');

    // tachometer
    x = cx + gap * 0.5;
    const rpmMax = Math.ceil((p.spec.rpm || 1250) / 100) * 100 + 200;
    this.gauge(x, cy, r, 'RPM x100');
    this.dial(x, cy, r, fm.rpm, 0, rpmMax, Math.PI * 0.75, Math.PI * 2.25, 7, (v) => Math.round(v / 100));

    // compass: rotating card
    x = cx + gap * 1.5;
    this.gauge(x, cy, r, '');
    const hdg = fm.heading();
    ctx.save();
    ctx.translate(x, cy);
    ctx.fillStyle = '#e9e2cf';
    ctx.font = `700 ${Math.max(9, r * 0.22)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const marks = ['N', '3', '6', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'];
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 - hdg) * DEG - Math.PI / 2;
      ctx.fillStyle = marks[i] === 'N' ? '#e05a3a' : '#e9e2cf';
      ctx.fillText(marks[i], Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.98); ctx.lineTo(0, -r * 0.5); ctx.stroke();
    ctx.fillStyle = '#d9cfb4';
    ctx.font = `600 ${Math.max(9, r * 0.2)}px Inter, sans-serif`;
    ctx.fillText(String(Math.round(hdg)).padStart(3, '0'), 0, r * 0.12);
    ctx.restore();

    // small instruments to the far left: fuel + slip ball
    const sr = r * 0.62;
    x = cx - gap * 2.45;
    this.gauge(x, cy - sr * 0.6, sr, 'FUEL');
    this.dial(x, cy - sr * 0.6, sr, fm.fuel, 0, 1, Math.PI * 1.15, Math.PI * 1.85, 2, (v, i) => ['E', '½', 'F'][i]);
    // inclinometer
    const by = cy + sr * 1.2;
    ctx.fillStyle = '#16140f';
    ctx.beginPath(); ctx.roundRect(x - sr * 1.1, by - 9, sr * 2.2, 18, 9); ctx.fill();
    ctx.fillStyle = '#e9e2cf';
    const slip = clamp(-fm.beta * 3 + fm.bankAngle() * 0.0, -1, 1);
    ctx.beginPath(); ctx.arc(x + slip * sr * 0.9, by, 6, 0, Math.PI * 2); ctx.fill();

    // right side: throttle quadrant + lamps
    x = cx + gap * 2.45;
    const qh = r * 1.8;
    ctx.fillStyle = '#16140f';
    ctx.fillRect(x - 8, cy - qh / 2, 16, qh);
    const ty = cy + qh / 2 - fm.throttle * qh;
    ctx.fillStyle = '#c8a24a';
    ctx.fillRect(x - 16, ty - 5, 32, 10);
    ctx.fillStyle = '#e9e2cf';
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`THR ${Math.round(fm.throttle * 100)}%`, x, cy + qh / 2 + 16);

    // lamps
    const lamp = (lx, ly, on, col, txt) => {
      ctx.fillStyle = on ? col : '#2a241b';
      ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a6a30'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#d9cfb4'; ctx.font = '600 10px Inter, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(txt, lx + 12, ly + 4);
    };
    const lx = x + 34;
    lamp(lx, cy - r * 0.8, p.jammed, '#ff5a3a', 'JAM');
    lamp(lx, cy - r * 0.25, fm.engineHealth < 0.75, '#ffb03a', 'ENG');
    lamp(lx, cy + r * 0.3, fm.fuelLeak > 0, '#ffb03a', 'FUEL');
    lamp(lx, cy + r * 0.85, fm.stalled, '#ff5a3a', 'STALL');

    // ammo counters
    ctx.textAlign = 'center';
    const ax = cx - gap * 2.45 - r * 1.25;
    ctx.fillStyle = '#16140f';
    ctx.beginPath(); ctx.roundRect(ax - 34, cy - r * 0.9 - 14, 68, 52, 6); ctx.fill();
    ctx.fillStyle = '#d9cfb4'; ctx.font = '600 10px Inter, sans-serif';
    ctx.fillText('ROUNDS', ax, cy - r * 0.9);
    ctx.fillStyle = p.ammo < 100 ? '#ff8a6a' : '#f2ede1';
    ctx.font = '700 18px "JetBrains Mono", Consolas, monospace';
    ctx.fillText(g.settings.unlimitedAmmo ? '∞' : String(Math.max(0, p.ammo)), ax, cy - r * 0.9 + 24);
    if (p.bombs > 0 || p.spec.bombs > 0) {
      ctx.fillStyle = '#d9cfb4'; ctx.font = '600 10px Inter, sans-serif';
      ctx.fillText(`BOMBS ${p.bombs}`, ax, cy + r * 0.6);
    }
    // gun heat bar
    ctx.fillStyle = '#16140f';
    ctx.fillRect(ax - 30, cy + r * 0.8, 60, 6);
    ctx.fillStyle = p.heat > 0.7 ? '#ff5a3a' : '#c8a24a';
    ctx.fillRect(ax - 30, cy + r * 0.8, 60 * p.heat, 6);
  }

  drawStatusStrip(p) {
    const g = this.game, fm = p.fm;
    const imperial = g.units.speed === 'mph';
    const spd = Math.round(imperial ? fm.airspeed * 2.237 : fm.airspeed * 3.6);
    const alt = Math.round(imperial ? fm.pos.y * 3.281 : fm.pos.y);
    const ctx = this.ctx;
    const w = 520, h = 34, x = (this.w - w) / 2, y = this.h - h - 14;
    ctx.fillStyle = 'rgba(15,22,32,0.72)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
    const items = [
      `${spd} ${imperial ? 'mph' : 'km/h'}`,
      `${alt} ${imperial ? 'ft' : 'm'}`,
      `HDG ${String(Math.round(fm.heading())).padStart(3, '0')}`,
      `THR ${Math.round(fm.throttle * 100)}%`,
      `AMMO ${g.settings.unlimitedAmmo ? '∞' : p.ammo}${p.jammed ? ' JAM' : ''}`,
    ];
    items.forEach((t, i) => this.label(t, x + 16 + i * (w / items.length), y + 22, 'left', i === 4 && p.jammed ? '#ff8a6a' : '#f2ede1', 13));
    const viewName = { chase: 'CHASE VIEW', padlock: 'PADLOCK', target: 'TARGET VIEW', back: 'LOOKING BACK', external: 'EXTERNAL' }[g.view] || '';
    this.label(viewName, this.w - 16, this.h - 24, 'right', '#c8a24a', 12);
  }

  drawPadlockInfo(t) {
    const g = this.game;
    const d = Math.round(t.pos.distanceTo(g.player.pos));
    const nm = t.ace ? `${t.ace.name} (${t.spec.name})` : t.callsign || t.name || 'Target';
    this.label(`PADLOCK: ${nm} - ${d} m`, this.w / 2, this.h - 70, 'center', '#e8c872', 15);
  }

  // Edge arrow pointing to the nearest enemy when it is off-screen
  drawIndicator() {
    const g = this.game, cam = g.camera;
    const t = g.nearestEnemy(4000);
    if (!t) return;
    _p.copy(t.pos).project(cam);
    const behind = _p.z > 1;
    let sx = _p.x, sy = _p.y;
    if (behind) { sx = -sx; sy = -sy; }
    const onScreen = !behind && Math.abs(sx) < 0.95 && Math.abs(sy) < 0.95;
    const ctx = this.ctx;
    const cx = this.w / 2, cy = (g.view === 'cockpit' ? this.h - this.panelH : this.h) / 2;
    const isAce = !!t.ace;
    const col = t.team === 'G' ? (isAce ? '#ff6b4a' : '#f2c66d') : '#8ec5ff';
    if (onScreen) {
      const px = (sx * 0.5 + 0.5) * this.w, py = (-sy * 0.5 + 0.5) * this.h;
      const d = t.pos.distanceTo(g.player.pos);
      if (d > 300) {
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.strokeRect(px - 10, py - 10, 20, 20);
        this.label(`${Math.round(d)}m`, px, py + 24, 'center', col, 11);
      }
      return;
    }
    const ang = Math.atan2(-sy, sx);
    const rx = Math.min(this.w, (g.view === 'cockpit' ? this.h - this.panelH : this.h)) * 0.42;
    const px = cx + Math.cos(ang) * rx, py = cy + Math.sin(ang) * rx;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawMap() {
    const g = this.game, ctx = this.ctx;
    if (!g.mapCanvas) return;
    const size = Math.min(this.w, this.h) * 0.78;
    const x0 = (this.w - size) / 2, y0 = (this.h - size) / 2;
    ctx.fillStyle = 'rgba(10,16,24,0.85)';
    ctx.fillRect(x0 - 12, y0 - 34, size + 24, size + 46);
    ctx.drawImage(g.mapCanvas, x0, y0, size, size);
    this.label('MAP  (M to close)', x0, y0 - 12, 'left', '#c8a24a', 13);
    drawMapOverlay(ctx, g, x0, y0, size, true);
  }
}

// Shared by the in-flight map and the briefing map
export function drawMapOverlay(ctx, g, x0, y0, size, live) {
  const world = g.world;
  const mp = (x, z) => { const [mx, my] = worldToMap(x, z, size); return [x0 + mx, y0 + my]; };
  // front line
  ctx.strokeStyle = 'rgba(120,30,20,0.85)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  for (let z = -HALF; z <= HALF; z += 400) {
    const [px, py] = mp(world.frontX(z), z);
    if (z === -HALF) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // towns
  ctx.font = '600 11px Inter, sans-serif';
  ctx.textAlign = 'center';
  for (const t of world.towns) {
    const [px, py] = mp(t.x, t.z);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(px - 2.5, py - 2.5, 5, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(t.name, px, py - 7);
  }
  // airfields
  for (const a of world.airfields) {
    const [px, py] = mp(a.x, a.z);
    ctx.fillStyle = a.side === 'A' ? '#2b5ea8' : '#1d1d1d';
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = a.side === 'A' ? '#cfe2ff' : '#e6e6e6';
    ctx.fillText(a.name, px, py + 17);
  }
  // mission markers
  const m = g.mission;
  if (m) {
    for (const wp of m.waypoints) {
      const [px, py] = mp(wp.x, wp.z);
      ctx.strokeStyle = wp.done ? '#7fd17f' : '#f2c66d';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = wp.done ? '#7fd17f' : '#f2c66d';
      ctx.fillText(wp.label, px, py - 13);
    }
  }
  if (!live) return;
  // friendlies and spotted enemies
  for (const a of g.aircraft) {
    if (a.state !== 'flying' || a.isPlayer) continue;
    const near = a.pos.distanceTo(g.player.pos) < 3500;
    if (a.team === 'G' && !near) continue;
    const [px, py] = mp(a.pos.x, a.pos.z);
    ctx.fillStyle = a.team === 'A' ? '#8ec5ff' : '#ff6b4a';
    ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  // player arrow
  const p = g.player;
  const [px, py] = mp(p.pos.x, p.pos.z);
  const h = p.fm.heading() * DEG;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(h);
  ctx.fillStyle = '#ffe28a';
  ctx.strokeStyle = '#1d1d1d';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
