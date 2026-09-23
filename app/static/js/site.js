/* ============================================================
   FutureAcad — Site-wide interactions (every page)
   Cursor · magnetic · tilt · Lenis smooth scroll · nav · reveals
   ============================================================ */
(function () {
  'use strict';
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Single source of truth: the <head> script tags html.is-touch using
  // several signals (some webviews mis-report hover/pointer media queries).
  const isTouch = document.documentElement.classList.contains('is-touch')
    || window.matchMedia('(hover: none)').matches;

  /* ---- Magnetic buttons + 3D tilt (native cursor) ----
     Both effects need the element's box, and mousemove fires far more often
     than the screen refreshes. Measuring inside the event forces a synchronous
     layout mid-scroll; instead each element records its latest pointer
     position and does one measure + one write per frame. ---- */
  function onPointerFrame(el, apply) {
    let ev = null, queued = false;
    el.addEventListener('mousemove', (e) => {
      ev = e;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (ev) apply(el.getBoundingClientRect(), ev);
      });
    });
    el.addEventListener('mouseleave', () => { ev = null; });
  }

  if (!isTouch) {
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      const strength = 0.4;
      onPointerFrame(el, (r, e) => {
        el.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * strength}px,${(e.clientY - (r.top + r.height / 2)) * strength}px)`;
        el.style.transition = 'transform .1s linear';
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; el.style.transition = 'transform .5s cubic-bezier(.22,1,.36,1)'; });
    });
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      onPointerFrame(el, (r, e) => {
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.transform = `perspective(800px) rotateY(${(px - .5) * 12}deg) rotateX(${(.5 - py) * 12}deg) translateZ(8px)`;
        el.style.setProperty('--mx', px * 100 + '%');
        el.style.setProperty('--my', py * 100 + '%');
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* ---- Mobile nav toggle ---- */
  const burger = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (burger && links) {
    burger.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      document.body.classList.remove('nav-open');
      burger.setAttribute('aria-expanded', 'false');
    }));
  }

  /* ---- Lenis smooth scroll (desktop only) ----
     On touch devices we leave native scrolling alone — Lenis' RAF-driven
     scroll fights iOS/Android momentum scrolling and makes the page feel
     stuck. ScrollTrigger works off native scroll there. */
  let lenis = null;
  if (!prefersReduced && !isTouch && window.Lenis) {
    // lerp wins over duration in Lenis 1.x, so duration was dead config.
    // 0.085 was floaty enough that any dropped frame read as "stuck"; this
    // settles faster and feels planted. Higher = snappier, lower = smoother.
    try { lenis = new Lenis({ smoothWheel: true, lerp: 0.11 }); }
    catch (e) { lenis = null; }
  }
  window.__faLenis = lenis;

  /* ---- GSAP-powered reveals + nav, with graceful fallbacks ---- */
  // Every reveal variant resolves to the same resting state.
  const REVEALS = [
    ['.reveal-up',    { y: 50, opacity: 0 }],
    ['.reveal-left',  { x: -46, opacity: 0 }],
    ['.reveal-right', { x: 46, opacity: 0 }],
    ['.reveal-in',    { scale: 0.96, opacity: 0 }],
  ];
  function revealAllStatic() {
    document.querySelectorAll('.reveal-up,.reveal-left,.reveal-right,.reveal-in')
      .forEach((el) => el.classList.add('is-in'));
  }

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    revealAllStatic();
  } else {
    gsap.registerPlugin(ScrollTrigger);

    if (lenis) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }

    if (prefersReduced) {
      revealAllStatic();
    } else {
      // Transform + opacity only, one-shot, and BATCHED: one trigger per group
      // instead of one per element. Measured — giving every element its own
      // trigger meant ~20 tweens starting in the same frame during a fast
      // scroll, which showed up as dropped frames. Batching also reads better,
      // since a row resolves as one gesture instead of separate pops.
      //
      // No clearProps and no class flip here either: GSAP's inline transform
      // already beats the CSS initial state, and toggling a class that also
      // sets transform made the two fight and forced a recalc mid-tween.
      REVEALS.forEach(([sel, from]) => {
        const els = gsap.utils.toArray(sel);
        if (!els.length) return;
        gsap.set(els, from);
        ScrollTrigger.batch(els, {
          start: 'top 86%',
          once: true,
          onEnter: (batch) => gsap.to(batch, {
            x: 0, y: 0, scale: 1, opacity: 1,
            duration: 0.9, ease: 'power3.out', stagger: 0.08, overwrite: true,
          }),
        });
      });
    }

    // Smooth same-page anchor navigation (Lenis-aware).
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (!id || id === '#') return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(target, { offset: -10, duration: 1.4 });
        else target.scrollIntoView({ behavior: 'smooth' });
      });
    });

    window.addEventListener('load', () => ScrollTrigger.refresh());
  }

  /* ---- Nav: shrink on scroll, and take a surface past the hero ----
     Two separate thresholds. The bar shrinks almost immediately, but it only
     gains a background once the dark hero has gone by, because that is the
     point where the page behind it turns light and light nav text would
     otherwise be sitting on nothing. */
  const nav = document.getElementById('nav');
  if (nav) {
    const hero = document.querySelector('.scene--1, .page');
    let solidAt = 120;
    const measure = () => {
      solidAt = hero
        ? Math.max(60, hero.getBoundingClientRect().height - nav.offsetHeight - 8)
        : 120;
    };
    const onScroll = () => {
      const y = window.scrollY;
      nav.classList.toggle('nav--scrolled', y > 40);
      nav.classList.toggle('nav--solid', y > solidAt);
    };
    measure();
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => { measure(); onScroll(); }, { passive: true });
    addEventListener('load', () => { measure(); onScroll(); });
  }
})();
