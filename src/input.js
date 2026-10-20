// Keyboard + gamepad input.
import { clamp } from './util.js';

const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F1', 'F2', 'F3', 'F4']);

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.enabled = false;
    this.invertPitch = false;
    this.axes = { pitch: 0, roll: 0, yaw: 0 };
    this.throttleDelta = 0;
    this.padThrottle = null;
    this.padFire = false;
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => this.down.clear());
  }

  isDown(...codes) { return codes.some((c) => this.down.has(c)); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); }
  reset() { this.down.clear(); this.pressed.clear(); this.axes = { pitch: 0, roll: 0, yaw: 0 }; }

  update(dt) {
    // keyboard: digital keys ramp to full deflection, then spring back
    const ramp = (cur, target, rate) => {
      if (target === 0) return Math.abs(cur) < rate * dt * 1.6 ? 0 : cur - Math.sign(cur) * rate * dt * 1.6;
      return clamp(cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), rate * dt), -1, 1);
    };
    // Joystick convention: Up/W pushes the nose down, Down/S pulls it up.
    let p = (this.isDown('ArrowDown', 'KeyS') ? 1 : 0) - (this.isDown('ArrowUp', 'KeyW') ? 1 : 0);
    if (this.invertPitch) p = -p;
    const r = (this.isDown('ArrowRight', 'KeyD') ? 1 : 0) - (this.isDown('ArrowLeft', 'KeyA') ? 1 : 0);
    const y = (this.isDown('KeyE') ? 1 : 0) - (this.isDown('KeyQ') ? 1 : 0);
    const half = this.isDown('ShiftLeft', 'ShiftRight') ? 0.45 : 1;
    this.axes.pitch = ramp(this.axes.pitch, p * half, 4);
    this.axes.roll = ramp(this.axes.roll, r * half, 5);
    this.axes.yaw = ramp(this.axes.yaw, y, 4);

    this.throttleDelta = (this.isDown('Equal', 'NumpadAdd', 'PageUp') ? 1 : 0) - (this.isDown('Minus', 'NumpadSubtract', 'PageDown') ? 1 : 0);

    // gamepad overrides when sticks are deflected
    this.padFire = false;
    this.padThrottle = null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0);
      if (lx) this.axes.roll = lx;
      if (ly) this.axes.pitch = this.invertPitch ? -ly : ly;
      if (rx) this.axes.yaw = rx;
      if (gp.buttons[0]?.pressed || gp.buttons[7]?.pressed) this.padFire = true;
      if (gp.buttons[6]) {
        const rt = gp.buttons[7]?.value ?? 0;
        void rt;
      }
      if (gp.buttons[12]?.pressed) this.throttleDelta = 1;
      if (gp.buttons[13]?.pressed) this.throttleDelta = -1;
      if (gp.buttons[2]?.pressed) this.pressed.add('KeyJ');
      if (gp.buttons[3]?.pressed && !this._padY) this.pressed.add('KeyV');
      this._padY = gp.buttons[3]?.pressed;
      break;
    }
  }

  get fire() { return this.isDown('Space', 'ControlLeft', 'ControlRight') || this.padFire; }
}
