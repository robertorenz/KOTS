// DOM user interface: menus, career office, briefing, debriefing and modal dialogs.
import { AIRCRAFT, ACES, NATIONS, aceVictoriesAt, skillLabel, germanFighterTypes } from './data.js';
import {
  loadPilots, savePilot, deletePilot, newPilot, pilotRank, pilotService, homeField, frontShift, aceStatus,
  activeAces, availableAircraft, pickMissionType, applyResult, realismFactor,
} from './campaign.js';
import { generateMission, MISSION_TYPES } from './mission.js';
import { drawMapOverlay } from './hud.js';
import { AIRFIELDS, worldToMap } from './world.js';
import { fmtDate, yearFrac, escapeHtml as esc } from './util.js';

const PLANE_SVG = `<svg viewBox="0 0 120 40" class="plane-ico" aria-hidden="true"><g fill="currentColor"><rect x="10" y="6" width="100" height="4" rx="2"/><rect x="18" y="26" width="84" height="4" rx="2"/><rect x="56" y="10" width="8" height="16"/><rect x="30" y="10" width="2.5" height="16"/><rect x="88" y="10" width="2.5" height="16"/><path d="M60 14 L64 34 L56 34 Z"/></g></svg>`;

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.modalRoot = document.getElementById('modal-root');
    this.modalOpen = false;
    this.pilot = null;
  }

  show(html, cls = '') {
    this.root.innerHTML = `<div class="screen ${cls}">${html}</div>`;
    this.root.classList.add('active');
    this.root.scrollTop = 0;
  }
  hide() { this.root.classList.remove('active'); this.root.innerHTML = ''; }
  on(sel, ev, fn) { this.root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn)); }

  // ---------------- modal ----------------
  modal({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], wide = false, dismissable = true }) {
    return new Promise((resolve) => {
      this.modalOpen = true;
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mtitle">
        <h2 id="mtitle">${title}</h2>
        <div class="modal-body">${body}</div>
        <div class="modal-actions">${buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}" data-i="${i}">${b.label}</button>`).join('')}</div>
      </div>`;
      const close = (v) => {
        wrap.remove();
        document.removeEventListener('keydown', key, true);
        this.modalOpen = this.modalRoot.children.length > 0;
        resolve(v);
      };
      const key = (e) => {
        if (e.code === 'Escape' && dismissable) { e.stopPropagation(); e.preventDefault(); close(buttons.find((b) => b.cancel)?.value ?? buttons[0].value); }
        if (e.code === 'Enter') { e.preventDefault(); const p = buttons.find((b) => b.primary) || buttons[0]; close(p.value); }
      };
      document.addEventListener('keydown', key, true);
      wrap.querySelectorAll('button[data-i]').forEach((btn) => btn.addEventListener('click', () => close(buttons[+btn.dataset.i].value)));
      this.modalRoot.appendChild(wrap);
      wrap.querySelector('.btn.primary, .btn')?.focus();
    });
  }

  // ---------------- title ----------------
  showTitle() {
    const pilots = loadPilots().filter((p) => p.status === 'active');
    this.show(`
      <div class="title-wrap">
        <div class="title-card">
          <div class="eyebrow">The Western Front · 1917 – 1918</div>
          <h1 class="logo">Knights <span>of the</span> Sky</h1>
          ${PLANE_SVG}
          <p class="tagline">Fly against the Red Baron and the great aces of the Imperial German Air Service.</p>
          <nav class="menu">
            ${pilots.length ? `<button class="btn primary big" data-act="continue">Continue career <small>${esc(pilots[0].name)}</small></button>` : ''}
            <button class="btn ${pilots.length ? '' : 'primary'} big" data-act="career">Career</button>
            <button class="btn big" data-act="quick">Quick dogfight</button>
            <button class="btn big" data-act="training">Training flight</button>
            <div class="menu-row">
              <button class="btn" data-act="hof">Hall of fame</button>
              <button class="btn" data-act="options">Options</button>
              <button class="btn" data-act="controls">Controls</button>
              <button class="btn" data-act="about">About</button>
            </div>
          </nav>
        </div>
        <footer class="fineprint">A fan remake inspired by MicroProse's <i>Knights of the Sky</i> (1990). Not affiliated with MicroProse.</footer>
      </div>`, 'title');
    this.on('[data-act]', 'click', (e) => {
      this.game.audio.init();
      const a = e.currentTarget.dataset.act;
      if (a === 'continue') { this.pilot = pilots[0]; this.showOffice(); }
      if (a === 'career') this.showCareer();
      if (a === 'quick') this.showQuick('dogfight');
      if (a === 'training') this.showQuick('training');
      if (a === 'hof') this.showHallOfFame();
      if (a === 'options') this.showOptions();
      if (a === 'controls') this.showControlsModal();
      if (a === 'about') this.showAbout();
    });
  }

  // ---------------- career roster ----------------
  showCareer() {
    const pilots = loadPilots().filter((p) => p.status === 'active');
    this.show(`
      <div class="panel">
        <header class="panel-head"><h2>Pilot roster</h2><button class="btn ghost" data-act="back">← Main menu</button></header>
        <div class="grid two">
          <section>
            <h3>Active pilots</h3>
            ${pilots.length ? `<ul class="roster">${pilots.map((p) => `
              <li>
                <div><b>${esc(pilotRank(p))} ${esc(p.name)}</b><span class="muted">${esc(p.unit)} · ${NATIONS[p.nation].name}</span>
                <span class="muted">${fmtDate(p.date)} · ${p.victories} victories · ${p.missions} missions</span></div>
                <div class="row"><button class="btn primary sm" data-go="${p.id}">Report for duty</button><button class="btn danger sm" data-del="${p.id}">Retire</button></div>
              </li>`).join('')}</ul>` : '<p class="muted">No pilots on the roster yet. Enlist one to begin a career.</p>'}
          </section>
          <section>
            <h3>Enlist a new pilot</h3>
            <form class="form" id="newpilot">
              <label>Name<input name="name" maxlength="28" required placeholder="e.g. Albert Ball" autocomplete="off"></label>
              <fieldset class="nations">
                ${Object.entries(NATIONS).map(([k, n], i) => `
                  <label class="nation"><input type="radio" name="nation" value="${k}" ${i === 0 ? 'checked' : ''}>
                  <span><b>${n.name}</b><small>${n.service(yearFrac(n.start))} · from ${fmtDate(n.start)}</small></span></label>`).join('')}
              </fieldset>
              <button class="btn primary" type="submit">Enlist</button>
            </form>
          </section>
        </div>
      </div>`);
    this.on('[data-act=back]', 'click', () => this.showTitle());
    this.on('[data-go]', 'click', (e) => { this.pilot = pilots.find((p) => p.id === e.currentTarget.dataset.go); this.showOffice(); });
    this.on('[data-del]', 'click', async (e) => {
      const p = pilots.find((x) => x.id === e.currentTarget.dataset.del);
      const ok = await this.modal({ title: 'Retire pilot?', body: `<p>${esc(pilotRank(p))} ${esc(p.name)} will leave the front and join the Hall of Fame with ${p.victories} victories.</p>`, buttons: [{ label: 'Cancel', value: false, cancel: true }, { label: 'Retire', value: true, danger: true }] });
      if (!ok) return;
      p.status = 'retired';
      savePilot(p);
      this.showCareer();
    });
    this.root.querySelector('#newpilot').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = String(fd.get('name') || '').trim();
      if (!name) return;
      const p = newPilot(name, fd.get('nation'));
      savePilot(p);
      this.pilot = p;
      this.modal({
        title: 'Welcome to the front',
        body: `<p>${esc(pilotRank(p))} <b>${esc(p.name)}</b>, you have been posted to <b>${esc(p.unit)}</b> of the ${pilotService(p)} at ${homeField(p).name} aerodrome.</p>
               <p>The date is ${fmtDate(p.date)}. Life expectancy for a new scout pilot is measured in weeks. Fly carefully, shoot straight, and come home.</p>`,
        buttons: [{ label: 'Report to the squadron office', value: true, primary: true }],
      }).then(() => this.showOffice());
    });
  }

  // ---------------- squadron office ----------------
  showOffice() {
    const p = this.pilot;
    const g = this.game;
    g.ensureWorld(frontShift(p));
    if (g.mode === 'demo' && !g.aircraft.some((a) => a.state === 'flying')) g.demoSpawn();
    const N = NATIONS[p.nation];
    const types = availableAircraft(p);
    if (!types.includes(p.aircraft)) p.aircraft = types[types.length - 1];
    const medals = N.medals.filter((m) => p.medals.includes(m.id));
    const yf = yearFrac(p.date);
    this.show(`
      <div class="panel">
        <header class="panel-head">
          <div><div class="eyebrow">${esc(p.unit)} · ${pilotService(p)} · ${homeField(p).name}</div>
          <h2>${esc(pilotRank(p))} ${esc(p.name)}</h2></div>
          <div class="date-badge">${fmtDate(p.date)}</div>
        </header>
        <div class="stats">
          <div class="stat"><b>${p.victories}</b><span>confirmed victories</span></div>
          <div class="stat"><b>${p.balloons}</b><span>balloons</span></div>
          <div class="stat"><b>${p.missions}</b><span>missions flown</span></div>
          <div class="stat"><b>${p.score}</b><span>score</span></div>
        </div>
        ${medals.length ? `<div class="ribbons">${medals.map((m) => `<span class="ribbon" title="${esc(m.name)}">${m.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span>`).join('')}<span class="muted">${medals.map((m) => esc(m.name)).join(' · ')}</span></div>` : ''}
        <div class="grid two">
          <section>
            <h3>Your aircraft</h3>
            <div class="planes">${types.map((t) => planeCard(t, t === p.aircraft)).join('')}</div>
            <div class="row gap">
              <button class="btn primary big" data-act="brief">Mission briefing →</button>
              <button class="btn" data-act="menu">Main menu</button>
            </div>
          </section>
          <section>
            <h3>German aces <span class="muted">(intelligence report)</span></h3>
            <table class="aces"><thead><tr><th>Pilot</th><th>Unit</th><th>Victories</th><th>Status</th></tr></thead><tbody>
              ${ACES.filter((a) => yf >= a.from - 0.05).map((a) => {
                const st = aceStatus(p, a);
                return `<tr class="${st.alive ? '' : 'dim'}"><td><b>${esc(a.name)}</b><small>${esc(a.nick)}</small></td><td>${esc(a.unit)}</td><td>${aceVictoriesAt(a, Math.min(yf, a.to))}</td><td>${st.state}</td></tr>`;
              }).join('')}
            </tbody></table>
            <h3>Service record</h3>
            <ul class="log">${p.log.length ? p.log.slice(0, 8).map((l) => `<li>${l}</li>`).join('') : '<li class="muted">No missions flown yet.</li>'}</ul>
          </section>
        </div>
      </div>`);
    this.on('[data-plane]', 'click', (e) => { p.aircraft = e.currentTarget.dataset.plane; savePilot(p); this.showOffice(); });
    this.on('[data-act=menu]', 'click', () => this.showTitle());
    this.on('[data-act=brief]', 'click', () => this.showBriefing());
  }

  // ---------------- briefing ----------------
  showBriefing() {
    const p = this.pilot, g = this.game;
    const home = homeField(p);
    const type = this._forcedType || pickMissionType(p);
    this._forcedType = null;
    const ctx = {
      kind: 'career', type, date: p.date, nation: p.nation, playerType: p.aircraft, home,
      aces: activeAces(p), wingmen: type === 'patrol' || type === 'ace' ? 1 : 0, onRunway: g.settings.startOnRunway,
      frontShift: frontShift(p), skill: 0.3 + (g.settings.difficulty - 1) * 0.1 + Math.min(0.15, (yearFrac(p.date) - 1917.25) * 0.1),
    };
    g.ensureWorld(ctx.frontShift);
    const m = generateMission(g, ctx);
    this.renderBriefing(m, ctx, () => this.showOffice());
  }

  renderBriefing(m, ctx, back) {
    const g = this.game;
    const spec = AIRCRAFT[ctx.playerType];
    this.show(`
      <div class="panel">
        <header class="panel-head">
          <div><div class="eyebrow">${MISSION_TYPES[m.type].icon} Mission briefing · ${m.dateText}</div><h2>${m.title}</h2></div>
          <button class="btn ghost" data-act="back">← Back</button>
        </header>
        <div class="grid brief">
          <section>
            ${m.briefing.map((t) => `<p class="lead">${t}</p>`).join('')}
            <dl class="facts">
              <dt>Aircraft</dt><dd>${spec.name}</dd>
              <dt>Base</dt><dd>${ctx.home.name}</dd>
              <dt>Start</dt><dd>${m.onGround ? 'On the aerodrome' : 'Airborne, west of the lines'}</dd>
              ${ctx.kind === 'career' ? `<dt>Realism</dt><dd>×${realismFactor(g.settings).toFixed(2)} score</dd>` : ''}
            </dl>
            <div class="row gap">
              <button class="btn primary big" data-act="fly">Take off</button>
              ${ctx.kind === 'career' ? '<button class="btn" data-act="reroll">Request another assignment</button>' : ''}
            </div>
            <p class="muted small">Press <kbd>H</kbd> in flight for controls, <kbd>M</kbd> for the map, <kbd>Esc</kbd> to pause or end the flight.</p>
          </section>
          <section><canvas id="briefmap" width="520" height="520" aria-label="Mission map"></canvas>
          <p class="muted small legend"><span class="sw red"></span>Front line <span class="sw gold"></span>Objectives <span class="sw blue"></span>Allied aerodromes <span class="sw dark"></span>German aerodromes</p></section>
        </div>
      </div>`);
    const cv = this.root.querySelector('#briefmap');
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.drawImage(g.mapCanvas, 0, 0, cv.width, cv.height);
    drawMapOverlay(c, { world: g.world, mission: m }, 0, 0, cv.width, false);
    // player start
    const [sx, sy] = worldToMap(m.start.x, m.start.z, cv.width);
    c.fillStyle = '#ffe28a'; c.strokeStyle = '#1d1d1d'; c.lineWidth = 2;
    c.beginPath(); c.arc(sx, sy, 6, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#ffffff'; c.font = '600 12px Inter, sans-serif'; c.textAlign = 'center';
    c.fillText('Start', sx, sy + 20);
    this.on('[data-act=back]', 'click', back);
    this.on('[data-act=reroll]', 'click', () => this.showBriefing());
    this.on('[data-act=fly]', 'click', () => {
      this.hide();
      g.startMission(m, ctx);
    });
  }

  // ---------------- quick dogfight / training ----------------
  showQuick(kind) {
    const g = this.game;
    const allied = Object.entries(AIRCRAFT).filter(([, t]) => t.side === 'A' && t.role === 'fighter');
    const german = Object.entries(AIRCRAFT).filter(([, t]) => t.side === 'G');
    const last = this._quick || { player: 'camel', nation: 'GB', enemy: 'dr1', ace: '', count: 1, skill: 0.5, wingmen: 0, alt: 1500, runway: true };
    const isDog = kind === 'dogfight';
    this.show(`
      <div class="panel narrow">
        <header class="panel-head"><h2>${isDog ? 'Quick dogfight' : 'Training flight'}</h2><button class="btn ghost" data-act="back">← Main menu</button></header>
        <form class="form" id="qf">
          <div class="grid two tight">
            <label>Your aircraft<select name="player">${allied.map(([k, t]) => `<option value="${k}" ${k === last.player ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
            <label>Markings<select name="nation">${Object.entries(NATIONS).map(([k, n]) => `<option value="${k}" ${k === last.nation ? 'selected' : ''}>${n.name}</option>`).join('')}</select></label>
            ${isDog ? `
            <label>Enemy aircraft<select name="enemy">${german.map(([k, t]) => `<option value="${k}" ${k === last.enemy ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
            <label>Led by an ace<select name="ace"><option value="">No ace</option>${ACES.map((a) => `<option value="${a.id}" ${a.id === last.ace ? 'selected' : ''}>${esc(a.name)} - ${esc(a.nick)}</option>`).join('')}</select></label>
            <label>Number of enemies<select name="count">${[1, 2, 3, 4].map((n) => `<option ${n === last.count ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <label>Enemy skill<select name="skill">${[[0.25, 'Novice'], [0.5, 'Regular'], [0.7, 'Veteran'], [0.88, 'Ace']].map(([v, l]) => `<option value="${v}" ${v === last.skill ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label>Wingmen<select name="wingmen">${[0, 1, 2].map((n) => `<option ${n === last.wingmen ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <label>Altitude<select name="alt">${[[600, '600 m (2,000 ft)'], [1500, '1,500 m (5,000 ft)'], [3000, '3,000 m (10,000 ft)']].map(([v, l]) => `<option value="${v}" ${v === last.alt ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            ` : `
            <label class="check"><input type="checkbox" name="runway" ${last.runway ? 'checked' : ''}> Start on the aerodrome (take-off practice)</label>`}
          </div>
          <div class="row gap"><button class="btn primary big" type="submit">${isDog ? 'Fight!' : 'Take off'}</button></div>
        </form>
      </div>`);
    this.on('[data-act=back]', 'click', () => this.showTitle());
    this.root.querySelector('#qf').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const q = {
        player: fd.get('player'), nation: fd.get('nation'), enemy: fd.get('enemy') || last.enemy, ace: fd.get('ace') || '',
        count: +(fd.get('count') || 1), skill: +(fd.get('skill') || 0.5), wingmen: +(fd.get('wingmen') || 0), alt: +(fd.get('alt') || 1500),
        runway: fd.get('runway') === 'on',
      };
      this._quick = q;
      const home = AIRFIELDS[0];
      g.ensureWorld(0);
      const ctx = {
        kind: isDog ? 'quick' : 'training', type: kind, date: '1918-03-01', nation: q.nation, playerType: q.player, home, frontShift: 0,
        wingmen: isDog ? q.wingmen : 0, onRunway: !isDog && q.runway,
        quick: { enemyType: q.enemy, ace: ACES.find((a) => a.id === q.ace) || null, count: q.count, skill: q.skill, alt: q.alt },
      };
      if (!isDog && !q.runway) { ctx.onRunway = false; }
      const m = generateMission(g, ctx);
      if (!isDog && !q.runway) { m.start.set(home.x + 600, 700, home.z); m.heading = 90; }
      this.hide();
      g.startMission(m, ctx);
    });
  }

  // ---------------- debriefing ----------------
  async showDebrief(res) {
    const g = this.game;
    const outcomeText = { landed: 'Landed at the aerodrome', returned: 'Returned to friendly lines', wounded: 'Wounded in a crash', captured: 'Taken prisoner', killed: 'Killed in action' }[res.outcome];
    const good = res.success;
    const kills = res.kills.map((k) => `<li>${k.aceName ? `<b>${esc(k.aceName)}</b> in a ` : ''}${k.name}${k.twoSeater ? ' (two-seater)' : ''} - <span class="${k.confirmed ? 'ok' : 'muted'}">${k.confirmed ? 'confirmed' : 'unconfirmed'}</span></li>`).join('');
    let career = '';
    let outcome = null;
    if (res.kind === 'career' && this.pilot) {
      outcome = applyResult(this.pilot, res, g.settings);
      savePilot(this.pilot);
      career = `<p class="muted">Score this mission: <b>${res.score}</b> · Career score ${this.pilot.score}</p>`;
    }
    this.show(`
      <div class="panel narrow">
        <header class="panel-head"><div><div class="eyebrow">Debriefing · ${res.title}</div><h2 class="${good ? 'ok' : 'bad'}">${res.kind === 'training' ? 'Flight complete' : good ? 'Mission successful' : 'Mission failed'}</h2></div></header>
        <p class="lead">${outcomeText}. ${!good && res.failReason && res.kind !== 'training' ? esc(res.failReason) : ''}</p>
        <div class="stats">
          <div class="stat"><b>${res.kills.length}</b><span>victories claimed</span></div>
          <div class="stat"><b>${res.balloons}</b><span>balloons</span></div>
          <div class="stat"><b>${res.targets}</b><span>ground targets</span></div>
          <div class="stat"><b>${Math.floor(res.time / 60)}:${String(Math.floor(res.time % 60)).padStart(2, '0')}</b><span>flight time</span></div>
        </div>
        ${kills ? `<h3>Combat report</h3><ul class="log">${kills}</ul>` : ''}
        ${career}
        <div class="row gap"><button class="btn primary big" data-act="next">Continue</button></div>
      </div>`);
    this.root.querySelector('[data-act=next]').addEventListener('click', async () => {
      if (res.kind !== 'career' || !this.pilot) { g.quitToMenu(); return; }
      const p = this.pilot;
      if (outcome.promotion) await this.modal({ title: 'Promotion', body: `<p>In recognition of your service you are promoted to <b>${outcome.promotion}</b>.</p>` });
      for (const md of outcome.medals) {
        await this.modal({ title: 'Decorated', body: `<div class="medal"><span class="ribbon big">${md.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span></div><p>You have been awarded the <b>${md.name}</b>.</p>` });
      }
      if (outcome.news.length) await this.modal({ title: 'News from the front', body: `<ul class="log">${outcome.news.map((n) => `<li>${n}</li>`).join('')}</ul>` });
      if (outcome.ended) {
        const text = {
          killed: `<p>${esc(pilotRank(p))} ${esc(p.name)} was killed in action on ${fmtDate(p.date)}, with ${p.victories} confirmed victories.</p><p>The squadron raises a glass in the mess tonight.</p>`,
          captured: `<p>${esc(pilotRank(p))} ${esc(p.name)} spends the rest of the war in a prisoner-of-war camp, with ${p.victories} confirmed victories.</p>`,
          armistice: `<p><b>11 November 1918.</b> The guns fall silent at the eleventh hour. ${esc(pilotRank(p))} ${esc(p.name)} survives the war with ${p.victories} confirmed victories and a score of ${p.score}.</p>`,
        }[outcome.ended];
        await this.modal({ title: outcome.ended === 'armistice' ? 'Armistice' : 'Career over', body: text });
        g.quitToMenu();
        this.showHallOfFame();
        return;
      }
      g.quitToMenu();
      this.showOffice();
    });
  }

  // ---------------- pause ----------------
  async showPauseMenu() {
    const g = this.game;
    const v = await this.modal({
      title: 'Paused',
      body: '<p>The war will wait.</p>',
      buttons: [
        { label: 'Resume', value: 'resume', primary: true, cancel: true },
        { label: 'Controls', value: 'controls' },
        { label: 'End flight', value: 'end' },
        { label: 'Abandon to menu', value: 'quit', danger: true },
      ],
    });
    if (v === 'resume') g.setPaused(false);
    else if (v === 'controls') { await this.showControlsModal(); this.showPauseMenu(); }
    else if (v === 'end') g.requestEndFlight();
    else if (v === 'quit') {
      const ok = g.mission?.kind === 'career'
        ? await this.modal({ title: 'Abandon mission?', body: '<p>Abandoning a career mission counts as a failed mission flown, with nothing scored.</p>', buttons: [{ label: 'Cancel', value: false, cancel: true }, { label: 'Abandon', value: true, danger: true }] })
        : true;
      if (!ok) return this.showPauseMenu();
      const wasCareer = g.mission?.kind === 'career';
      if (wasCareer && this.pilot) {
        g.mission.kills = []; g.mission.balloonsDown = 0; g.mission.targetsDestroyed = 0; g.mission.objectiveDone = false;
        const res = g.buildResult('returned');
        res.score = 0;
        applyResult(this.pilot, res, g.settings);
        savePilot(this.pilot);
      }
      g.quitToMenu();
      if (this.pilot && wasCareer) this.showOffice();
    }
  }

  showControlsModal() {
    return this.modal({
      title: 'Controls', wide: true,
      body: `<table class="keys">
        <tr><th>Flight</th><td></td></tr>
        <tr><td><kbd>W</kbd>/<kbd>S</kbd> or <kbd>↑</kbd>/<kbd>↓</kbd></td><td>Stick forward / back (nose down / up)</td></tr>
        <tr><td><kbd>A</kbd>/<kbd>D</kbd> or <kbd>←</kbd>/<kbd>→</kbd></td><td>Roll left / right</td></tr>
        <tr><td><kbd>Q</kbd>/<kbd>E</kbd></td><td>Rudder left / right (also ground steering)</td></tr>
        <tr><td>Hold <kbd>Shift</kbd></td><td>Gentle control inputs</td></tr>
        <tr><td><kbd>+</kbd>/<kbd>-</kbd>, <kbd>1</kbd>–<kbd>9</kbd>, <kbd>0</kbd></td><td>Throttle (0 = full, \` = idle)</td></tr>
        <tr><th>Combat</th><td></td></tr>
        <tr><td><kbd>Space</kbd> / <kbd>Ctrl</kbd></td><td>Fire guns</td></tr>
        <tr><td><kbd>J</kbd></td><td>Hammer the breech to clear a jam (tap)</td></tr>
        <tr><td><kbd>B</kbd></td><td>Drop bomb</td></tr>
        <tr><th>Views</th><td></td></tr>
        <tr><td><kbd>V</kbd></td><td>Cycle cockpit / chase / padlock / target view</td></tr>
        <tr><td><kbd>F</kbd> · <kbd>N</kbd></td><td>Padlock view on / off · next target</td></tr>
        <tr><td>Hold <kbd>R</kbd></td><td>Look behind</td></tr>
        <tr><th>Other</th><td></td></tr>
        <tr><td><kbd>M</kbd> · <kbd>T</kbd></td><td>Map · time compression (no enemies near)</td></tr>
        <tr><td><kbd>P</kbd> · <kbd>Esc</kbd></td><td>Pause · pause menu / end flight</td></tr>
        <tr><td>Gamepad</td><td>Left stick fly, right stick rudder, A / RT fire, X clear jam, Y view, D-pad throttle</td></tr>
      </table>
      <p class="muted small">To land: throttle back, glide in at about 1.3× stall speed, and touch down gently with the wings level. A sink rate under 4.5 m/s is safe.</p>`,
    });
  }

  // ---------------- options ----------------
  showOptions() {
    const g = this.game, s = g.settings;
    const chk = (k, label, hint) => `<label class="check"><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}><span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
    this.show(`
      <div class="panel narrow">
        <header class="panel-head"><h2>Options</h2><button class="btn ghost" data-act="back">← Main menu</button></header>
        <div class="grid two tight">
          <section><h3>Realism</h3>
            ${chk('unlimitedAmmo', 'Unlimited ammunition')}
            ${chk('noJams', 'No gun jams')}
            ${chk('invulnerable', 'Invulnerable', 'Enemy fire cannot hurt you')}
            ${chk('easyFlight', 'Easy flight', 'Prevents stalling under heavy pulls')}
            ${chk('easyLanding', 'Easy landings')}
            ${chk('indicator', 'Enemy indicator', 'An arrow points to the nearest enemy')}
            <label>Enemy difficulty<select data-k="difficulty">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${+s.difficulty === n ? 'selected' : ''}>${n} - ${['Raw recruits', 'Green', 'Seasoned', 'Hardened', 'Flying Circus'][n - 1]}</option>`).join('')}</select></label>
            <p class="muted">Career score multiplier: <b id="rf">×${realismFactor(s).toFixed(2)}</b></p>
          </section>
          <section><h3>General</h3>
            ${chk('startOnRunway', 'Career: start missions on the aerodrome', 'Otherwise you start airborne near the lines')}
            ${chk('invertPitch', 'Invert pitch keys', 'Up arrow pulls the nose up')}
            <label>Units<select data-k="units"><option value="auto" ${s.units === 'auto' ? 'selected' : ''}>By nationality</option><option value="imperial" ${s.units === 'imperial' ? 'selected' : ''}>Imperial (mph, ft)</option><option value="metric" ${s.units === 'metric' ? 'selected' : ''}>Metric (km/h, m)</option></select></label>
            <label>Cloud cover<input type="range" min="0" max="1" step="0.1" data-k="clouds" value="${s.clouds}"></label>
            <label>Volume<input type="range" min="0" max="1" step="0.05" data-k="volume" value="${s.volume}"></label>
          </section>
        </div>
      </div>`);
    this.on('[data-act=back]', 'click', () => this.showTitle());
    this.on('[data-k]', 'change', (e) => {
      const el = e.currentTarget, k = el.dataset.k;
      s[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : (k === 'difficulty' ? +el.value : el.value);
      g.applySettings();
      const rf = this.root.querySelector('#rf');
      if (rf) rf.textContent = `×${realismFactor(s).toFixed(2)}`;
    });
  }

  // ---------------- hall of fame ----------------
  showHallOfFame() {
    const all = loadPilots().sort((a, b) => b.score - a.score);
    const statusText = { active: 'On active service', killed: 'Killed in action', captured: 'Prisoner of war', retired: 'Retired', survived: 'Survived the war' };
    this.show(`
      <div class="panel narrow">
        <header class="panel-head"><h2>Hall of fame</h2><button class="btn ghost" data-act="back">← Main menu</button></header>
        ${all.length ? `<table class="aces"><thead><tr><th>Pilot</th><th>Victories</th><th>Balloons</th><th>Missions</th><th>Score</th><th>Fate</th><th></th></tr></thead><tbody>
          ${all.map((p) => `<tr><td><b>${esc(pilotRank(p))} ${esc(p.name)}</b><small>${esc(p.unit)} · ${NATIONS[p.nation].name}</small></td><td>${p.victories}</td><td>${p.balloons}</td><td>${p.missions}</td><td>${p.score}</td><td>${statusText[p.status]}<small>${fmtDate(p.date)}</small></td>
          <td>${p.status !== 'active' ? `<button class="btn ghost sm" data-del="${p.id}" aria-label="Remove">✕</button>` : ''}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">No pilots yet. The Hall of Fame awaits its first knight of the sky.</p>'}
      </div>`);
    this.on('[data-act=back]', 'click', () => this.showTitle());
    this.on('[data-del]', 'click', async (e) => {
      const ok = await this.modal({ title: 'Remove record?', body: '<p>This pilot will be permanently removed from the Hall of Fame.</p>', buttons: [{ label: 'Cancel', value: false, cancel: true }, { label: 'Remove', value: true, danger: true }] });
      if (ok) { deletePilot(e.currentTarget.dataset.del); this.showHallOfFame(); }
    });
  }

  // ---------------- about / credits ----------------
  showAbout() {
    this.show(`
      <div class="panel narrow prose">
        <header class="panel-head"><h2>About</h2><button class="btn ghost" data-act="back">← Main menu</button></header>
        <p class="lead">This is a fan-made browser remake inspired by <b>Knights of the Sky</b>, the World War I combat flight simulator by <b>MicroProse Software</b>.</p>
        <h3>The original</h3>
        <p>Jeff Briggs designed <i>Knights of the Sky</i>, and Steven Cain did the graphics. It was released for MS-DOS in 1990 and rewritten from the ground up for the Amiga by MicroProse UK in 1991. An Atari ST version followed in 1991–92, programmed by Kevin Buckner, Andrew Parton and Mark Langerak, with graphics by Allan Holloway and Steven Cain and music by Andrew Parton. The game was developed under the working title <i>Red Baron</i>. It offered flight training, dogfights against 16 German aces, a full campaign over Flanders, and head-to-head play by modem.</p>
        <p>Amiga Power rated it 87% (92% for the budget re-release), and <i>Computer Gaming World</i> called it "a must for WWI fans and flight simulation fans."</p>
        <h3>This remake</h3>
        <p>It contains no original code, graphics or sound. Everything here is procedurally generated or synthesised, and the aircraft and ace data comes from public WWI history. It is built with Three.js and Vite.</p>
        <p class="muted small"><i>Knights of the Sky</i> and MicroProse are trademarks of their respective owners. This project is not affiliated with or endorsed by them.</p>
      </div>`);
    this.on('[data-act=back]', 'click', () => this.showTitle());
  }
}

function planeCard(key, selected) {
  const t = AIRCRAFT[key];
  const bar = (v, max) => `<span class="bar"><i style="width:${Math.round(Math.min(1, v / max) * 100)}%"></i></span>`;
  return `<button class="plane ${selected ? 'sel' : ''}" data-plane="${key}">
    <b>${t.name}</b>
    <span class="spec"><em>Speed</em>${bar(t.vmax - 35, 28)}</span>
    <span class="spec"><em>Turn</em>${bar(t.pitch - 50, 40)}</span>
    <span class="spec"><em>Roll</em>${bar(t.roll - 60, 80)}</span>
    <span class="spec"><em>Guns</em>${t.guns === 2 ? 'Twin' : 'Single'}${t.bombs ? ` · ${t.bombs} bombs` : ''}</span>
    <small>${t.blurb || ''}</small>
  </button>`;
}

export { skillLabel, germanFighterTypes };
