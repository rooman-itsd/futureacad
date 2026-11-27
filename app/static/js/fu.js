/* Fu — the FutureAcad guide robot (home page only).
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

  var WELCOME = "Hi! I'm Fu, your friendly FutureAcad guide. Welcome! Let me take you on a quick tour and show you what we do.";
  // pos = [x, y] anchor of Fu on screen: 0 = left/top edge, 1 = right/bottom edge.
  var STEPS = [
    { id: 'scene2', pos: [0.03, 0.70], text: "FutureAcad is a deep tech company, based in Dubai and established in 2025. We pair frontier AI with enterprise engineering to build systems that run in production." },
    { id: 'scene-caps', pos: [0.97, 0.18], text: "We work in three disciplines: AI applications, AI and IT solutions, and IT staffing. Three ways to work with us, and one outcome." },
    { id: 'scene3', pos: [0.03, 0.22], text: "Behind the software is the infrastructure. We design and run the cloud, data centres and systems your applications need." },
    { id: 'scene4', pos: [0.97, 0.70], text: "Talent has no borders. Pre-trained, industry-ready engineers help you build faster, through dedicated pods or staffing." },
    { id: 'scene-process', pos: [0.50, 0.97], text: "Here is how it works. You share a problem, we scope it with you, then build, launch and support it. Builds run for 4, 8 or 24 weeks." },
    { id: 'scene5', pos: [0.03, 0.95], text: "We focus on outcomes, not promises. These are the numbers behind what we have shipped." },
    { id: 'scene-eco', pos: [0.97, 0.30], text: "These platforms are already live, including an AI interview platform, a voice agent, an AI tutor and a campus system." },
    { id: 'scene-why', pos: [0.03, 0.45], text: "We are a team that has shipped before, with delivery hubs in Dubai, Bengaluru and Singapore." },
    { id: 'scene6', pos: [0.97, 0.80], text: "That is the tour! Tell us the problem you want solved. We reply within 5 business days, and the scoping call is free." }
  ];
  var HOME = [1, 1];

  var SS = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
             set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} } };

  var state = { muted: SS.get('fu-muted') === '1', voiceUnlocked: false, step: -1, running: false, paused: false,
                token: 0, timer: null, userScrolled: false, dismissed: false, speaking: false, kick: 0,
                px: 1, py: 1, lean: 0, moveUntil: 0 };

  /* ---------- DOM ---------- */
  var root = document.createElement('div');
  root.className = 'fu';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Fu, your FutureAcad guide');
  root.innerHTML =
    '<div class="fu__bubble" id="fuBubble" role="status" aria-live="polite" hidden>' +
      '<button class="fu__x" type="button" data-a="exit" aria-label="Close Fu">&times;</button>' +
      '<p class="fu__text" id="fuText"></p>' +
      '<div class="fu__row" id="fuActions"></div>' +
      '<div class="fu__ctrl" id="fuCtrl">' +
        '<button type="button" data-a="mute" id="fuMute" aria-label="Mute voice" title="Mute / Unmute">Mute</button>' +
        '<button type="button" data-a="replay" aria-label="Replay narration" title="Replay">Replay</button>' +
        '<button type="button" data-a="pause" id="fuPause" aria-label="Pause tour" title="Pause / Resume">Pause</button>' +
      '</div>' +
    '</div>' +
    '<button class="fu__bot" type="button" id="fuBot" aria-label="Open Fu, your guide"></button>';
  document.body.appendChild(root);

  var bubble = root.querySelector('#fuBubble'), textEl = root.querySelector('#fuText'),
      actions = root.querySelector('#fuActions'), muteBtn = root.querySelector('#fuMute'),
      pauseBtn = root.querySelector('#fuPause'), bot = root.querySelector('#fuBot');
  if (!synth) muteBtn.hidden = true;
  muteBtn.textContent = state.muted ? 'Unmute' : 'Mute';

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

  /* ---------- 3D robot (Orange Robot model: rounded TV head, black screen face, glowing eyes, curved antenna, orange gauntlets & boots) ---------- */
  function build3D() {
    if (!window.THREE) return false;
    var T = THREE, W = 250, H = 300, cv = document.createElement('canvas');
    var renderer;
    try { renderer = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: true }); } catch (e) { return false; }
    if (!renderer.getContext()) return false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(W, H, false);
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    cv.className = 'fu__cv'; cv.setAttribute('aria-hidden', 'true'); bot.appendChild(cv);
    var scene = new T.Scene(), cam = new T.PerspectiveCamera(30, W / H, 0.1, 50);
    cam.position.set(0, 0.45, 7.2); cam.lookAt(0, 0.42, 0);

    // Warm, studio-like lighting matching the character render
    scene.add(new T.HemisphereLight(0xfff8f0, 0x6e523e, 1.1));
    var key = new T.DirectionalLight(0xfff2e5, 1.5); key.position.set(3, 4.2, 5); scene.add(key);
    var fill = new T.DirectionalLight(0xffecd6, 0.65); fill.position.set(-3.2, 1.2, 3); scene.add(fill);
    var rim = new T.PointLight(0xff8811, 1.1, 12); rim.position.set(0, 2.2, -2.5); scene.add(rim);

    function phys(c, o) { return new T.MeshPhysicalMaterial(Object.assign({ color: c, roughness: 0.35, metalness: 0.04, clearcoat: 0.25, clearcoatRoughness: 0.2 }, o || {})); }
    function basic(c, o) { return new T.MeshBasicMaterial(Object.assign({ color: c }, o || {})); }
    function mesh(g, m, x, y, z) { var o = new T.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); return o; }
    function ball(r, m, x, y, z, sx, sy, sz) { var o = mesh(new T.SphereGeometry(r, 40, 30), m, x, y, z); o.scale.set(sx || 1, sy || 1, sz || 1); return o; }
    function glowTex() {
      var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
      var r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c);
    }
    var GT = glowTex();
    function glow(size, x, y, z, op) { var s = new T.Sprite(new T.SpriteMaterial({ map: GT, blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: op })); s.scale.set(size, size, 1); s.position.set(x, y, z); return s; }

    // Color palette based directly on the reference robot
    var orange = phys(0xf97316, { roughness: 0.34, metalness: 0.04, clearcoat: 0.3, clearcoatRoughness: 0.2 }),
        dark = phys(0x1a1c22, { roughness: 0.48, metalness: 0.26 }),
        screenBezel = phys(0x16181d, { roughness: 0.42, metalness: 0.2 }),
        screenGlass = phys(0x0a0c10, { roughness: 0.06, metalness: 0.35, clearcoat: 1 }),
        white = basic(0xffffff);

    function ribs(n, r, h, y, parent) { // dark ribbed segmented joints (neck / waist / limbs)
      for (var i = 0; i < n; i++) {
        var rg = mesh(new T.TorusGeometry(r, h, 8, 28), dark, 0, y - i * h * 2.1, 0);
        rg.rotation.x = Math.PI / 2; parent.add(rg);
      }
    }

    var root3 = new T.Group(); scene.add(root3);

    // Warm floor shadow + subtle amber floor ring
    var shadow = mesh(new T.CircleGeometry(0.92, 40), basic(0x3d281a, { transparent: true, opacity: 0.22, depthWrite: false }), 0, -1.32, 0);
    shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
    var ring = mesh(new T.TorusGeometry(0.8, 0.012, 8, 80), basic(0xf97316, { transparent: true, opacity: 0.65 }), 0, -1.31, 0);
    ring.rotation.x = Math.PI / 2; scene.add(ring);

    // Pelvis & Waist & Torso
    root3.add(ball(0.26, orange, 0, -0.32, 0, 1.1, 0.72, 0.85));
    ribs(3, 0.15, 0.025, -0.08, root3);

    // Rounded trapezoid orange chest
    var chest = ball(0.36, orange, 0, 0.16, 0, 1.12, 0.88, 0.82); root3.add(chest);

    // Chest horizontal dark pill slot & lower groove line from reference image
    var chestSlot = ball(0.12, dark, 0, 0.21, 0.30, 1.45, 0.52, 0.15); root3.add(chestSlot);
    var chestSlotInner = ball(0.10, phys(0x0e1014), 0, 0.21, 0.31, 1.38, 0.48, 0.15); root3.add(chestSlotInner);
    var chestLine = mesh(new T.BoxGeometry(0.24, 0.02, 0.02), dark, 0, 0.10, 0.30); root3.add(chestLine);

    // Corrugated dark neck
    ribs(3, 0.11, 0.024, 0.48, root3);

    // Arms: shoulder ball, corrugated upper arm, elbow, chunky orange forearm gauntlet, dark robot hand
    function arm(s) {
      var g = new T.Group(); g.position.set(s * 0.48, 0.22, 0); root3.add(g);
      g.add(ball(0.085, dark, 0, 0, 0));
      g.add(mesh(new T.CylinderGeometry(0.045, 0.045, 0.14, 14), dark, 0, -0.10, 0));
      g.add(ball(0.065, dark, 0, -0.20, 0));
      // Orange forearm gauntlet
      g.add(ball(0.12, orange, 0, -0.36, 0, 1.05, 1.35, 1.05));
      g.add(mesh(new T.CylinderGeometry(0.05, 0.055, 0.05, 12), dark, 0, -0.52, 0));

      // Hand with dark articulated fingers and orange backplate
      var hand = new T.Group(); hand.position.set(0, -0.58, 0); g.add(hand);
      hand.add(ball(0.06, dark, 0, 0, 0, 1.1, 0.9, 0.8));
      hand.add(ball(0.05, orange, 0, 0.01, 0.03, 1, 0.8, 0.5));
      for (var f = 0; f < 3; f++) {
        var fg = new T.Group(); fg.position.set((f - 1) * 0.042, 0, 0.02); fg.rotation.x = 0.32; hand.add(fg);
        fg.add(mesh(new T.CylinderGeometry(0.017, 0.019, 0.07, 8), dark, 0, -0.035, 0));
        fg.add(ball(0.019, dark, 0, -0.075, 0));
        fg.add(mesh(new T.CylinderGeometry(0.015, 0.017, 0.05, 8), dark, 0, -0.105, 0.01));
      }
      var th = mesh(new T.CylinderGeometry(0.016, 0.018, 0.07, 8), dark, -s * 0.05, -0.02, 0.04);
      th.rotation.z = s * 0.8; hand.add(th);
      return g;
    }
    var armR = arm(1), armL = arm(-1); armL.rotation.z = -0.12;

    // Legs: dark hip joint, corrugated thigh, knee, shin, chunky orange boots with dark soles
    var legs = [];
    [-1, 1].forEach(function (s) {
      var g = new T.Group(); g.position.set(s * 0.18, -0.44, 0); root3.add(g); legs.push(g);
      g.add(ball(0.08, dark, 0, 0, 0));
      g.add(mesh(new T.CylinderGeometry(0.055, 0.055, 0.12, 14), dark, 0, -0.10, 0));
      g.add(ball(0.07, dark, 0, -0.20, 0));
      g.add(mesh(new T.CylinderGeometry(0.05, 0.055, 0.10, 14), dark, 0, -0.28, 0));
      g.add(ball(0.075, dark, 0, -0.38, 0));
      // Chunky orange boot with dark black sole
      g.add(ball(0.16, orange, 0, -0.50, 0.06, 1.05, 0.72, 1.4));
      g.add(ball(0.165, dark, 0, -0.57, 0.06, 1.08, 0.24, 1.45));
    });

    // Head: rounded TV monitor shape, black screen face, glowing oval eyes, curved antenna, ear cups
    var head = new T.Group(); head.position.set(0, 1.08, 0); root3.add(head);

    // Orange rounded monitor head shell
    head.add(ball(0.68, orange, 0, 0, 0, 1.18, 0.98, 0.95));

    // Subtle seam line running down the head
    var seam = mesh(new T.TorusGeometry(0.68, 0.005, 6, 60, Math.PI), dark, 0, 0.0, 0);
    seam.rotation.y = Math.PI / 2; seam.scale.set(0.95, 0.98, 1.18); head.add(seam);

    // Dark screen bezel and glossy curved faceplate
    var bezel = ball(0.53, screenBezel, 0, -0.02, 0.32, 1.20, 0.76, 0.58); head.add(bezel);
    var screen = ball(0.52, screenGlass, 0, -0.02, 0.34, 1.18, 0.73, 0.56); head.add(screen);

    // Screen light reflection
    var shine = mesh(new T.PlaneGeometry(0.48, 0.08), basic(0xffffff, { transparent: true, opacity: 0.12, depthWrite: false }), -0.18, 0.22, 0.68);
    shine.rotation.z = 0.1; head.add(shine);

    // Two small speaker/screw holes on bottom right of screen bezel (from reference image)
    head.add(ball(0.016, dark, 0.40, -0.22, 0.58));
    head.add(ball(0.016, dark, 0.46, -0.22, 0.58));

    // Two vertically oval glowing white eyes
    var eyes = new T.Group(); eyes.position.set(0, 0.02, 0.66); head.add(eyes);
    [-1, 1].forEach(function (s) {
      eyes.add(ball(0.075, white, s * 0.26, 0, 0, 0.75, 1.35, 0.1));
      eyes.add(glow(0.32, s * 0.26, 0, 0.02, 0.55));
    });

    // Subtle mouth line (lights up when speaking)
    var mouth = mesh(new T.TorusGeometry(0.055, 0.01, 8, 20, Math.PI), white, 0, -0.15, 0.66);
    mouth.rotation.z = Math.PI; mouth.visible = false; head.add(mouth);

    // Side headphone/ear cups on left and right
    [-1, 1].forEach(function (s) {
      var ear = mesh(new T.CylinderGeometry(0.24, 0.24, 0.14, 32), dark, s * 0.79, -0.02, 0);
      ear.rotation.z = Math.PI / 2; head.add(ear);
      var earCap = ball(0.23, dark, s * 0.87, -0.02, 0, 0.35, 1, 1);
      head.add(earCap);
    });

    // Top center curved gooseneck antenna with round ball tip (from reference image)
    var antBase = mesh(new T.CylinderGeometry(0.05, 0.07, 0.05, 16), dark, 0, 0.66, 0); head.add(antBase);
    if (T.CatmullRomCurve3 && T.TubeGeometry) {
      var antCurve = new T.CatmullRomCurve3([
        new T.Vector3(0, 0.68, 0),
        new T.Vector3(0, 0.86, 0),
        new T.Vector3(0.07, 0.98, -0.03),
        new T.Vector3(0.05, 1.10, -0.02)
      ]);
      var antTube = mesh(new T.TubeGeometry(antCurve, 16, 0.024, 8, false), dark);
      head.add(antTube);
    } else {
      var antStraight = mesh(new T.CylinderGeometry(0.022, 0.024, 0.44, 12), dark, 0.03, 0.90, -0.01);
      head.add(antStraight);
    }
    head.add(ball(0.055, dark, 0.05, 1.12, -0.02)); // Antenna ball tip

    var mx = 0, my = 0;
    window.addEventListener('pointermove', function (e) {
      mx = (e.clientX / innerWidth - 0.5) * 2;
      my = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });

    var t0 = performance.now(), blinkAt = 2000, last = 0, born = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden || !root.classList.contains('is-in')) { born = 0; return; }
      if (now - last < 24) return; last = now; if (!born) born = now;
      var t = (now - t0) / 1000, moving = now < state.moveUntil, age = (now - born) / 1000;
      var k = Math.min(1, age / 0.9);
      root3.scale.setScalar(k < 1 ? Math.max(0.01, (1 - Math.pow(1 - k, 3)) * (1 + Math.sin(k * Math.PI * 1.5) * 0.14 * (1 - k))) : 1);
      root3.position.y = Math.sin(t * 2) * 0.035 + (moving ? 0.12 : 0);
      chest.scale.y = 0.88 + Math.sin(t * 2) * 0.015; // breathing

      root3.rotation.y += ((reduced ? 0 : mx * 0.38 + (moving ? state.lean * 0.5 : 0)) - root3.rotation.y) * 0.08;
      root3.rotation.z += ((moving ? -state.lean * 0.1 : 0) - root3.rotation.z) * 0.1;
      head.rotation.y += (mx * 0.35 - head.rotation.y) * 0.1;
      head.rotation.x += (my * 0.15 - head.rotation.x) * 0.1;
      head.rotation.z = Math.sin(t * 1.3) * 0.03 + (state.speaking ? Math.sin(t * 5) * 0.04 : 0);

      var waving = root.classList.contains('is-waving');
      var armT = waving ? 2.4 + Math.sin(t * 9) * 0.3 : (state.speaking ? 0.9 + Math.sin(t * 3) * 0.25 : 0.12 + Math.sin(t * 1.4) * 0.03);
      armR.rotation.z += (armT - armR.rotation.z) * 0.14;
      armL.rotation.z = -0.12 - Math.sin(t * 1.4) * 0.03;
      armL.rotation.x = state.speaking ? Math.sin(t * 2.6) * 0.2 : 0;

      legs.forEach(function (l, n) {
        l.rotation.x += ((moving ? (n ? 0.4 : -0.4) * Math.sin(t * 8) : 0) - l.rotation.x) * 0.15;
      });

      state.kick *= 0.82;
      var osc = Math.abs(Math.sin(t * 17));
      mouth.visible = state.speaking;
      if (state.speaking) {
        mouth.scale.set(1, 1 + 1.6 * osc + state.kick, 1);
      }

      if (now > blinkAt) {
        eyes.scale.y = 0.08;
        if (now > blinkAt + 120) {
          eyes.scale.y = 1;
          blinkAt = now + 2200 + Math.random() * 2600;
        }
      }

      ring.scale.setScalar(1 + 0.04 * Math.sin(t * 2.4));
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
    var prefs = [/natural/i, /google uk english female/i, /google us english/i, /aria|jenny|sonia|libby/i, /samantha|karen|serena|moira/i, /female/i];
    for (var i = 0; i < prefs.length; i++) { var m = en.filter(function (v) { return prefs[i].test(v.name); })[0]; if (m) { voice = m; return; } }
    voice = en[0] || null;
  }
  if (synth) { pickVoice(); if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice); }

  function stopVoice() { state.token++; if (synth) { try { synth.cancel(); } catch (e) {} } setSpeaking(false); }

  function say(text, cb) {
    stopVoice(); var my = state.token;
    clearTimeout(state.timer);
    var wait = Math.max(2800, text.length * 62);
    var silent = function () { setSpeaking(false); state.timer = setTimeout(function () { if (my === state.token && cb) cb(); }, wait); };
    if (!synth || state.muted || !state.voiceUnlocked) { if (!state.muted && synth && !state.voiceUnlocked) needEnable(); silent(); return; }
    var u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-US'; }
    u.rate = 1.03; u.pitch = 1.45; u.volume = 1;
    var started = false;
    u.onstart = function () { started = true; if (my === state.token) setSpeaking(true); };
    u.onboundary = function () { state.kick = 1.2; };
    u.onend = function () { setSpeaking(false); if (my === state.token && cb) state.timer = setTimeout(function () { if (my === state.token) cb(); }, 900); };
    u.onerror = function () { setSpeaking(false); if (my === state.token) { state.voiceUnlocked = false; needEnable(); silent(); } };
    try { synth.speak(u); } catch (e) { silent(); return; }
    setTimeout(function () { // autoplay can be blocked silently
      if (my === state.token && !started && !synth.speaking) { state.voiceUnlocked = false; needEnable(); synth.cancel(); silent(); }
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
    var s = STEPS[i], el = document.getElementById(s.id);
    if (el) scrollToEl(el);
    var last = i === STEPS.length - 1;
    show(s.text, last ? [{ a: 'contact', t: 'Submit a problem' }, { a: 'exit', t: 'Finish', alt: true }] :
                       (reduced ? [{ a: 'next', t: 'Next' }] : []));
    place(s.pos[0], s.pos[1], true); wave();
    if (enableShown && !state.voiceUnlocked) needEnable();
    setTimeout(function () {
      say(s.text, function () { if (last) { state.running = false; } else if (!reduced) { runStep(i + 1); } });
    }, 900);
  }

  function welcome() {
    place(HOME[0], HOME[1]);
    root.classList.add('is-in'); wave();
    show(WELCOME, [{ a: 'start', t: 'Start tour' }, { a: 'exit', t: 'No thanks', alt: true }]);
    say(WELCOME, function () {
      if (!state.userScrolled && !state.dismissed && !state.paused) { runStep(0); }
    });
    if (synth && !state.muted) { setTimeout(function () { if (!state.voiceUnlocked) needEnable(); }, 400); }
  }

  function pauseTour(msg) {
    if (!state.running && state.step < 0) return;
    state.paused = true; stopVoice(); clearTimeout(state.timer); pauseBtn.textContent = 'Resume'; pauseBtn.setAttribute('aria-label', 'Resume tour');
    if (msg) show(msg, [{ a: 'resume', t: 'Continue tour' }, { a: 'exit', t: "I'll explore myself", alt: true }]);
  }
  function resumeTour() {
    state.paused = false; pauseBtn.textContent = 'Pause'; pauseBtn.setAttribute('aria-label', 'Pause tour');
    runStep(Math.max(0, state.step));
  }
  function exitTour() {
    state.dismissed = true; state.running = false; stopVoice(); clearTimeout(state.timer);
    bubble.hidden = true; root.classList.add('is-min'); place(HOME[0], HOME[1], true);
  }

  /* ---------- events ---------- */
  function unlock() {
    if (!synth || state.voiceUnlocked) return;
    state.voiceUnlocked = true; var e = document.getElementById('fuEnable'); if (e) e.remove(); enableShown = false;
    try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (x) {}
  }

  root.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-a]'), isBot = ev.target.closest('#fuBot');
    if (isBot) { state.dismissed = false; root.classList.remove('is-min'); state.paused = false; state.userScrolled = true; unlock(); show("Hi, I'm Fu! Want the tour?", [{ a: 'start', t: 'Start tour' }, { a: 'exit', t: 'Not now', alt: true }]); return; }
    if (!t) return;
    unlock();
    var a = t.dataset.a;
    if (a === 'enable') { if (state.step < 0) { say(WELCOME, function () { if (!state.userScrolled && !state.dismissed) runStep(0); }); } else { var cur = STEPS[state.step]; say(cur.text, function () { if (!reduced) runStep(state.step + 1); }); } }
    else if (a === 'start') { state.paused = false; state.dismissed = false; runStep(0); }
    else if (a === 'next') { runStep(Math.min(STEPS.length - 1, state.step + 1)); }
    else if (a === 'resume') { resumeTour(); }
    else if (a === 'pause') { if (state.paused) resumeTour(); else pauseTour(textEl.textContent); }
    else if (a === 'replay') { say(state.step < 0 ? WELCOME : STEPS[state.step].text, null); }
    else if (a === 'mute') { state.muted = !state.muted; SS.set('fu-muted', state.muted ? '1' : '0'); muteBtn.textContent = state.muted ? 'Unmute' : 'Mute'; if (state.muted) stopVoice(); else { state.voiceUnlocked = true; } }
    else if (a === 'contact') { window.location.href = '/build/submit-a-problem'; }
    else if (a === 'exit') { exitTour(); }
  });

  function userTook(ev) {
    if (ev && ev.target && root.contains(ev.target)) return;
    state.userScrolled = true;
    if (state.running && !state.paused && !state.dismissed) pauseTour('Tour paused. Want me to carry on?');
  }
  window.addEventListener('wheel', userTook, { passive: true });
  window.addEventListener('touchstart', userTook, { passive: true });
  window.addEventListener('keydown', function (e) { if (/^(ArrowDown|ArrowUp|PageDown|PageUp|Home|End| )$/.test(e.key)) userTook(e); });
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
