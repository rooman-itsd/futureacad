/* ============================================================
   FutureAcad — Home cinematic timeline (home page only)
   Preloader · intro morph · scene camera beats · counters
   Depends on world.js (window.__faWorld) + site.js (window.__faLenis)
   ============================================================ */
(function () {
  'use strict';
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const world = (window.__faWorld && window.__faWorld.state) || {};

  // No-GSAP / reduced-motion fallback: show everything in its resting state.
  function revealAll() {
    document.querySelectorAll('.reveal-up').forEach((el) => el.classList.add('is-in'));
    document.querySelectorAll('[data-bento],[data-step]').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    const jl = document.querySelector('.fa-journey__line');
    if (jl) jl.classList.add('is-drawn');
    // The counters start at a literal 0 in the markup and are filled by the
    // scroll timeline. Without this the stats read "0" for anyone on reduced
    // motion or without GSAP — worse than showing no number at all.
    document.querySelectorAll('[data-count]').forEach((el) => {
      const decimals = (el.dataset.count.split('.')[1] || '').length;
      el.textContent = parseFloat(el.dataset.count).toFixed(decimals) + (el.dataset.suffix || '');
    });
    const initial = document.querySelector('.scene--1 .title-xl:not(.title-morph)');
    if (initial) initial.style.display = 'none';
    const morph = document.querySelector('.title-morph');
    if (morph) morph.style.opacity = 1;
  }

  /* ---- Background videos: fetch and decode only around the viewport ----
     The clips total ~14MB. With preload="none" in the markup none of that
     is on the critical path; each one starts buffering a screen ahead of
     itself and only decodes frames while it is actually visible. ---- */
  (function () {
    const vids = Array.prototype.slice.call(document.querySelectorAll('video[data-bg]'));
    if (!vids.length) return;
    vids.forEach((v) => { v.playsInline = true; v.muted = true; });

    // Every one of these is decorative and loops forever, which is exactly the
    // moving content WCAG 2.2.2 asks us to stop. Under reduced motion we leave
    // them on their poster frame and never fetch the clip at all.
    if (prefersReduced) {
      vids.forEach((v) => { try { v.pause(); } catch (e) {} });
      return;
    }

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
      // No hold. "It's already being built." now takes over the moment the
      // first two lines have finished rising, instead of sitting on screen
      // for two seconds first.
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

    /* ---- Post-hero reveals ----
       The section media and copy ride the shared .reveal-up trigger in
       site.js; the card grids get a short stagger so a bento row resolves
       as one gesture instead of six separate ones. Playback and loading
       stay with the viewport observer above — these are visual only. */
    const stagger = (sel, trigger, step) => {
      const items = gsap.utils.toArray(sel);
      if (!items.length) return;
      gsap.from(items, {
        y: 34, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: step,
        scrollTrigger: { trigger: trigger || items[0], start: 'top 85%', once: true },
      });
    };
    document.querySelectorAll('.fa-bento, .fa-results, .fa-eco, .fa-why__grid').forEach((grid) => {
      stagger(grid.querySelectorAll('[data-bento]'), grid, 0.07);
    });
    stagger('[data-step]', '.fa-journey__track', 0.09);

    // Draw the journey connector once, as the track arrives.
    const jline = document.querySelector('.fa-journey__line');
    if (jline) {
      ScrollTrigger.create({ trigger: '.fa-journey', start: 'top 80%', once: true,
        onEnter: () => jline.classList.add('is-drawn') });
    }

    gsap.utils.toArray('[data-count]').forEach((el) => {
      const target = parseFloat(el.dataset.count), suffix = el.dataset.suffix || '';
      const decimals = (el.dataset.count.split('.')[1] || '').length;
      const obj = { v: 0 };
      ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true,
        onEnter: () => gsap.to(obj, { v: target, duration: 2, ease: 'power2.out',
          onUpdate: () => { el.textContent = obj.v.toFixed(decimals) + suffix; } }) });
    });

    // scaleX rather than width: this runs on every scroll tick, and width
    // forces a layout pass where a transform is composite-only.
    gsap.to('#progress span', { scaleX: 1, ease: 'none',
      scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.3 } });
    ScrollTrigger.refresh();
    window.addEventListener('load', () => ScrollTrigger.refresh());
  });

  /* ---- Journey: colour travels the path on click ----
     Lives outside the GSAP block on purpose — the sweep is a CSS transition,
     so it still works with reduced motion (instant) and without GSAP. ---- */
  (function () {
    const journey = document.querySelector('.fa-journey');
    const fill = journey && journey.querySelector('.fa-journey__fill');
    if (!journey || !fill) return;

    // getTotalLength() returns USER units (the 0-100 viewBox), but the stroke
    // uses vector-effect:non-scaling-stroke, so its dash pattern is in screen
    // pixels. Those disagree badly under preserveAspectRatio="none", so the
    // on-screen length is derived from the points and the rendered box.
    const PTS = [[10, 76.7], [30, 23.3], [50, 76.7], [70, 23.3], [90, 76.7]];
    const measure = () => {
      const r = fill.getBoundingClientRect();
      const svg = fill.ownerSVGElement.getBoundingClientRect();
      if (!svg.width || !svg.height) return;
      let len = 0;
      for (let i = 1; i < PTS.length; i++) {
        const dx = (PTS[i][0] - PTS[i - 1][0]) * svg.width / 100;
        const dy = (PTS[i][1] - PTS[i - 1][1]) * svg.height / 100;
        len += Math.hypot(dx, dy);
      }
      journey.style.setProperty('--len', Math.ceil(len) + 'px');
      void r;
    };
    measure();
    addEventListener('resize', measure, { passive: true });

    let running = false;
    function travel() {
      if (running) return;
      running = true;
      journey.classList.remove('is-travelled');
      void journey.offsetWidth;              // restart the transition
      journey.classList.add('is-travelled');
      setTimeout(() => { running = false; }, 2300);
    }
    journey.addEventListener('click', travel);
    journey.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); travel(); }
    });
  })();

})();
