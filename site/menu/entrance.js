/* Shelter Star geometry ported directly from references/shelter_star_tui.py.
   The boot sequence is presentation only: no network or fake security checks. */
(() => {
  const faces = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  const phi = (1 + Math.sqrt(5)) / 2;
  const base = [[-1,phi,0],[1,phi,0],[-1,-phi,0],[1,-phi,0],[0,-1,phi],[0,1,phi],[0,-1,-phi],[0,1,-phi],[phi,0,-1],[phi,0,1],[-phi,0,-1],[-phi,0,1]];
  const normalize = (point, radius) => point.map(v => v / Math.hypot(...point) * radius);
  const vertices = base.map(point => normalize(point, .74));
  const edges = [];
  faces.forEach((face, i) => {
    vertices.push(normalize([0,1,2].map(axis => face.reduce((sum, index) => sum + base[index][axis], 0)), 1.48));
    face.forEach(index => edges.push([12 + i, index]));
  });
  const depthChars = ' .:-=+*#%@';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  class ShelterStar {
    constructor(canvas, miniature = false) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.miniature = miniature;
      this.time = 0;
      this.resize = this.resize.bind(this);
      this.observer = new ResizeObserver(this.resize);
      this.observer.observe(canvas);
      this.refreshPalette();
      this.resize();
    }
    refreshPalette() {
      const style = getComputedStyle(document.documentElement);
      this.palette = ['--dim','--star-blue','--star-magenta','--star-cyan','--white','--accent'].map(name => style.getPropertyValue(name).trim());
      this.draw(this.time);
    }
    resize() {
      const { width, height } = this.canvas.getBoundingClientRect();
      if (!width || !height || !this.ctx) return;
      this.width = width; this.height = height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cols = this.miniature ? 28 : Math.round(clamp(width / 5, 60, 120));
      this.cellW = width / this.cols;
      this.cellH = this.cellW * 1.9;
      this.rows = Math.floor(height / this.cellH);
      this.draw(this.time);
    }
    draw(time = 0) {
      this.time = time;
      if (!this.cols || !this.ctx) return;
      const { cols, rows } = this;
      const chars = Array.from({ length: rows }, () => Array(cols).fill(' '));
      const colors = Array.from({ length: rows }, () => new Uint8Array(cols));
      const depths = Array.from({ length: rows }, () => new Float32Array(cols).fill(-Infinity));
      const ax = .18 + time * .68, ay = .08 + time * .93, az = time * .47;
      const scale = Math.min(cols / 6.6, rows / 3.55) * .86;
      const projected = vertices.map(([x,y,z]) => {
        [y,z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
        [x,z] = [x * Math.cos(ay) + z * Math.sin(ay), -x * Math.sin(ay) + z * Math.cos(ay)];
        [x,y] = [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az)];
        const perspective = 3.2 / (3.2 - z);
        return [cols / 2 + x * perspective * scale * 1.9, rows / 2 + y * perspective * scale, z];
      });
      const put = (x, y, z, char, color) => {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || x >= cols || y < 0 || y >= rows || z < depths[y][x]) return;
        chars[y][x] = char; colors[y][x] = color; depths[y][x] = z;
      };
      if (!this.miniature) {
        for (let y = 1; y < rows - 1; y += 4) {
          for (let x = (y + Math.floor(time * 2)) % 7; x < cols; x += 7) put(x,y,-10,'.',0);
        }
      }
      edges.forEach(([a,b]) => {
        const [x0,y0,z0] = projected[a], [x1,y1,z1] = projected[b];
        const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
        for (let i = 0; i <= steps; i++) {
          const progress = steps ? i / steps : 0;
          const z = z0 + (z1 - z0) * progress;
          const depth = clamp(Math.floor((z + 1.7) / 3.4 * depthChars.length), 0, depthChars.length - 1);
          const color = this.miniature ? 5 : z > .2 ? 3 : z < -.35 ? 1 : 2;
          put(x0 + (x1 - x0) * progress, y0 + (y1 - y0) * progress, z, depthChars[depth], color);
        }
      });
      projected.forEach(([x,y,z], i) => put(x,y,z + .01,i >= 12 ? '@' : '.',this.miniature ? 5 : z > .15 ? 4 : 3));
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.font = `${this.cellW * 1.64}px "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace`;
      this.ctx.textBaseline = 'top';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (chars[y][x] === ' ') continue;
          this.ctx.fillStyle = this.palette[colors[y][x]];
          this.ctx.fillText(chars[y][x], x * this.cellW, y * this.cellH);
        }
      }
      this.frame = chars.map(row => row.join('')).join('\n');
    }
  }

  class KeeperEntrance {
    constructor() {
      this.root = document.documentElement;
      this.overlay = document.querySelector('#boot-scene');
      this.percentage = document.querySelector('#boot-percent');
      this.progress = document.querySelector('#boot-progress');
      this.status = document.querySelector('#boot-status');
      this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.star = new ShelterStar(document.querySelector('#boot-star'));
      this.signal = new ShelterStar(document.querySelector('#signal-star'), true);
      this.streams = [];
      this.elapsed = 0;
      this.starTime = 0;
      this.lastTick = 0;
      this.lastPaint = 0;
      this.duration = 3400;
      this.active = false;
      this.paused = this.motion.matches;
      this.tick = this.tick.bind(this);
      document.querySelectorAll('.nav-name').forEach((element, i) => {
        element.dataset.type = '';
        element.dataset.typeDelay = String(650 + i * 110);
        element.dataset.typeSpeed = '32';
        element.closest('.nav-item').style.setProperty('--row-delay', `${400 + i * 110}ms`);
      });
      const description = document.querySelector('#nav-description');
      description.dataset.type = ''; description.dataset.typeDelay = '1100';
      document.querySelector('#replay-intro').addEventListener('click', () => this.play());
      // Complete first, then allow the original click/keystroke to do its job.
      document.addEventListener('pointerdown', () => { if (this.active) this.finish(); }, true);
      document.addEventListener('keydown', event => {
        if (this.active && !['Shift','Control','Alt','Meta','CapsLock'].includes(event.key)) this.finish();
      }, true);
      this.motion.addEventListener('change', event => this.setPaused(event.matches));
      window.addEventListener('pageshow', event => { if (event.persisted) this.play(); });
      this.play();
      requestAnimationFrame(this.tick);
    }
    prepareText() {
      document.querySelectorAll('[data-type]').forEach(target => {
        const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
          acceptNode: node => node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        let offset = 0;
        const delay = Number(target.dataset.typeDelay || 250);
        const speed = Number(target.dataset.typeSpeed || 22);
        nodes.forEach(original => {
          const text = original.textContent;
          const wrapper = document.createElement('span');
          wrapper.className = 'type-stream';
          const source = document.createElement('span');
          source.className = 'sr-only'; source.textContent = text;
          const ink = document.createElement('span');
          ink.setAttribute('aria-hidden', 'true');
          const glyphs = Array.from(text, char => {
            const glyph = document.createElement('span');
            glyph.className = 'type-glyph'; glyph.textContent = char;
            ink.append(glyph); return glyph;
          });
          wrapper.append(source, ink);
          original.replaceWith(wrapper);
          this.streams.push({ original, wrapper, glyphs, start: delay + offset * speed, speed, shown: 0 });
          offset += glyphs.length;
        });
      });
    }
    play() {
      this.finish();
      if (this.motion.matches || this.paused) return;
      // Reset the CSS drawing effects even when replay interrupts a running boot.
      void this.overlay.offsetWidth;
      this.elapsed = 0;
      this.lastTick = 0;
      this.active = true;
      this.overlay.hidden = false;
      this.percentage.textContent = '000%';
      this.status.textContent = 'Opening menu.';
      this.progress.style.width = '0%';
      this.root.classList.add('entrance-running');
      this.prepareText();
      this.star.resize();
      this.star.draw(this.starTime);
    }
    finish() {
      this.active = false;
      this.streams.forEach(({ original, wrapper }) => {
        // A live status/hover update owns its new text; never restore stale copy.
        if (wrapper.isConnected) wrapper.replaceWith(original);
      });
      this.streams = [];
      this.overlay.hidden = true;
      this.root.classList.remove('entrance-running', 'entrance-resolving');
    }
    setPaused(paused) {
      this.paused = paused;
      if (paused) this.finish();
    }
    refreshPalette() { this.star.refreshPalette(); this.signal.refreshPalette(); }
    tick(now) {
      const delta = this.lastTick ? clamp(now - this.lastTick, 0, 80) : 0;
      this.lastTick = now;
      if (!document.hidden && !this.paused) {
        this.starTime += delta / 1000;
        if (this.active) {
          this.elapsed += delta;
          this.streams.forEach(stream => {
            const count = clamp(Math.floor((this.elapsed - stream.start) / stream.speed), 0, stream.glyphs.length);
            if (count === stream.shown) return;
            if (stream.shown) stream.glyphs[stream.shown - 1].classList.remove('typing-head');
            for (let i = stream.shown; i < count; i++) stream.glyphs[i].classList.add('typed');
            if (count && count < stream.glyphs.length) stream.glyphs[count - 1].classList.add('typing-head');
            stream.shown = count;
          });
          const progress = clamp(this.elapsed / 2650, 0, 1);
          this.percentage.textContent = `${String(Math.floor(progress * 100)).padStart(3, '0')}%`;
          this.progress.style.width = `${progress * 100}%`;
          if (this.elapsed > 2200) this.status.textContent = 'Menu ready.';
          if (this.elapsed >= 2650) this.root.classList.add('entrance-resolving');
          if (this.elapsed >= this.duration) this.finish();
        }
        if (now - this.lastPaint > 65) {
          if (this.active) this.star.draw(this.starTime);
          this.signal.draw(this.starTime * .35);
          this.lastPaint = now;
        }
      }
      requestAnimationFrame(this.tick);
    }
  }
  window.ShelterStar = ShelterStar;
  window.KeeperEntrance = KeeperEntrance;
  window.keeperEntrance = new KeeperEntrance();
})();
