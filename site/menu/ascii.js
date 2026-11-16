/* A tiny procedural ASCII engine, inspired by the projection and character shading
   in shelter_star_tui.py. Every visible mark is a text glyph; no video or images. */
(() => {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = (v) => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
  const CAR = [
    '      _______      ',
    "    .' _____ '.    ",
    '   /  /     \\  \\   ',
    '  /__/_______\\__\\  ',
    ' / .--.     .--. \\ ',
    '|__[==]_____[==]__|',
    '|     [ KPR ]     |',
    "'==o===========o=='",
    '   ##         ##   ',
  ];
  const OTHER_CAR = ['   ____   ', ' _/____\\_ ', '|_o____o_|', '  O    O  '];
  const TREE = ['   ^   ', '  /|\\  ', ' /:|:\\ ', '/::|::\\', '   |   '];
  // Paraphrases, not direct interview quotations. Source: DesignDocumentation_TEAM6.pdf,
  // overview p. 1, F1 p. 6, and F4 p. 7. Attribute by role for public-facing use.
  const PHASES = [
    { start: 0, number: '01', label: 'A quiet drive', quote: 'Footage can be overwritten before it’s needed.', caption: 'Defense counsel · design doc, p. 1' },
    { start: 7, number: '02', label: 'A near miss', quote: 'How footage is acquired matters.', caption: 'Media authentication · design doc, p. 1' },
    { start: 14, number: '03', label: 'Moment marked', quote: 'Missing camera angles leave gaps in the story.', caption: 'Defense counsel · design doc, p. 6' },
    { start: 22, number: '04', label: 'Ready to hand off', quote: 'Evidence needs to be easy to open and check.', caption: 'Forensic video · design doc, p. 7' },
  ];
  class KeeperRoad {
    constructor(canvas, { onPhase, onProgress, reducedMotion = false } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.onPhase = onPhase;
      this.onProgress = onProgress;
      this.paused = reducedMotion;
      this.time = reducedMotion ? 16 : 0;
      this.lastTick = 0;
      this.lastPaint = 0;
      this.currentPhase = -1;
      this.duration = 30;
      this.palette = [];
      this.resize = this.resize.bind(this);
      this.tick = this.tick.bind(this);
      this.observer = new ResizeObserver(this.resize);
      this.observer.observe(canvas);
      this.refreshPalette();
      this.resize();
      document.addEventListener('visibilitychange', () => { this.lastTick = 0; });
      requestAnimationFrame(this.tick);
    }
    refreshPalette() {
      const style = getComputedStyle(document.documentElement);
      this.palette = ['--dim', '--mid', '--road', '--accent', '--white', '--warning', '--scene'].map(name => style.getPropertyValue(name).trim());
      if (this.cols) this.draw();
    }
    resize() {
      const { width, height } = this.canvas.getBoundingClientRect();
      if (!width || !height) return;
      this.width = width;
      this.height = height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Shallow screens need more columns to retain enough rows for the whole car.
      this.cols = Math.round(clamp(Math.max(width / 6.6, width / height * 38), 54, 240));
      this.cellW = width / this.cols;
      this.cellH = this.cellW * 1.82;
      this.rows = Math.floor(height / this.cellH);
      this.fontSize = this.cellW * 1.62;
      this.draw();
    }
    setPaused(paused) {
      this.paused = paused;
      this.lastTick = 0;
      return this.paused;
    }
    tick(now) {
      if (!document.hidden && !this.paused) {
        if (this.lastTick) this.time += Math.min((now - this.lastTick) / 1000, .1);
        this.lastTick = now;
        if (now - this.lastPaint > 65) {
          this.draw();
          this.lastPaint = now;
        }
      } else { this.lastTick = 0; }
      requestAnimationFrame(this.tick);
    }
    put(x, y, char, color = 0) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
      this.grid[y][x] = char;
      this.colors[y][x] = color;
    }
    text(x, y, text, color = 0) {
      for (let i = 0; i < text.length; i++) this.put(x + i, y, text[i], color);
    }
    line(x0, y0, x1, y1, color = 0, character = '.') {
      const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
      for (let i = 0; i <= steps; i++) {
        const t = steps ? i / steps : 0;
        this.put(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, character, color);
      }
    }
    sprite(sprite, x, y, color, opaque = false) {
      for (let r = 0; r < sprite.length; r++) {
        for (let c = 0; c < sprite[r].length; c++) {
          if (sprite[r][c] !== ' ' || opaque) this.put(x + c, y + r, sprite[r][c], color);
        }
      }
    }
    box(x, y, title, subtitle, color = 3) {
      const width = Math.max(title.length, subtitle.length) + 4;
      this.text(x, y, '+' + '-'.repeat(width - 2) + '+', color);
      this.text(x, y + 1, '| ' + title.padEnd(width - 4) + ' |', color);
      this.text(x, y + 2, '| ' + subtitle.padEnd(width - 4) + ' |', 2);
      this.text(x, y + 3, '+' + '-'.repeat(width - 2) + '+', color);
    }
    centerAt(q, t) {
      return this.cols * .5 + Math.sin(t * .16 + (1 - q) * 2.3) * this.cols * .09 * q;
    }
    draw() {
      if (!this.cols || !this.ctx) return;
      const t = this.time % this.duration;
      const travel = this.time;
      const { cols, rows } = this;
      this.grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
      this.colors = Array.from({ length: rows }, () => new Uint8Array(cols));
      const horizon = Math.floor(rows * .39);
      const groundEnd = rows - 3;

      // A sparse sky and a faceted mountain range behind the vanishing point.
      for (let i = 0; i < 25; i++) {
        const x = (i * 37 + 13) % cols;
        const y = 5 + ((i * 13) % Math.max(1, horizon - 5));
        if ((i * 11) % 7 < 5) this.put(x, y, i % 6 ? '.' : '+', i % 4 ? 0 : 1);
      }
      const peaks = [[0,.98],[.08,.72],[.16,.87],[.29,.38],[.4,.72],[.47,.58],[.59,.87],[.72,.5],[.81,.74],[.88,.42],[1,.95]];
      for (let i = 1; i < peaks.length; i++) {
        const [ax, ay] = peaks[i - 1]; const [bx, by] = peaks[i];
        const ya = horizon - 1 - (1 - ay) * rows * .25;
        const yb = horizon - 1 - (1 - by) * rows * .25;
        this.line(ax * cols, ya, bx * cols, yb, 1, by < ay ? '/' : '\\');
        if (i % 2) this.line(ax * cols, ya, (bx * cols + ax * cols) * .52, horizon - 1, 0, '.');
      }
      this.line(1, horizon, cols - 2, horizon, 0, '.');

      // Inverse-perspective lane marks scroll toward the camera.
      for (let y = horizon + 1; y < groundEnd; y++) {
        const q = (y - horizon) / (groundEnd - horizon);
        const center = this.centerAt(q, travel);
        const half = 1.6 + Math.pow(q, 1.18) * cols * .49;
        const left = center - half;
        const right = center + half;
        for (let x = 1; x < cols - 1; x++) {
          const noise = (x * 11 + y * 23 + Math.floor(travel * 4)) % 31;
          if ((x < left - 3 || x > right + 3) && noise < 6) this.put(x, y, noise < 2 ? ':' : '.', 0);
          if (x > left + 1 && x < right - 1 && noise === 3 && y % 3 === 0) this.put(x, y, '.', 0);
        }
        this.put(left, y, '/', 2);
        this.put(right, y, '\\', 2);
        if (q > .25) { this.put(left - 2, y, '/', 0); this.put(right + 2, y, '\\', 0); }
        const depth = 1 / Math.max(q, .045);
        if (((depth * 4 + travel * 4) % 6) < 3) {
          this.put(center - half / 3, y, q > .75 ? '/' : ':', 1);
          this.put(center + half / 3, y, q > .75 ? '\\' : ':', 1);
        }
      }

      // Roadside pines move from the horizon toward the edge of the frame.
      for (let i = 0; i < 4; i++) {
        const q = ((i * .27 + travel * .032) % .82) + .12;
        const y = horizon + q * (groundEnd - horizon);
        const half = 1.6 + Math.pow(q, 1.18) * cols * .49;
        const sign = i % 2 ? -1 : 1;
        const x = this.centerAt(q, travel) + sign * (half + 4);
        if (q < .4) this.sprite(['^','|'], x, y - 1, 1);
        else this.sprite(TREE, x - 3, y - 4, q > .7 ? 1 : 0);
      }

      const carY = Math.max(horizon + 1, rows - 12);
      const qCar = (carY + 7 - horizon) / (groundEnd - horizon);
      const evasive = smooth((t - 8) / 2.4) - smooth((t - 13.5) / 3.5);
      const carX = this.centerAt(qCar, travel) - 9 - evasive * cols * .22;

      // Another vehicle cuts across the road; the driver steers around it.
      if (t > 5.5 && t < 12.5) {
        const approach = smooth((t - 5.5) / 5);
        const otherX = cols * .34 + approach * cols * .29;
        const otherY = horizon + 1 + approach * Math.max(1, carY - horizon - 4);
        this.sprite(OTHER_CAR, otherX, otherY, t > 7.5 ? 5 : 2, true);
        if (t > 7.5 && t < 10.5) {
          this.text(otherX - 2, otherY - 1, '[', 5);
          this.text(otherX + 11, otherY - 1, ']', 5);
        }
      }

      // A little rear-view car: filled cells conceal road markings behind it.
      this.sprite(CAR, carX, carY, 3, true);
      this.text(carX + 3, carY + 5, '[==]', t > 7.5 && t < 10.5 ? 5 : 4);
      this.text(carX + 12, carY + 5, '[==]', t > 7.5 && t < 10.5 ? 5 : 4);
      this.text(carX + 6, carY + 6, '[ KPR ]', 2);
      this.text(carX + 3, carY + 8, Math.floor(t * 8) % 2 ? '##' : '%%', 2);
      this.text(carX + 14, carY + 8, Math.floor(t * 8) % 2 ? '%%' : '##', 2);

      // The capture guide follows the car after the incident. This is story art,
      // not a claim of real collision avoidance, detection, signing, or proof.
      if (t > 11) {
        const x = carX - 2, y = carY - 1;
        this.text(x, y, '[', 1); this.text(x + 22, y, ']', 1);
        this.text(x, y + 10, '[', 1); this.text(x + 22, y + 10, ']', 1);
        if (t > 14) this.text(carX - 1, carY - 2, cols >= 64 && rows >= 30 ? 'o-- CLIP / RETAINED' : '[*]', 3);
      }

      // Restore the field annotations when the scene has room; readable discovery
      // insights remain in the DOM below the art, including on compact screens.
      if (cols >= 64 && rows >= 30) {
        const boxX = Math.round(cols * .49);
        const boxY = Math.max(6, horizon - 7);
        if (t > 7 && t < 12.5) {
          this.box(boxX, boxY, '! A NEAR MISS', 'keep those seconds?', 5);
        } else if (t > 14.5 && t < 21.5) {
          this.box(boxX, boxY, '+ MOMENT MARKED', 'one clip. one record.');
        } else if (t > 22.5 && t < 29) {
          this.box(boxX, boxY, '* READY TO HAND OFF', 'let the story travel.');
        } else {
          this.text(Math.round(cols * .64), Math.max(7, horizon - 5), '.  KEEP GOING  .', 1);
        }
      }

      // Rasterize contiguous character runs in each color, on a HiDPI canvas.
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.font = `${this.fontSize}px "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace`;
      ctx.textBaseline = 'top';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols;) {
          if (this.grid[y][x] === ' ') { x++; continue; }
          const color = this.colors[y][x];
          let end = x + 1;
          while (end < cols && this.colors[y][end] === color && this.grid[y][end] !== ' ') end++;
          ctx.fillStyle = this.palette[color];
          // Draw at cell positions to avoid platform-specific font advance drift.
          for (let c = x; c < end; c++) ctx.fillText(this.grid[y][c], c * this.cellW, y * this.cellH);
          x = end;
        }
      }
      const phaseIndex = PHASES.findLastIndex(phase => t >= phase.start);
      if (phaseIndex !== this.currentPhase) {
        this.currentPhase = phaseIndex;
        this.onPhase?.(PHASES[phaseIndex]);
      }
      this.onProgress?.(t / this.duration, Math.floor(this.time * 15));
    }
    // Useful when adapting the generated art for a true terminal.
    toText() { return this.grid.map(row => row.join('')).join('\n'); }
  }
  window.KeeperRoad = KeeperRoad;
})();
