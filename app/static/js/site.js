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
  function revealAllStatic() {
    document.querySelectorAll('.reveal-up').forEach((el) => el.classList.add('is-in'));
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
      gsap.utils.toArray('.reveal-up').forEach((el) => {
        gsap.fromTo(el, { y: 50, opacity: 0 }, {
          y: 0, opacity: 1, duration: 1, ease: 'power3.out',
          // once: these never play in reverse, so without it every element on
          // the page keeps a live trigger re-checking itself on every scroll.
          scrollTrigger: { trigger: el, start: 'top 86%', once: true }
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

  /* ---- Nav: shrink on scroll ---- */
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('nav--scrolled', window.scrollY > 40);
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
  }
})();
