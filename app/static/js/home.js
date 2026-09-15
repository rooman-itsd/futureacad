/* ============================================================
   FutureAcad — Home cinematic timeline (home page only)
   Preloader · intro morph · scene camera beats · counters
   Depends on world.js (window.__faWorld) + site.js (window.__faLenis)
   ============================================================ */
(function () {
  'use strict';
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const world = (window.__faWorld && window.__faWorld.state) || {};

  /* ---- Dubai skyline (procedural canvas, finale) ---- */
  function buildSkyline() {
    const host = document.getElementById('skyline');
    if (!host || host.dataset.built) return;
    host.dataset.built = '1';
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    host.appendChild(c);
    function draw() {
      const w = c.width = host.offsetWidth, h = c.height = host.offsetHeight;
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const ground = h;
      const layers = [
        { col: 'rgba(20,30,60,.5)', n: 26, max: .42, jit: .9 },
        { col: 'rgba(14,22,46,.75)', n: 18, max: .62, jit: .7 },
        { col: 'rgba(6,10,22,.95)', n: 12, max: .9, jit: .5 },
      ];
      layers.forEach((L, li) => {
        ctx.fillStyle = L.col;
        const bw = w / L.n;
        for (let i = 0; i < L.n; i++) {
          const seed = Math.sin(i * 12.9 + li * 4.7) * 0.5 + 0.5;
          let bh = h * (0.12 + seed * L.max);
          const x = i * bw;
          const center = li === 2 && Math.abs(i - L.n / 2) < 1;
          if (center) {
            bh = h * 1.7;
            ctx.beginPath();
            ctx.moveTo(x + bw * .5, ground - bh);
            ctx.lineTo(x + bw * .12, ground);
            ctx.lineTo(x + bw * .88, ground);
            ctx.closePath(); ctx.fill();
          } else {
            ctx.fillRect(x, ground - bh, bw * (0.6 + seed * 0.3 * L.jit), bh);
          }
          if (li === 2 && seed > 0.4) {
            ctx.fillStyle = 'rgba(106,168,255,.35)';
            for (let wy = 0; wy < bh; wy += 14) {
              if (Math.sin(i * 3 + wy) > 0.6) ctx.fillRect(x + bw * .2, ground - bh + wy, 3, 3);
            }
            ctx.fillStyle = L.col;
          }
        }
      });
    }
    draw();
    addEventListener('resize', draw);
  }

  /* ---- Dynamic data bars (Scene Capabilities background) ---- */
  function buildDynamicCapsBars() {
    const host = document.getElementById('scene-caps');
    if (!host || host.dataset.barsBuilt) return;
    host.dataset.barsBuilt = '1';

    const staticBg = host.querySelector('.bg--enterprise');
    if (staticBg) staticBg.style.display = 'none';

    const c = document.createElement('canvas');
    c.className = 'caps-bars-canvas';
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;' +
      'opacity:0.28;-webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 18%,#000 82%,transparent 100%);' +
      'mask-image:linear-gradient(180deg,transparent 0%,#000 18%,#000 82%,transparent 100%);';
    host.insertBefore(c, host.firstChild);

    const ctx = c.getContext('2d');
    let w = 0, h = 0;
    let animId = null;
    let isVisible = false;

    const numBars = 22;
    const barData = [];
    for (let i = 0; i < numBars; i++) {
      const seed = Math.abs(Math.sin(i * 12.9898 + 78.233) * 43758.5453 % 1);
      barData.push({
        baseRatio: 0.3 + seed * 0.46,
        speed: 0.001 + (i % 5) * 0.00035,
        phase: i * 0.65,
        amp: 0.07 + (i % 3) * 0.035,
        pulseOffset: (i * 23) % 100,
        pulseSpeed: 0.07 + (i % 4) * 0.03
      });
    }

    function resize() {
      w = c.width = host.offsetWidth;
      h = c.height = host.offsetHeight;
      if (!animId && !prefersReduced && isVisible) {
        animId = requestAnimationFrame(render);
      } else {
        draw(performance.now());
      }
    }

    function draw(time) {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const ground = h;
      const colW = w / numBars;
      const barW = Math.max(colW * 0.78, 12);

      for (let i = 0; i < numBars; i++) {
        const d = barData[i];
        const osc = prefersReduced ? 0 : Math.sin(time * d.speed + d.phase) * d.amp;
        const currentRatio = Math.max(0.15, Math.min(0.88, d.baseRatio + osc));
        const barH = h * currentRatio;
        const x = i * colW + (colW - barW) * 0.5;
        const y = ground - barH;

        const grad = ctx.createLinearGradient(0, y, 0, ground);
        grad.addColorStop(0, 'rgba(160, 185, 255, 0.18)');
        grad.addColorStop(0.5, 'rgba(106, 168, 255, 0.07)');
        grad.addColorStop(1, 'rgba(10, 15, 30, 0.02)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barW, barH);

        ctx.fillStyle = 'rgba(106, 168, 255, 0.55)';
        ctx.fillRect(x, y, barW, 2);

        ctx.fillStyle = 'rgba(160, 195, 255, 0.32)';
        const dotSpacing = 16;
        for (let dy = y + 12; dy < ground - 10; dy += dotSpacing) {
          const dotSeed = Math.sin(i * 3.7 + dy * 0.28) * 0.5 + 0.5;
          if (dotSeed > 0.45) {
            ctx.fillRect(x + barW * 0.24, dy, 2.5, 2.5);
          }
          if (dotSeed > 0.65) {
            ctx.fillRect(x + barW * 0.58, dy, 2.5, 2.5);
          }
        }

        if (!prefersReduced) {
          const pulseY = ground - ((time * d.pulseSpeed + d.pulseOffset * 8) % barH);
          if (pulseY > y && pulseY < ground) {
            ctx.fillStyle = 'rgba(106, 168, 255, 0.75)';
            ctx.fillRect(x, pulseY, barW, 2);
          }
        }
      }
    }

    // Ambient drift at 60fps buys nothing visible and competes with scrolling
    // for the main thread, so redraw at ~30fps.
    const FRAME_MS = 1000 / 30;
    let lastDraw = 0;
    function render(time) {
      if (!isVisible) {
        animId = null;
        return;
      }
      if (time - lastDraw >= FRAME_MS) {
        lastDraw = time;
        draw(time);
      }
      animId = requestAnimationFrame(render);
    }

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          isVisible = e.isIntersecting;
          if (isVisible) {
            if (!animId && !prefersReduced) {
              animId = requestAnimationFrame(render);
            }
          } else {
            if (animId) {
              cancelAnimationFrame(animId);
              animId = null;
            }
          }
        });
      }, { rootMargin: '100px 0px' });
      io.observe(host);
    } else {
      isVisible = true;
      if (!prefersReduced) animId = requestAnimationFrame(render);
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });
  }

  function revealAll() {
    document.querySelectorAll('.reveal-up').forEach((el) => el.classList.add('is-in'));
    const s2Title = document.querySelector('.scene2__title');
    if (s2Title) {
      s2Title.style.opacity = '1';
      s2Title.style.transform = 'none';
      s2Title.style.filter = 'none';
    }
    document.querySelectorAll('.scene2__title .line').forEach((el) => {
      el.style.transform = 'none';
    });
    // Only reveal them — the viewport observer owns loading and playback, so
    // calling play() here would pull every clip down at once.
    ['#mindVideo', '#buildingVideo', '#talentVideo'].forEach((sel) => {
      const v = document.querySelector(sel);
      if (v) v.style.opacity = '1';
    });
    const s3Title = document.querySelector('.scene3__title');
    if (s3Title) {
      s3Title.style.opacity = '1';
      s3Title.style.transform = 'none';
      s3Title.style.filter = 'none';
    }
    document.querySelectorAll('.scene3__title .line').forEach((el) => {
      el.style.transform = 'none';
    });
    const initial = document.querySelector('.scene--1 .title-xl:not(.title-morph)');
    if (initial) initial.style.display = 'none';
    const morph = document.querySelector('.title-morph');
    if (morph) morph.style.opacity = 1;
    buildSkyline();
    buildDynamicCapsBars();
  }

  /* ---- Background videos: fetch and decode only around the viewport ----
     The clips total ~14MB. With preload="none" in the markup none of that
     is on the critical path; each one starts buffering a screen ahead of
     itself and only decodes frames while it is actually visible. ---- */
  (function () {
    const vids = Array.prototype.slice.call(document.querySelectorAll('video[data-bg]'));
    if (!vids.length) return;
    vids.forEach((v) => { v.playsInline = true; v.muted = true; });

    if (!('IntersectionObserver' in window)) {
      vids.forEach((v) => { v.preload = 'auto'; v.play().catch(() => {}); });
      return;
    }

    // Stage 1 — start buffering one viewport before the clip scrolls in.
    const warm = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const v = en.target;
        if (v.preload !== 'auto') { v.preload = 'auto'; v.load(); }
        warm.unobserve(v);
      });
    }, { rootMargin: '100% 0px' });

    // Stage 2 — only run a decoder while the clip is on screen.
    const playPause = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const v = en.target;
        if (en.isIntersecting) { v.play().catch(() => {}); }
        else { try { v.pause(); } catch (e) {} }
      });
    }, { threshold: 0.05 });

    vids.forEach((v) => {
      if (prefersReduced && v.id === 'finaleVideo') { try { v.pause(); } catch (e) {} return; }
      warm.observe(v);
      playPause.observe(v);
    });
  })();

  /* ---- Preloader ---- */
  const pre = document.getElementById('preloader');
  const preBar = document.getElementById('preBar');
  function finishPreloader(cb) {
    if (!pre) { cb(); return; }
    let prog = 0;
    const tick = setInterval(() => {
      prog = Math.min(100, prog + Math.random() * 18);
      if (preBar) preBar.style.width = prog + '%';
      if (prog >= 100) { clearInterval(tick); setTimeout(() => { pre.classList.add('done'); cb(); }, 350); }
    }, 130);
  }

  finishPreloader(function start() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') { revealAll(); return; }
    if (prefersReduced) { revealAll(); return; }

    const lenis = window.__faLenis;

    // -- Scene 1 intro: lines rise, then morph to "being built" --
    gsap.timeline({ delay: 0.2 })
      .from('.scene--1 .kicker', { y: 30, opacity: 0, duration: 1, ease: 'power3.out' })
      .from('.scene--1 .title-xl:not(.title-morph) .line', { yPercent: 110, duration: 1.1, ease: 'power4.out', stagger: 0.12 }, '-=0.5')
      .to({}, { duration: 1.6 })
      .to('.scene--1 .title-xl:not(.title-morph)', { opacity: 0, y: -40, filter: 'blur(8px)', duration: 0.9, ease: 'power2.in' })
      .fromTo('.title-morph', { opacity: 0, y: 40, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'power3.out' }, '-=0.5')
      .from('.title-morph .line', { yPercent: 110, duration: 1, ease: 'power4.out', stagger: 0.1 }, '<')
      .to('.word-built', { textShadow: '0 0 40px rgba(106,168,255,.9)', repeat: 1, yoyo: true, duration: 0.7 }, '-=0.3');

    gsap.to('#scrollHint', { opacity: 0, scrollTrigger: { trigger: '#scene1', start: 'top -5%', scrub: true } });

    // -- World camera flight + colour grade per scene --
    const beat = (trigger, st) => {
      if (!document.querySelector(trigger)) return;
      ScrollTrigger.create({
        trigger, start: 'top 60%', end: 'bottom 40%',
        onEnter: () => gsap.to(world, { ...st, duration: 2, ease: 'power2.inOut' }),
        onEnterBack: () => gsap.to(world, { ...st, duration: 2, ease: 'power2.inOut' }),
      });
    };
    beat('#scene1', { camZ: 60, hue: 0.60, twist: 0, nodeSize: 2.4, lineOpacity: 0.14, camY: 0 });
    beat('#scene2', { camZ: 26, hue: 0.60, twist: 0.4, nodeSize: 3.4, lineOpacity: 0.30, camY: 4 });
    beat('#scene3', { camZ: 40, hue: 0.55, twist: 1.1, nodeSize: 2.0, lineOpacity: 0.42, camY: -6 });
    beat('#scene4', { camZ: 70, hue: 0.58, twist: 1.8, nodeSize: 2.6, lineOpacity: 0.18, camX: 10 });
    beat('#scene5', { camZ: 48, hue: 0.62, twist: 2.4, nodeSize: 2.2, lineOpacity: 0.22, camX: -8 });
    beat('#scene-eco', { camZ: 58, hue: 0.60, twist: 2.7, nodeSize: 2.0, lineOpacity: 0.16, camX: 6, camY: -3 });
    beat('#scene6', { camZ: 90, hue: 0.62, twist: 3.0, nodeSize: 1.6, lineOpacity: 0.08, camX: 0, camY: 8 });

    const mindVid = document.getElementById('mindVideo');
    if (mindVid) {
      gsap.timeline({
        scrollTrigger: {
          trigger: '#scene2',
          start: 'top 90%',
          end: 'bottom 10%',
          scrub: true,
          onEnter: () => mindVid.play().catch(() => {}),
          onEnterBack: () => mindVid.play().catch(() => {}),
          onLeave: () => mindVid.pause(),
          onLeaveBack: () => mindVid.pause(),
        }
      })
      .fromTo(mindVid, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power1.out' })
      .to(mindVid, { opacity: 1, duration: 0.5 })
      .to(mindVid, { opacity: 0, duration: 0.25, ease: 'power1.in' });
    }

    const bldVid = document.getElementById('buildingVideo');
    if (bldVid) {
      bldVid.loop = true;
      gsap.timeline({
        scrollTrigger: {
          trigger: '#scene3',
          start: 'top 85%',
          end: 'bottom 15%',
          scrub: true,
          onEnter: () => bldVid.play().catch(() => {}),
          onEnterBack: () => bldVid.play().catch(() => {}),
          onLeave: () => bldVid.pause(),
          onLeaveBack: () => bldVid.pause(),
        }
      })
      .fromTo(bldVid, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power1.out' })
      .to(bldVid, { opacity: 1, duration: 0.5 })
      .to(bldVid, { opacity: 0, duration: 0.25, ease: 'power1.in' });
    }

    const talentVid = document.getElementById('talentVideo');
    if (talentVid) {
      talentVid.loop = true;
      gsap.timeline({
        scrollTrigger: {
          trigger: '#scene4',
          start: 'top 85%',
          end: 'bottom 15%',
          scrub: true,
          onEnter: () => talentVid.play().catch(() => {}),
          onEnterBack: () => talentVid.play().catch(() => {}),
          onLeave: () => talentVid.pause(),
          onLeaveBack: () => talentVid.pause(),
        }
      })
      .fromTo(talentVid, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power1.out' })
      .to(talentVid, { opacity: 1, duration: 0.5 })
      .to(talentVid, { opacity: 0, duration: 0.25, ease: 'power1.in' });
    }

    if (document.querySelector('.scene--3 .scene3__title')) {
      gsap.timeline({
        scrollTrigger: {
          trigger: '.scene--3 .scene3__copy',
          start: 'top 82%',
          toggleActions: 'play none none none'
        }
      })
      .fromTo('.scene--3 .scene3__title',
        { opacity: 0, y: 35, filter: 'blur(8px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'power3.out' }
      )
      .from('.scene--3 .scene3__title .line',
        { yPercent: 110, duration: 1, ease: 'power4.out', stagger: 0.12 },
        '<'
      )
      .to('.scene--3 .scene3__title .word-glowing',
        { textShadow: '0 0 45px rgba(106,168,255,1)', repeat: 1, yoyo: true, duration: 0.8 },
        '-=0.3'
      );
    }

    if (document.querySelector('.scene--2 .scene2__title')) {
      gsap.timeline({
        scrollTrigger: {
          trigger: '.scene--2 .scene2__copy',
          start: 'top 82%',
          toggleActions: 'play none none none'
        }
      })
      .fromTo('.scene--2 .scene2__title',
        { opacity: 0, y: 40, filter: 'blur(8px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'power3.out' }
      )
      .from('.scene--2 .scene2__title .line',
        { yPercent: 110, duration: 1, ease: 'power4.out', stagger: 0.1 },
        '<'
      )
      .to('.scene--2 .scene2__title .word-built',
        { textShadow: '0 0 40px rgba(106,168,255,.9)', repeat: 1, yoyo: true, duration: 0.7 },
        '-=0.3'
      );
    }

    gsap.from('.holo', { y: 60, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08,
      scrollTrigger: { trigger: '#holoGrid', start: 'top 78%' } });

    if (document.querySelector('#eco')) {
      gsap.from('.eco__row', { y: 30, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.07,
        scrollTrigger: { trigger: '#eco', start: 'top 80%' } });
    }

    gsap.utils.toArray('.metrics__n').forEach((el) => {
      const target = parseFloat(el.dataset.count), suffix = el.dataset.suffix || '';
      const decimals = (el.dataset.count.split('.')[1] || '').length;
      const obj = { v: 0 };
      ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true,
        onEnter: () => gsap.to(obj, { v: target, duration: 2, ease: 'power2.out',
          onUpdate: () => { el.textContent = obj.v.toFixed(decimals) + suffix; } }) });
    });

    gsap.utils.toArray('.portal').forEach((el, i) => {
      ScrollTrigger.create({ trigger: el, start: 'top 80%', onEnter: () => setTimeout(() => el.classList.add('in'), i * 120) });
      gsap.from(el, { y: 70, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 84%' } });
    });

    // scaleX rather than width: this runs on every scroll tick, and width
    // forces a layout pass where a transform is composite-only.
    gsap.to('#progress span', { scaleX: 1, ease: 'none',
      scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.3 } });

    buildSkyline();
    buildDynamicCapsBars();
    ScrollTrigger.refresh();
    window.addEventListener('load', () => ScrollTrigger.refresh());
  });
})();
