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

  function revealAll() {
    document.querySelectorAll('.reveal-up').forEach((el) => el.classList.add('is-in'));
    const initial = document.querySelector('.scene--1 .title-xl:not(.title-morph)');
    if (initial) initial.style.display = 'none';
    const morph = document.querySelector('.title-morph');
    if (morph) morph.style.opacity = 1;
    buildSkyline();
  }

  /* ---- Background videos: play only while in view ----
     Saves battery/data on mobile and keeps the rest of the page light. ---- */
  (function () {
    ['finaleVideo', 'mindVideo'].forEach((id) => {
      const v = document.getElementById(id);
      if (!v) return;
      v.playsInline = true; v.muted = true;
      if (id === 'finaleVideo' && prefersReduced) { try { v.pause(); } catch (e) {} return; }
      if (!('IntersectionObserver' in window)) { v.play().catch(() => {}); return; }
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { v.play().catch(() => {}); }
          else { try { v.pause(); } catch (e) {} }
        });
      }, { threshold: 0.05 });
      io.observe(v);
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

    gsap.to('#progress span', { width: '100%', ease: 'none',
      scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.3 } });

    buildSkyline();
    ScrollTrigger.refresh();
    window.addEventListener('load', () => ScrollTrigger.refresh());
  });
})();
