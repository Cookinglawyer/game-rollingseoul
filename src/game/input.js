// 키보드(WASD/방향키) + 터치 조이스틱
// forward: -1~1 (앞/뒤), turn: -1~1 (왼쪽/오른쪽 회전)
export class Input {
  constructor(touchLayer, stickEl, knobEl) {
    this.keys = new Set();
    this.forward = 0;
    this.turn = 0;
    this.touch = null;
    this.stickEl = stickEl;
    this.knobEl = knobEl;

    this._down = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.toLowerCase());
    };
    this._up = (e) => this.keys.delete(e.key.toLowerCase());
    this._blur = () => this.keys.clear();
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);

    const R = 60;
    touchLayer.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.touch = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
      touchLayer.setPointerCapture(e.pointerId);
      stickEl.style.left = `${e.clientX}px`;
      stickEl.style.top = `${e.clientY}px`;
      stickEl.hidden = false;
      knobEl.style.transform = 'translate(-50%, -50%)';
    });
    touchLayer.addEventListener('pointermove', (e) => {
      if (!this.touch || e.pointerId !== this.touch.id) return;
      let dx = e.clientX - this.touch.x0, dy = e.clientY - this.touch.y0;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      this.touch.dx = dx / R;
      this.touch.dy = dy / R;
      knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e) => {
      if (!this.touch || e.pointerId !== this.touch.id) return;
      this.touch = null;
      stickEl.hidden = true;
    };
    touchLayer.addEventListener('pointerup', end);
    touchLayer.addEventListener('pointercancel', end);
  }

  update() {
    const k = this.keys;
    let f = 0, t = 0;
    if (k.has('w') || k.has('arrowup')) f += 1;
    if (k.has('s') || k.has('arrowdown')) f -= 1;
    if (k.has('a') || k.has('arrowleft')) t += 1;
    if (k.has('d') || k.has('arrowright')) t -= 1;
    if (this.touch) {
      f = -this.touch.dy;
      t = -this.touch.dx;
    }
    this.forward = Math.max(-1, Math.min(1, f));
    this.turn = Math.max(-1, Math.min(1, t));
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
  }
}
