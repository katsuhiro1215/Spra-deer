export class Controls {
  private keys = new Set<string>();
  private pointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private axis = { x: 0, y: 0 };
  private jumpQueued = false;
  private throwQueued = false;
  private active = false;
  private pad = document.querySelector<HTMLElement>('#move-pad')!;
  private stick = document.querySelector<HTMLElement>('#move-stick')!;
  private jumpButton = document.querySelector<HTMLButtonElement>('#jump')!;
  private throwButton = document.querySelector<HTMLButtonElement>('#throw')!;
  constructor(onPause: () => void, onRetry: () => void) {
    const targets = [this.pad, document.querySelector<HTMLElement>('#game')!];
    for (const target of targets) {
      target.addEventListener('pointerdown', e => {
        if (!this.active || this.pointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault(); this.pointer = e.pointerId; this.origin = { x: e.clientX, y: e.clientY };
        target.setPointerCapture(e.pointerId); this.pad.classList.add('held'); this.move(e);
      });
      target.addEventListener('pointermove', e => { if (e.pointerId === this.pointer) this.move(e); });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) target.addEventListener(name, e => {
        if ((e as PointerEvent).pointerId === this.pointer) { this.pointer = null; this.axis = { x: 0, y: 0 }; this.pad.classList.remove('held'); this.paint(); }
      });
      target.addEventListener('contextmenu', e => e.preventDefault());
    }
    this.jumpButton.addEventListener('pointerdown', e => { if (this.active) { e.preventDefault(); this.jumpQueued = true; } });
    // Native button activation via keyboard/assistive technology.
    this.jumpButton.addEventListener('click', e => { if (this.active && e.detail === 0) this.jumpQueued = true; });
    this.throwButton.addEventListener('pointerdown', e => { if (this.active) { e.preventDefault(); this.throwQueued = true; } });
    this.throwButton.addEventListener('click', e => { if (this.active && e.detail === 0) this.throwQueued = true; });
    const captured = ['KeyX', 'KeyF', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); onPause(); return; }
      if (e.code === 'KeyR' && !e.repeat && !(e.ctrlKey || e.metaKey || e.altKey)) { e.preventDefault(); onRetry(); return; }
      if (!this.active || !captured.includes(e.code)) return;
      e.preventDefault();
      if (e.code === 'Space') { if (!e.repeat) this.jumpQueued = true; } else if (e.code === 'KeyX' || e.code === 'KeyF') { if (!e.repeat) this.throwQueued = true; } else this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
  }
  private move(e: PointerEvent) {
    const radius = Math.max(24, this.pad.clientWidth * .32);
    let x = (e.clientX - this.origin.x) / radius, y = (e.clientY - this.origin.y) / radius;
    const length = Math.hypot(x, y);
    if (length < .13) x = y = 0;
    else if (length > 1) { x /= length; y /= length; }
    this.axis = { x, y }; this.paint();
  }
  private paint() { this.stick.style.transform = `translate(${this.axis.x * 65}%, ${this.axis.y * 65}%)`; }
  reset() { this.keys.clear(); this.axis = { x: 0, y: 0 }; this.pointer = null; this.jumpQueued = false; this.throwQueued = false; this.pad.classList.remove('held'); this.paint(); }
  enable(active: boolean) { this.active = active; this.jumpButton.disabled = !active; this.throwButton.disabled = !active; this.reset(); }
  sample() {
    const has = (...codes: string[]) => codes.some(c => this.keys.has(c));
    const keyX = Number(has('KeyD', 'ArrowRight')) - Number(has('KeyA', 'ArrowLeft'));
    const keyY = Number(has('KeyS', 'ArrowDown')) - Number(has('KeyW', 'ArrowUp'));
    const jump = this.jumpQueued, toss = this.throwQueued; this.jumpQueued = this.throwQueued = false;
    return { x: keyX || keyY ? keyX : this.axis.x, y: keyX || keyY ? keyY : this.axis.y, jump, throw: toss };
  }
}
