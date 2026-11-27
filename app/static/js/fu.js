/* Fu — the FutureAcad guide robot (home page, then About: see PAGES).
   - 3D robot drawn with three.js (already loaded by the site). Falls back to a flat image if WebGL is unavailable.
   - Voice uses the browser's built-in speechSynthesis: no libraries, no paid APIs.
   - The spoken text is always exactly the text shown in the speech bubble.
   - Fu glides to a different place on screen for each section of the tour. */
(function () {
  'use strict';
  if (window.__faFu) return;
  window.__faFu = true;

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var synth = ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) ? window.speechSynthesis : null;

  function SS0(k) { try { var v = sessionStorage.getItem(k); sessionStorage.removeItem(k); return v; } catch (e) { return null; } }

  var WELCOME = "Hi! I'm Fu, your friendly FutureAcad guide. Welcome! Let me take you on a quick tour and show you what we do.";
  // One tour per page. When a page's tour ends, Fu opens `next` and carries on there.
  // pos = [x, y] anchor of Fu on screen: 0 = left/top edge, 1 = right/bottom edge.
  var PAGES = {
    '/': { next: '/about', nextName: 'About', steps: [
      { id: 'scene2', pos: [0.03, 0.12], text: "FutureAcad is a deep tech company, based in Dubai and established in 2025. We pair frontier AI with enterprise engineering to build systems that run in production." },
      { id: 'scene-caps', pos: [0.97, 0.92], text: "We work in three disciplines: AI applications, AI and IT solutions, and IT staffing. Three ways to work with us, and one outcome." },
      { id: 'scene3', pos: [0.03, 0.92], text: "Behind the software is the infrastructure. We design and run the cloud, data centres and systems your applications need." },
      { id: 'scene4', pos: [0.97, 0.12], text: "Talent has no borders. Pre-trained, industry-ready engineers help you build faster, through dedicated pods or staffing." },
      { id: 'scene-process', pos: [0.97, 0.92], text: "Here is how it works. You share a problem, we scope it with you, then build, launch and support it. Builds run for 4, 8 or 24 weeks." },
      { id: 'scene5', pos: [0.03, 0.12], text: "We focus on outcomes, not promises. These are the numbers behind what we have shipped." },
      { id: 'scene-eco', pos: [0.97, 0.12], text: "These platforms are already live, including an AI interview platform, a voice agent, an AI tutor and a campus system." },
      { id: 'scene-why', pos: [0.03, 0.92], text: "We are a team that has shipped before, with delivery hubs in Dubai, Bengaluru and Singapore." },
      { id: 'scene6', pos: [0.97, 0.88], text: "That's our home page! Next, let me show you who we are. Off to the About page!" }
    ] },
    '/about': { steps: [
      { id: 'storyHeading', pos: [0.97, 0.12], text: "Welcome to our About page! FutureAcad is a startup built for what comes next, launching production-grade platforms for mission-critical problems." },
      { id: 'foundationHeading', pos: [0.03, 0.92], text: "Everything we ship is built for real production trust, for global enterprises and for tech talent." },
      { id: 'teamHeading', pos: [0.97, 0.92], text: "These are the people behind the systems: teams across AI, research, product, quality, delivery and operations." },
      { id: 'capHeading', pos: [0.03, 0.12], text: "We combine artificial intelligence, software engineering, research and product thinking into technology built for real-world impact." },
      { id: 'buildHeading', pos: [0.97, 0.12], text: "This is how we turn ideas into intelligent systems, products and platforms that people really use." },
      { id: 'workHeading', pos: [0.03, 0.92], text: "Four operating principles guide our architecture, our engineering teams and our partnerships." },
      { id: 'beliefsHeading', pos: [0.97, 0.92], text: "And four convictions shape everything we build, from every technical choice to every client engagement." },
      { id: 'visionHeading', pos: [0.03, 0.12], text: "Anchored in Dubai and working globally, this is our roadmap for deep tech impact." },
      { sel: '.about-cta-section', clip: 'cta', pos: [0.97, 0.88], text: "That is the tour! Tell us the problem you want solved. We reply within 5 business days, and the scoping call is free." }
    ] }
  };
  var PATH = location.pathname.replace(/\/+$/, '') || '/';
  var PAGE = PAGES[PATH];
  if (!PAGE) return;
  var STEPS = PAGE.steps;
  var CONTINUING = SS0('fu-tour') === PATH; // arrived here from the previous page's tour
  var HOME = [1, 1];

  var SS = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
             set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} } };

  var state = { muted: SS.get('fu-muted') === '1', voiceUnlocked: false, step: -1, running: false, paused: false,
                token: 0, timer: null, userScrolled: false, dismissed: false, speaking: false, kick: 0,
                px: 1, py: 1, lean: 0, moveUntil: 0 };

  var ICON = {
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2-6z" fill="currentColor"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    unmute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M4 4v4.5h4.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>'
  };

  /* ---------- DOM ---------- */
  var root = document.createElement('div');
  root.className = 'fu';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Fu, your FutureAcad guide');
  root.innerHTML =
    '<div class="fu__bubble" id="fuBubble" role="status" aria-live="polite" hidden>' +
      '<button class="fu__x" type="button" data-a="exit" aria-label="Close Fu">&times;</button>' +
      '<p class="fu__text" id="fuText"></p>' +
      '<span class="fu__puff fu__puff--a" aria-hidden="true"></span><span class="fu__puff fu__puff--b" aria-hidden="true"></span>' +
      '<div class="fu__row" id="fuActions"></div>' +
      '<form class="fu__ask" id="fuAsk" autocomplete="off"><input id="fuQ" type="text" maxlength="200" placeholder="Ask Fu…" aria-label="Ask Fu a question" />' +
        '<button type="submit" aria-label="Send question">' + ICON.send + '</button></form>' +
      '<div class="fu__ctrl" id="fuCtrl">' +
        '<button type="button" data-a="mic" id="fuMic" aria-label="Talk to Fu" title="Talk to Fu">' + ICON.mic + '</button>' +
        '<button type="button" data-a="mute" id="fuMute" aria-label="Mute voice" title="Mute / Unmute">' + ICON.mute + '</button>' +
        '<button type="button" data-a="replay" aria-label="Replay narration" title="Replay">' + ICON.replay + '</button>' +
        '<button type="button" data-a="pause" id="fuPause" aria-label="Pause tour" title="Pause / Resume">' + ICON.pause + '</button>' +
      '</div>' +
    '</div>' +
    '<button class="fu__bot" type="button" id="fuBot" aria-label="Open Fu, your guide"></button>';
  document.body.appendChild(root);

  var bubble = root.querySelector('#fuBubble'), textEl = root.querySelector('#fuText'),
      actions = root.querySelector('#fuActions'), muteBtn = root.querySelector('#fuMute'),
      pauseBtn = root.querySelector('#fuPause'), bot = root.querySelector('#fuBot');
  if (!synth) muteBtn.hidden = true;
  muteBtn.innerHTML = state.muted ? ICON.unmute : ICON.mute; muteBtn.setAttribute('aria-label', state.muted ? 'Unmute voice' : 'Mute voice');

  function setSpeaking(on) { state.speaking = !!on; root.classList.toggle('is-speaking', !!on); }
  function show(text, btns) {
    bubble.hidden = false; textEl.textContent = text; actions.innerHTML = '';
    (btns || []).forEach(function (b) {
      var el = document.createElement('button'); el.type = 'button'; el.className = 'fu__btn' + (b.alt ? ' fu__btn--alt' : '');
      el.dataset.a = b.a; el.textContent = b.t; actions.appendChild(el);
    });
    requestAnimationFrame(function () { place(state.px, state.py); });
  }

  /* ---------- where Fu stands on screen ---------- */
  function place(ax, ay, animate) {
    var narrow = innerWidth <= 640;
    if (narrow) { ax = 1; ay = 1; }
    var w = root.offsetWidth, h = root.offsetHeight, m = 12, top = narrow ? m : 84;
    var x = m + ax * Math.max(0, innerWidth - w - 2 * m);
    var y = top + ay * Math.max(0, innerHeight - h - top - m);
    var prev = parseFloat(root.style.getPropertyValue('--x')) || x;
    if (animate && Math.abs(x - prev) > 40) { state.lean = x > prev ? 1 : -1; state.moveUntil = performance.now() + 1500; root.classList.add('is-moving'); setTimeout(function () { root.classList.remove('is-moving'); }, 1500); }
    root.style.setProperty('--x', x + 'px'); root.style.setProperty('--y', y + 'px');
    state.px = ax; state.py = ay;
    root.classList.toggle('fu--r', ax > 0.5);
  }
  window.addEventListener('resize', function () { place(state.px, state.py); });

  /* ---------- 3D robot (modelled on the Blender reference: round head, yellow eyes, navy accents) ---------- */
  function build3D() {
    if (!window.THREE) return false;
    var T = THREE, W = 170, H = 210, cv = document.createElement('canvas');
    var renderer;
    try { renderer = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: true }); } catch (e) { return false; }
    if (!renderer.getContext()) return false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(W, H, false);
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    cv.className = 'fu__cv'; cv.setAttribute('aria-hidden', 'true'); bot.appendChild(cv);
    var scene = new T.Scene(), cam = new T.PerspectiveCamera(30, W / H, 0.1, 50);
    cam.position.set(0, 0.6, 7.4); cam.lookAt(0, 0.55, 0);
    scene.add(new T.HemisphereLight(0xffffff, 0x9aa6c0, 1.0));
    var key = new T.DirectionalLight(0xffffff, 1.3); key.position.set(-2.5, 4, 5); scene.add(key);
    var fill = new T.DirectionalLight(0xe8eeff, 0.5); fill.position.set(3, 1, 3); scene.add(fill);

    function phys(c, o) { return new T.MeshPhysicalMaterial(Object.assign({ color: c, roughness: 0.18, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06 }, o || {})); }
    function basic(c, o) { return new T.MeshBasicMaterial(Object.assign({ color: c }, o || {})); }
    function ball(r, m, x, y, z, sx, sy, sz) { var o = new T.Mesh(new T.SphereGeometry(r, 40, 30), m); o.position.set(x || 0, y || 0, z || 0); o.scale.set(sx || 1, sy || 1, sz || 1); return o; }
    function cyl(r1, r2, h, m, x, y, z) { var o = new T.Mesh(new T.CylinderGeometry(r1, r2, h, 24), m); o.position.set(x || 0, y || 0, z || 0); return o; }
    function torus(r, t, m, x, y, z, arc) { var o = new T.Mesh(new T.TorusGeometry(r, t, 12, 40, arc || Math.PI * 2), m); o.position.set(x || 0, y || 0, z || 0); return o; }
    function glowTex() { var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
      var r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,225,90,1)'); r.addColorStop(0.35, 'rgba(255,215,80,.4)'); r.addColorStop(1, 'rgba(255,215,80,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); }
    var GT = glowTex();
    function glow(size, x, y, z, op) { var s = new T.Sprite(new T.SpriteMaterial({ map: GT, blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: op })); s.scale.set(size, size, 1); s.position.set(x, y, z); return s; }
    var white = phys(0xe9eaee), navy = phys(0x23304f, { roughness: 0.3 }), chrome = phys(0xc9ccd3, { metalness: 0.95, roughness: 0.12 }),
        visorM = phys(0x07080c, { roughness: 0.03, metalness: 0.3 }), yellow = basic(0xfff07a), pinkM = basic(0xf7b3b3);

    var root3 = new T.Group(); scene.add(root3);
    var shadow = new T.Mesh(new T.CircleGeometry(0.85, 40), basic(0x2a3550, { transparent: true, opacity: 0.16, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.18; scene.add(shadow);

    // body: rounded egg with navy belly patch and yellow chest light
    var body = ball(0.5, white, 0, -0.1, 0, 0.92, 1.05, 0.86); root3.add(body);
    var belly = ball(0.3, navy, 0.0, -0.3, 0.27, 1.05, 0.95, 0.5); root3.add(belly);
    root3.add(ball(0.1, yellow, -0.06, 0.08, 0.42, 1, 1, 0.4));
    var chestRing = torus(0.11, 0.018, chrome, -0.06, 0.08, 0.43, Math.PI * 1.4); chestRing.rotation.z = 0.6; root3.add(chestRing);
    var chestGlow = glow(0.45, -0.06, 0.08, 0.46, 0.7); root3.add(chestGlow);
    root3.add(ball(0.24, navy, 0, -0.6, 0, 1.25, 0.45, 1));

    // legs with glowing ankle rings and big round feet
    var legs = [];
    [-1, 1].forEach(function (s) {
      var g = new T.Group(); g.position.set(s * 0.2, -0.62, 0); root3.add(g); legs.push(g);
      g.add(cyl(0.11, 0.11, 0.36, white, 0, -0.2, 0));
      g.add(ball(0.11, navy, 0, -0.03, 0, 1, 0.5, 1));
      var ring = torus(0.13, 0.02, yellow, 0, -0.4, 0.02); ring.rotation.x = Math.PI / 2; g.add(ring);
      g.add(glow(0.4, 0, -0.4, 0.1, 0.55));
      g.add(ball(0.18, white, 0, -0.48, 0.08, 1, 0.55, 1.35));
    });

    // arms: navy shoulder, white tube, silver ball hand
    function arm(s) {
      var g = new T.Group(); g.position.set(s * 0.46, 0.12, 0); root3.add(g);
      g.add(ball(0.13, navy, 0, 0, 0));
      g.add(cyl(0.065, 0.065, 0.42, white, 0, -0.24, 0));
      g.add(ball(0.1, chrome, 0, -0.5, 0));
      return g;
    }
    var armR = arm(1), armL = arm(-1);

    // head: big glossy sphere, black visor, yellow eyes and smile, blush, ear rings, antenna
    var head = new T.Group(); head.position.set(0, 0.95, 0); root3.add(head);
    head.add(ball(0.66, white, 0, 0, 0, 1.03, 0.95, 1));
    head.add(ball(0.5, visorM, 0, -0.02, 0.36, 1.12, 0.8, 0.66));
    var eyes = new T.Group(); eyes.position.set(0, 0.07, 0.69); head.add(eyes);
    var eyeBlack = basic(0x000000), eyeShine = basic(0xffffff);
    [-1, 1].forEach(function (s) {
      eyes.add(ball(0.13, yellow, s * 0.21, 0, -0.01, 0.84, 1.1, 0.3));      // yellow rim
      eyes.add(ball(0.1, eyeBlack, s * 0.21, -0.005, 0.02, 0.84, 1.1, 0.3)); // black pupil
      eyes.add(ball(0.028, eyeShine, s * 0.21 - 0.03, 0.04, 0.05));          // sparkle
    });
    var mouth = torus(0.08, 0.018, yellow, 0, -0.16, 0.69, Math.PI); mouth.rotation.z = Math.PI; head.add(mouth);
    [-1, 1].forEach(function (s) { head.add(ball(0.05, pinkM, s * 0.38, -0.12, 0.54, 1.3, 0.8, 0.3)); });
    var ears = [];
    [-1, 1].forEach(function (s) {
      var c = cyl(0.17, 0.17, 0.1, navy, s * 0.67, 0, 0); c.rotation.z = Math.PI / 2; head.add(c);
      var r = torus(0.11, 0.025, yellow, s * 0.73, 0, 0); r.rotation.y = Math.PI / 2; head.add(r);
      var gl = glow(0.45, s * 0.75, 0, 0, 0.5); head.add(gl); ears.push(gl);
    });
    head.add(cyl(0.012, 0.012, 0.32, chrome, 0, 0.78, 0));
    head.add(ball(0.07, yellow, 0, 0.96, 0));
    var antGlow = glow(0.4, 0, 0.96, 0, 0.8); head.add(antGlow);

    var mx = 0, my = 0;
    window.addEventListener('pointermove', function (e) { mx = (e.clientX / innerWidth - 0.5) * 2; my = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });

    var t0 = performance.now(), blinkAt = 2000, last = 0, born = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden || !root.classList.contains('is-in')) { born = 0; return; }
      if (now - last < 24) return; last = now; if (!born) born = now;
      var t = (now - t0) / 1000, moving = now < state.moveUntil, age = (now - born) / 1000;
      var k = Math.min(1, age / 0.9); root3.scale.setScalar(k < 1 ? Math.max(0.01, (1 - Math.pow(1 - k, 3)) * (1 + Math.sin(k * Math.PI * 1.5) * 0.14 * (1 - k))) : 1);
      root3.position.y = Math.sin(t * 2.2) * 0.05 + (moving ? 0.15 : 0);
      root3.rotation.y += ((reduced ? 0 : -0.35 + mx * 0.35 + (moving ? state.lean * 0.5 : 0)) - root3.rotation.y) * 0.08;
      root3.rotation.z += ((moving ? -state.lean * 0.12 : 0) - root3.rotation.z) * 0.1;
      head.rotation.y += (mx * 0.3 - head.rotation.y) * 0.1; head.rotation.x += (my * 0.15 - head.rotation.x) * 0.1;
      head.rotation.z = Math.sin(t * 1.3) * 0.04 + (state.speaking ? Math.sin(t * 5) * 0.05 : 0);
      var waving = root.classList.contains('is-waving');
      var armT = waving ? 2.4 + Math.sin(t * 9) * 0.3 : (state.speaking ? 0.8 + Math.sin(t * 3) * 0.25 : 0.35 + Math.sin(t * 1.4) * 0.04);
      armR.rotation.z += (armT - armR.rotation.z) * 0.14;
      armL.rotation.z = -0.35 - Math.sin(t * 1.4) * 0.04 - (state.speaking ? Math.abs(Math.sin(t * 2.4)) * 0.3 : 0);
      legs.forEach(function (l, n) { l.rotation.x += ((moving ? (n ? 0.4 : -0.4) * Math.sin(t * 8) : 0) - l.rotation.x) * 0.15; });
      state.kick *= 0.82;
      var osc = Math.abs(Math.sin(t * 17));
      mouth.scale.set(1, state.speaking ? 1 + 1.7 * osc + state.kick : 1, 1);
      if (now > blinkAt) { eyes.scale.y = 0.1; if (now > blinkAt + 120) { eyes.scale.y = 1; blinkAt = now + 2200 + Math.random() * 2600; } }
      var pulse = 0.7 + 0.3 * Math.sin(t * 3) + (state.speaking ? 0.2 : 0);
      ears.forEach(function (g) { g.material.opacity = 0.25 + 0.35 * pulse; }); antGlow.material.opacity = 0.4 + 0.4 * pulse; chestGlow.material.opacity = 0.4 + 0.4 * pulse;
      renderer.render(scene, cam);
    }
    requestAnimationFrame(frame);
    return true;
  }

  var ok3d = false;
  try { ok3d = build3D(); } catch (e) { ok3d = false; }
  if (!ok3d) {
    root.classList.add('fu--flat');
    bot.innerHTML = '<img class="fu__img" src="/static/img/fu.webp" srcset="/static/img/fu-sm.webp 300w, /static/img/fu.webp 600w" sizes="150px" width="300" height="360" alt="" decoding="async" />';
  }

  /* ---------- voice ---------- */
  var voice = null;
  function pickVoice() {
    if (!synth) return;
    var vs = synth.getVoices() || [];
    var en = vs.filter(function (v) { return /^en(-|_|$)/i.test(v.lang); });
    // child voices first (Edge ships 'Ana' and 'Maisie'), then bright female voices raised in pitch
    var prefs = [/ana/i, /maisie/i, /child|kid/i, /jenny|aria|sonia|libby/i, /google uk english female/i, /google us english/i, /samantha|karen|serena|moira/i, /female/i, /natural/i];
    for (var i = 0; i < prefs.length; i++) { var m = en.filter(function (v) { return prefs[i].test(v.name); })[0]; if (m) { voice = m; return; } }
    voice = en[0] || null;
  }
  if (synth) { pickVoice(); if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice); }

  // Pre-recorded ElevenLabs clips (voice "Fu"); lines without a clip use the browser voice.
  var CLIP_DIR = '/static/audio/fu/';
  var CLIPS = {};
  CLIPS[WELCOME] = 'welcome';
  var QA_FALLBACK = "I'm not sure about that one yet. Tell our team your question and they will reply within 5 business days.";
  CLIPS[QA_FALLBACK] = 'qa-fallback';
  // Clip file per step: home = <id>.mp3, other pages = <page>-<id>.mp3 (e.g. about-teamHeading.mp3)
  Object.keys(PAGES).forEach(function (path) {
    var pre = path === '/' ? '' : path.slice(1).replace(/\//g, '-') + '-';
    PAGES[path].steps.forEach(function (s) { CLIPS[s.text] = pre + (s.id || s.clip); });
  });
  var clip = null;

  function stopVoice() {
    state.token++;
    if (synth) { try { synth.cancel(); } catch (e) {} }
    if (clip) { try { clip.pause(); } catch (e) {} clip = null; }
    setSpeaking(false);
  }

  function say(text, cb) {
    stopVoice(); var my = state.token;
    clearTimeout(state.timer);
    var wait = Math.max(2800, text.length * 62);
    var silent = function () { setSpeaking(false); state.timer = setTimeout(function () { if (my === state.token && cb) cb(); }, wait); };
    if (state.muted) { silent(); return; }
    if (!state.voiceUnlocked) { blocked(); return; }
    if (CLIPS[text] && window.Audio) { playClip(text, cb, my, silent); return; }
    silent(); // one voice only: no recording yet -> show the text, keep the tour moving
  }

  function playClip(text, cb, my, silent) {
    var a = new Audio(CLIP_DIR + CLIPS[text] + '.mp3'); clip = a;
    var fallback = function () { if (my !== state.token) return; clip = null; silent(); };
    a.onplaying = function () { if (my === state.token) setSpeaking(true); };
    a.ontimeupdate = function () { if (my === state.token) state.kick = 0.6 + Math.random() * 0.8; };
    a.onended = function () { setSpeaking(false); clip = null; if (my === state.token && cb) state.timer = setTimeout(function () { if (my === state.token) cb(); }, 900); };
    a.onerror = fallback; // missing file -> browser voice
    var p = a.play();
    if (p && p.catch) p.catch(function (err) {
      if (my !== state.token) return;
      if (err && err.name === 'NotAllowedError') blocked();
      else fallback();
    });
  }

  function speakTTS(text, cb, my, silent) {
    if (!synth) { silent(); return; }
    var u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-US'; }
    var kid = voice && /ana|maisie|child|kid/i.test(voice.name);
    u.rate = kid ? 1.05 : 1.1; u.pitch = kid ? 1.2 : 1.9; u.volume = 1; // child-like: high, bright, slightly quick
    var started = false;
    u.onstart = function () { started = true; if (my === state.token) setSpeaking(true); };
    u.onboundary = function () { state.kick = 1.2; };
    u.onend = function () { setSpeaking(false); if (my === state.token && cb) state.timer = setTimeout(function () { if (my === state.token) cb(); }, 900); };
    u.onerror = function () { setSpeaking(false); if (my === state.token) { state.voiceUnlocked = false; needEnable(); silent(); } };
    try { synth.speak(u); } catch (e) { silent(); return; }
    setTimeout(function () { // autoplay can be blocked silently
      if (my === state.token && !started && !synth.speaking) blocked();
    }, 1500);
  }

  var enableShown = false;
  function needEnable() {
    if (enableShown || state.muted) return; enableShown = true;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'fu__btn fu__btn--alt'; b.dataset.a = 'enable'; b.id = 'fuEnable';
    b.textContent = 'Enable Voice'; actions.appendChild(b);
  }

  /* ---------- tour ---------- */
  function scrollToEl(el) {
    var y = el.getBoundingClientRect().top + window.pageYOffset - Math.max(0, (innerHeight - el.offsetHeight) / 4);
    y = Math.max(0, y);
    if (window.__faLenis && window.__faLenis.scrollTo) window.__faLenis.scrollTo(y, { duration: 1.4 });
    else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
  }
  function wave() { root.classList.add('is-waving'); setTimeout(function () { root.classList.remove('is-waving'); }, 1600); }

  function runStep(i) {
    if (state.paused || state.dismissed) return;
    state.step = i; state.running = true;
    var s = STEPS[i], el = s.sel ? document.querySelector(s.sel) : document.getElementById(s.id);
    if (el) scrollToEl(el);
    var last = i === STEPS.length - 1;
    show(s.text, !last ? [{ a: 'next', t: 'Skip', alt: true }] :
                 PAGE.next ? [{ a: 'nextpage', t: 'Go to ' + PAGE.nextName }, { a: 'exit', t: 'Finish here', alt: true }] :
                             [{ a: 'contact', t: 'Submit a problem' }, { a: 'exit', t: 'Finish', alt: true }]);
    place(s.pos[0], s.pos[1], true); wave();
    if (enableShown && !state.voiceUnlocked) needEnable();
    setTimeout(function () {
      say(s.text, function () { if (last) { state.running = false; if (PAGE.next && !state.paused && !state.dismissed) goNextPage(); } else if (!state.paused && !state.dismissed) { runStep(i + 1); } });
    }, 900);
  }

  function goTop() {
    if (window.__faLenis && window.__faLenis.scrollTo) window.__faLenis.scrollTo(0, { duration: 1.2 });
    else window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }
  // Home: welcome line at the top of the page first, then each section in order.
  function startTour() {
    state.paused = false; state.dismissed = false; state.step = -1; state.running = true;
    if (PATH !== '/') { runStep(0); return; }
    goTop(); place(HOME[0], HOME[1], true); wave();
    show(WELCOME, [{ a: 'next', t: 'Skip', alt: true }]);
    say(WELCOME, function () { if (!state.paused && !state.dismissed) runStep(0); });
  }
  // Sound got blocked: hold on this line until the visitor taps, instead of skipping it silently.
  function blocked() {
    state.voiceUnlocked = false; stopVoice(); clearTimeout(state.timer);
    var cur = state.step < 0 ? WELCOME : STEPS[state.step].text;
    show(cur, [{ a: 'enable', t: 'Tap to hear Fu' }, { a: 'exit', t: 'Finish', alt: true }]);
  }

  function goNextPage() {
    stopVoice(); SS.set('fu-tour', PAGE.next);
    window.location.href = PAGE.next;
  }

  function welcome() {
    if (CONTINUING) { // keep the tour going straight away on this page
      root.classList.add('is-in'); state.voiceUnlocked = !!synth || !!window.Audio;
      runStep(0); return;
    }
    place(HOME[0], HOME[1]);
    root.classList.add('is-in'); wave();
    goTop();
    show(WELCOME, [{ a: 'start', t: 'Start tour' }, { a: 'exit', t: 'No thanks', alt: true }]);
    // Browsers block sound until the first click, so wait for "Start tour" rather than touring silently.
    if (state.voiceUnlocked && !state.muted) startTour();
  }

  function pauseTour(msg) {
    if (!state.running && state.step < 0) return;
    state.paused = true; stopVoice(); clearTimeout(state.timer); pauseBtn.innerHTML = ICON.play; pauseBtn.setAttribute('aria-label', 'Resume tour');
    if (msg) show(msg, [{ a: 'resume', t: 'Continue tour' }, { a: 'exit', t: "I'll explore myself", alt: true }]);
  }
  function resumeTour() {
    state.paused = false; pauseBtn.innerHTML = ICON.pause; pauseBtn.setAttribute('aria-label', 'Pause tour');
    runStep(Math.max(0, state.step));
  }
  function exitTour() {
    state.dismissed = true; state.running = false; stopVoice(); clearTimeout(state.timer);
    bubble.hidden = true; root.classList.add('is-min'); place(HOME[0], HOME[1], true);
  }

  /* ---------- talk to Fu: answers come only from FutureAcad's own facts ---------- */
  var KB = [
    { c: 'qa-about', k: ['what is futureacad', 'who are you', 'about', 'company', 'what do you do', 'futureacad'], a: "FutureAcad is a deep tech company based in Meydan Free Zone, Dubai, established in 2025. We build AI applications, provide AI and IT solutions, and supply IT staffing to businesses.", u: '/about' },
    { c: 'qa-where', k: ['where', 'located', 'based', 'office', 'dubai', 'address'], a: "We are headquartered in Meydan Free Zone, Dubai, with delivery hubs in Bengaluru and Singapore.", u: '/contact' },
    { c: 'qa-services', k: ['service', 'offer', 'sell', 'products', 'what can you build'], a: "We offer three things: AI applications such as AI Project Builds, Custom Build, HireAI, CRM Voice Agent, AI Tutor and Edu ERP; AI and IT solutions; and IT staffing.", u: '/services' },
    { c: 'qa-pricing', k: ['cost', 'price', 'pricing', 'how much', 'fee', 'free', 'budget', 'afford'], a: "A standard Custom Build has no upfront development fee. You pay for hosting and usage once it is live. An exclusive build carries a basic development fee.", u: '/build/custom-ai-builds/pricing' },
    { c: 'qa-custom', k: ['custom build', 'custom app', 'build an app', 'application'], a: "With Custom Build we reply to your problem within 5 business days, offer a free scoping call, and aim for a working first version in 6 to 8 weeks.", u: '/build/custom-ai-builds' },
    { c: 'qa-timeline', k: ['how long', 'timeline', 'weeks', 'project build', 'ai project', 'fixed scope'], a: "AI Project Builds run for 4, 8 or 24 weeks, with a fixed scope, a named delivery lead and 30 days of hypercare after launch.", u: '/build/ai-project-builds' },
    { c: 'qa-agents', k: ['agent', 'agentic', 'chatbot', 'automation'], a: "We build AI agents that plan steps, use your tools like your CRM or calendar, and complete tasks, with a person approving the steps you choose.", u: '/guides/what-is-agentic-ai' },
    { c: 'qa-hireai', k: ['hire', 'hiring', 'interview', 'recruit', 'candidate', 'hireai'], a: "HireAI runs AI interviews. Each answer is scored against a rubric, with proctoring, recording, transcripts and automatic shortlisting.", u: '/build/hireai' },
    { c: 'qa-voiceagent', k: ['voice', 'call', 'calling', 'phone', 'lead', 'crm', 'sales'], a: "Our CRM Voice Agent makes and receives calls around the clock, scores leads from 0 to 100, logs every call in your CRM and hands over to a person when needed.", u: 'https://crm.rooman.net' },
    { c: 'qa-tutor', k: ['tutor', 'student', 'learn', 'study', 'language'], a: "AI Tutor is a voice-first learning companion in more than 50 languages, with personal learning paths and Socratic questions.", u: 'https://lms.rooman.com' },
    { c: 'qa-erp', k: ['erp', 'campus', 'college', 'school', 'university', 'admission'], a: "Edu ERP is cloud campus management covering admissions, academics, assessment and finance.", u: '/build/product/edu-erp' },
    { c: 'qa-audit', k: ['audit', 'readiness', 'where to start', 'roadmap', 'use case'], a: "The AI Readiness Audit takes 4 weeks and gives you a maturity score, a gap report, your top three use cases ranked by value, and a costed 12-month roadmap.", u: '/transform/ai-readiness-audit' },
    { c: 'qa-managed', k: ['managed', 'run it for us', 'operate', 'sla'], a: "With Managed AI Functions we run a complete function such as customer service or document processing for you, billed against agreed service levels.", u: '/transform/managed-ai' },
    { c: 'qa-staffing', k: ['engineer', 'staff', 'team', 'gcc', 'pod', 'talent', 'developer'], a: "We supply pre-trained engineers through staffing, and dedicated pods of 3 to 6 engineers with a Build–Operate–Transfer option.", u: '/staffing-gcc' },
    { c: 'qa-contact', k: ['contact', 'talk', 'email', 'reach', 'meeting', 'call you', 'demo', 'start'], a: "The quickest way is to submit your problem. We reply within 5 business days and the scoping call is free. You can also email info@futureacad.ae.", u: '/build/submit-a-problem' },
    { c: 'qa-careers', k: ['job', 'jobs', 'career', 'careers', 'work at', 'work for you', 'vacancy', 'internship', 'intern', 'are you hiring', 'join your team', 'apply'], a: "We welcome founders and interns. You can apply as a founder or as an intern on our careers pages.", u: '/build/apply-intern' },
    { c: 'qa-partner', k: ['partner', 'partnership', 'reseller', 'collaborate', 'alliance'], a: "We partner with companies, universities and resellers. Our partner page explains the ways we can work together.", u: '/partner' },
    { c: 'qa-cases', k: ['case study', 'case studies', 'clients', 'customers', 'examples', 'portfolio', 'past work'], a: "Our case studies show the systems we have shipped for real clients, and the results they delivered.", u: '/transform/case-studies' },
    { c: 'qa-security', k: ['security', 'secure', 'privacy', 'data', 'confidential', 'gdpr', 'compliance'], a: "Your data stays protected. We build with secure cloud hosting, access controls and clear data agreements, and we can sign an NDA before scoping.", u: '/contact' },
    { c: 'qa-industries', k: ['industry', 'industries', 'sector', 'healthcare', 'bank', 'finance', 'retail', 'education', 'government'], a: "We work across industries, including education, finance, healthcare, retail and the public sector.", u: '/services' },
    { c: 'qa-whatai', k: ['what is ai', 'artificial intelligence', 'machine learning', 'llm', 'genai', 'generative'], a: "AI lets software understand language, spot patterns and make decisions. We use it to automate real work for businesses.", u: '/guides/what-is-agentic-ai' },
    { c: 'qa-thanks', k: ['thank', 'thanks', 'great', 'awesome', 'cool', 'bye'], a: "You're welcome! I'm here whenever you need me. Just tap the mic and ask." },
    { c: 'qa-hello', k: ['hello', 'hi', 'hey', 'good morning', 'good evening'], a: "Hi there! Ask me about our AI services, pricing, timelines or how to get started." }
  ];
  KB.forEach(function (e) { CLIPS[e.a] = e.c; });
  function answer(q) {
    var s = ' ' + q.toLowerCase().replace(/[^a-z0-9 ]/g, ' ') + ' ', best = null, score = 0;
    KB.forEach(function (e) {
      var n = 0; e.k.forEach(function (w) {
        var hit = s.indexOf(' ' + w + ' ') > -1 || (w.length >= 4 && s.indexOf(' ' + w) > -1);
        if (hit) n += w.split(' ').length * 2 + (w.length >= 6 ? 1 : 0);
      });
      if (n > score) { score = n; best = e; }
    });
    return best || { c: 'qa-fallback', a: "I'm not sure about that one yet. Tell our team your question and they will reply within 5 business days.", u: '/build/submit-a-problem' };
  }
  function ask(q) {
    q = (q || '').trim(); if (!q) return;
    if (state.running && !state.paused) { state.paused = true; clearTimeout(state.timer); pauseBtn.innerHTML = ICON.play; }
    var r = answer(q);
    show(r.a, (r.u ? [{ a: 'go', t: 'Open page', u: r.u }] : []).concat([{ a: 'start', t: 'Take the tour', alt: true }]));
    if (r.u) actions.querySelector('[data-a="go"]').dataset.u = r.u;
    say(r.a, null);
  }
  var askForm = root.querySelector('#fuAsk'), askIn = root.querySelector('#fuQ'), micBtn = root.querySelector('#fuMic');
  askForm.addEventListener('submit', function (e) { e.preventDefault(); unlock(); ask(askIn.value); askIn.value = ''; });
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null;
  if (!Rec) { micBtn.hidden = true; }
  function listen() {
    if (!Rec) return;
    stopVoice();
    try {
      rec = new Rec(); rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
      root.classList.add('is-listening'); show('Listening… ask me anything about FutureAcad.', []);
      rec.onresult = function (e) { var q = e.results[0][0].transcript; askIn.value = q; ask(q); askIn.value = ''; };
      rec.onerror = function (e) {
        var why = e && e.error;
        show(why === 'not-allowed' || why === 'service-not-allowed' ? "I need permission to use your microphone. Allow it in your browser, or type your question below." :
             why === 'no-speech' ? "I didn't hear anything. Tap the mic and speak, or type your question below." :
             why === 'network' ? "Voice questions need an internet connection. You can type your question below." :
             "I couldn't hear that. You can type your question below.", []);
      };
      rec.onend = function () { root.classList.remove('is-listening'); };
      rec.start();
    } catch (x) { root.classList.remove('is-listening'); }
  }

  /* ---------- events ---------- */
  function unlock() {
    if (state.voiceUnlocked) return;
    state.voiceUnlocked = true; var e = document.getElementById('fuEnable'); if (e) e.remove(); enableShown = false;
    if (synth) { try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (x) {} }
  }

  root.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-a]'), isBot = ev.target.closest('#fuBot');
    if (isBot) { state.dismissed = false; root.classList.remove('is-min'); state.paused = false; state.userScrolled = true; unlock(); show("Hi, I'm Fu! Want the tour?", [{ a: 'start', t: 'Start tour' }, { a: 'exit', t: 'Not now', alt: true }]); return; }
    if (!t) return;
    unlock();
    var a = t.dataset.a;
    if (a === 'enable') { if (state.step < 0) startTour(); else { state.paused = false; state.dismissed = false; runStep(state.step); } }
    else if (a === 'start') { startTour(); }
    else if (a === 'nextpage') { goNextPage(); }
    else if (a === 'next') { runStep(state.step < 0 ? 0 : Math.min(STEPS.length - 1, state.step + 1)); }
    else if (a === 'resume') { resumeTour(); }
    else if (a === 'pause') { if (state.paused) resumeTour(); else pauseTour(textEl.textContent); }
    else if (a === 'replay') { say(state.step < 0 ? WELCOME : STEPS[state.step].text, null); }
    else if (a === 'mute') { state.muted = !state.muted; SS.set('fu-muted', state.muted ? '1' : '0'); muteBtn.innerHTML = state.muted ? ICON.unmute : ICON.mute; muteBtn.setAttribute('aria-label', state.muted ? 'Unmute voice' : 'Mute voice'); if (state.muted) stopVoice(); else { state.voiceUnlocked = true; } }
    else if (a === 'contact') { window.location.href = '/build/submit-a-problem'; }
    else if (a === 'exit') { exitTour(); }
    else if (a === 'mic') { listen(); }
    else if (a === 'go') { var gu = t.dataset.u || '/'; if (/^https?:/.test(gu)) window.open(gu, '_blank', 'noopener'); else window.location.href = gu; }
  });

  function userTook(ev) {
    if (ev && ev.target && root.contains(ev.target)) return;
    state.userScrolled = true;
    if (state.running && !state.paused && !state.dismissed) pauseTour('Tour paused. Want me to carry on?');
  }
  window.addEventListener('wheel', userTook, { passive: true });
  window.addEventListener('touchstart', userTook, { passive: true });
  window.addEventListener('keydown', function (e) { if (e.target && e.target.id === 'fuQ') return; if (/^(ArrowDown|ArrowUp|PageDown|PageUp|Home|End| )$/.test(e.key)) userTook(e); });
  ['pointerdown', 'keydown'].forEach(function (n) { window.addEventListener(n, function (ev) { if (!root.contains(ev.target) || n === 'pointerdown') unlock(); }, { passive: true }); });
  window.addEventListener('pagehide', stopVoice);
  document.addEventListener('visibilitychange', function () { if (document.hidden) { if (state.running && !state.paused) pauseTour('Tour paused. Want me to carry on?'); else stopVoice(); } });

  /* ---------- start after the preloader ---------- */
  place(HOME[0], HOME[1]);
  function begin() { setTimeout(welcome, 400); }
  var pre = document.getElementById('preloader'), tries = 0;
  (function wait() {
    if (!pre || pre.classList.contains('done') || ++tries > 40) return begin();
    setTimeout(wait, 250);
  })();
})();
