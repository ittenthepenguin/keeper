(() => {
  const $ = (selector) => document.querySelector(selector);
  const config = window.KEEPER_CONFIG || {};
  const menu = [...document.querySelectorAll('.nav-item')];
  const dialog = $('#info-dialog');
  const descriptions = [
    'Meet Keeper. A first look at what we’re building.',
    'Walk through the driver-to-recipient experience.',
    'Return to your driver workspace.',
    'Pilot and business inquiries on the landing page.',
    'Three students. One easier evidence handoff.',
  ];
  let selected = 1;
  let returnFocus = null;
  const announce = (message) => { $('#announcement').textContent = message; };

  function select(index, focus = false) {
    selected = (index + menu.length) % menu.length;
    menu.forEach((item, i) => { item.dataset.selected = String(i === selected); });
    $('#selection-count').textContent = `[ ${String(selected + 1).padStart(2, '0')} / 05 ]`;
    $('#nav-description').textContent = descriptions[selected];
    if (focus) menu[selected].focus({ preventScroll: true });
  }

  const content = {
    landing: {
      path: 'landing',
      body: `<p class="eyebrow">01 / THE MAIN SITE</p><h2 id="dialog-title">A first hello.<br>A bigger story to come.</h2><p>Keeper is exploring <strong>an easier handoff for incident video</strong> — from a driver with a supported camera to the adjuster, investigator, or attorney who needs the footage.</p><p>This terminal is an entrance concept. The full landing page is being built separately.</p><a class="panel-button" href="#" data-open-demo>Explore the current prototype <span aria-hidden="true">↗</span></a>`,
    },
    login: {
      path: 'login',
      body: `<p class="eyebrow">03 / YOUR WORKSPACE</p><h2 id="dialog-title">Your next session<br>starts here.</h2><p>This is a preview of the entrance to Keeper. Account sign-in will connect here when the main site is ready.</p><p>You can explore the existing driver workspace with sample data now.</p><a class="panel-button" href="#" data-open-demo>Open the demo workspace <span aria-hidden="true">↗</span></a><p class="panel-note">The prototype uses sample data and simulated security states. No sign-in or password is needed.</p>`,
    },
    contact: {
      path: 'contact',
      body: `<p class="eyebrow">04 / BUSINESS CONTACT</p><h2 id="dialog-title">Let’s talk.</h2><p>Driver pilot and business inquiries live on Keeper’s landing page.</p><a class="panel-button" href="#" data-open-contact>Visit the pilot section <span aria-hidden="true">↗</span></a>`,
    },
    about: {
      path: 'about',
      body: `<h2 id="dialog-title">About us.</h2><p class="team-intro">Georgia Tech · Team 6</p><div class="team-profiles"><a class="team-profile" href="https://github.com/ittenthepenguin" target="_blank" rel="noopener noreferrer" aria-label="Itten Oh on GitHub"><img src="./assets/team/itten.jpg" alt="" width="80" height="80" decoding="async"><strong>Itten Oh</strong><span>@ittenthepenguin</span></a><a class="team-profile" href="https://github.com/raakka" target="_blank" rel="noopener noreferrer" aria-label="Jacob Rippe on GitHub"><img src="./assets/team/jacob.png" alt="" width="80" height="80" decoding="async"><strong>Jacob Rippe</strong><span>@raakka</span></a><a class="team-profile" href="https://github.com/nihalkabir" target="_blank" rel="noopener noreferrer" aria-label="Nihal Kabir on GitHub"><img src="./assets/team/nihal.png" alt="" width="80" height="80" decoding="async"><strong>Nihal Kabir</strong><span>@nihalkabir</span></a></div><div class="project-links"><a href="https://github.com/ittenthepenguin/keeper" target="_blank" rel="noopener noreferrer">Repository <span aria-hidden="true">↗</span></a><a href="https://github.com/ittenthepenguin/keeper#readme" target="_blank" rel="noopener noreferrer">Project notes <span aria-hidden="true">↗</span></a></div><a class="linkedin-link" href="https://www.linkedin.com/in/itten-oh-b520b7321/" target="_blank" rel="noopener noreferrer">Itten on LinkedIn <span aria-hidden="true">↗</span></a>`,
    },
    help: {
      path: 'help',
      body: `<p class="eyebrow">A MOUSE IS OPTIONAL</p><h2 id="dialog-title">Make yourself<br>at home.</h2><ul class="shortcut-list"><li>Move through destinations <span><kbd>↑</kbd><kbd>↓</kbd></span></li><li>Open selected destination <kbd>Enter</kbd></li><li>Jump to a destination <span><kbd>1</kbd>–<kbd>5</kbd></span></li><li>First / last destination <span><kbd>Home</kbd><kbd>End</kbd></span></li><li>Switch light / dark mode <kbd>T</kbd></li><li>Pause / resume all ASCII motion <kbd>P</kbd></li><li>Replay the terminal entrance <kbd>R</kbd></li><li>Close this panel <kbd>Esc</kbd></li></ul><p class="panel-note">Use Tab to move through all page controls. Reduced-motion preferences pause the scene and skip the entrance automatically.</p>`,
    },
  };

  // Only accept navigation schemes appropriate for these destination controls.
  function destination(value, allowMail = false) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) || (allowMail && url.protocol === 'mailto:') ? url.href : null;
    } catch { return null; }
  }
  const demoUrl = destination(config.demoUrl);
  const landingUrl = destination(config.landingUrl);
  const contactUrl = destination(config.contactUrl) || (landingUrl ? new URL('#pilot', landingUrl).href : null);
  if (demoUrl) menu[1].href = demoUrl;
  else menu[1].removeAttribute('href');

  function openPanel(name) {
    const panel = content[name];
    if (!panel) return;
    returnFocus = document.activeElement;
    $('#dialog-path').textContent = `~/keeper/${panel.path}`;
    $('#dialog-content').innerHTML = panel.body;
    document.querySelectorAll('[data-open-demo]').forEach(link => {
      if (demoUrl) link.href = demoUrl;
      else { link.removeAttribute('href'); link.textContent = 'Demo URL will connect here'; }
    });
    document.querySelectorAll('[data-open-contact]').forEach(link => {
      if (contactUrl) link.href = contactUrl;
      else { link.removeAttribute('href'); link.textContent = 'Pilot section will connect here'; }
    });
    dialog.showModal();
    $('#close-dialog').focus();
  }
  function closePanel() { dialog.close(); }
  dialog.addEventListener('close', () => { returnFocus?.focus({ preventScroll: true }); });
  $('#close-dialog').addEventListener('click', closePanel);
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePanel();
  });

  menu.forEach((item, index) => {
    item.addEventListener('pointerenter', () => select(index));
    item.addEventListener('focus', () => select(index));
    item.addEventListener('click', (event) => {
      const name = item.dataset.destination;
      const url = name === 'contact' ? contactUrl : destination(config[`${name}Url`]);
      select(index);
      if (name === 'demo' && demoUrl) return;
      event.preventDefault();
      if (url) { window.location.assign(url); return; }
      if (name === 'contact' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail || '')) {
        window.location.assign(`mailto:${config.contactEmail}?subject=Keeper%20business%20inquiry`);
        return;
      }
      openPanel(name === 'demo' ? 'landing' : name);
    });
  });

  function syncTheme() {
    const light = document.documentElement.dataset.theme === 'light';
    $('#theme-toggle').setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} mode`);
    $('#theme-label').textContent = light ? 'DARK' : 'LIGHT';
    $('meta[name="theme-color"]').content = light ? '#f2f1e8' : '#101411';
  }
  function toggleTheme() {
    const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('keeper-theme', theme); } catch { /* Storage is optional. */ }
    syncTheme();
    road.refreshPalette();
    window.keeperEntrance?.refreshPalette();
    announce(`${theme === 'light' ? 'Light' : 'Dark'} mode enabled.`);
  }
  syncTheme();

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const road = new window.KeeperRoad($('#road-canvas'), {
    reducedMotion: motionPreference.matches,
    onPhase(phase) {
      $('#scene-number').textContent = phase.number;
      $('#story-index').textContent = phase.number;
      $('#story-phase').textContent = phase.label.toUpperCase();
      $('#story-quote').textContent = phase.quote;
      $('#story-caption').textContent = phase.caption;
    },
    onProgress(progress, frame) {
      $('#story-progress').style.width = `${progress * 100}%`;
      $('#scene-frame').textContent = `FRAME ${String(frame).padStart(5, '0')}`;
    },
  });
  function syncPause() {
    $('#pause-label').textContent = road.paused ? 'PLAY' : 'PAUSE';
    $('#pause-symbol').textContent = road.paused ? '▷' : 'Ⅱ';
    $('#pause-button').setAttribute('aria-label', `${road.paused ? 'Resume' : 'Pause'} animation`);
  }
  function togglePause() {
    road.setPaused(!road.paused); syncPause();
    window.keeperEntrance?.setPaused(road.paused);
    announce(`Animation ${road.paused ? 'paused' : 'resumed'}.`);
  }
  syncPause();
  motionPreference.addEventListener('change', (event) => { road.setPaused(event.matches); window.keeperEntrance?.setPaused(event.matches); syncPause(); });
  $('#theme-toggle').addEventListener('click', toggleTheme);
  $('#pause-button').addEventListener('click', togglePause);
  $('#help-button').addEventListener('click', () => openPanel('help'));
  $('.brand').addEventListener('click', (event) => { event.preventDefault(); select(1); });

  document.addEventListener('keydown', (event) => {
    if (dialog.open || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const target = event.target;
    if (target.matches('input,textarea,select,[contenteditable="true"]')) return;
    const fromMenu = target.closest('#navigation');
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      select(selected + (event.key === 'ArrowDown' ? 1 : -1), true);
    } else if ((event.key === 'Home' || event.key === 'End') && fromMenu) {
      event.preventDefault(); select(event.key === 'Home' ? 0 : 4, true);
    } else if (/^[1-5]$/.test(event.key)) {
      event.preventDefault(); select(Number(event.key) - 1, true); menu[selected].click();
    } else if (event.key === 'Enter' && (target === document.body || target === $('#navigation'))) {
      event.preventDefault(); menu[selected].click();
    } else if (event.key.toLowerCase() === 't') {
      event.preventDefault(); toggleTheme();
    } else if (event.key.toLowerCase() === 'p' || (event.key === ' ' && !target.closest('a,button'))) {
      event.preventDefault(); togglePause();
    } else if (event.key.toLowerCase() === 'r') {
      event.preventDefault(); window.keeperEntrance?.play();
    } else if (event.key === '?') {
      event.preventDefault(); openPanel('help');
    }
  });
})();
