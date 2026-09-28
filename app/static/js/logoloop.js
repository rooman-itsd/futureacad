/* ============================================================
   FutureAcad - Logo loop
   A row of partner marks travelling continuously.

   Ported from a React component. The mechanics are kept as they
   were: one sequence is measured, copied until it covers the
   container plus headroom, and the track is offset by a velocity
   that eases toward its target with an exponential smoothing of
   tau 0.25, wrapping on the modulo of one sequence width so the
   row never shows a join.

   Changes for this site:
     - it does not slow or stop under the pointer, matching the
       story row; stopping on hover was asked to be removed there
     - parked while off screen, so no transform runs for the whole
       page length
     - items come from markup rather than props, so the row works
       with text marks today and with image files the moment any
       exist, with no code change

   Pure ASCII on purpose.
   ============================================================ */
(function () {
  'use strict';

  var SMOOTH_TAU = 0.25;
  var MIN_COPIES = 2;
  var COPY_HEADROOM = 2;

  function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }

  function init(root) {
    var track = root.querySelector('.fa-logoloop__track');
    var seq = root.querySelector('.fa-logoloop__list');
    if (!track || !seq) return;

    var speed = num(root.dataset.speed, 70);
    var reverse = root.dataset.direction === 'right';
    var target = Math.abs(speed) * (reverse ? -1 : 1);

    var unit = Array.prototype.slice.call(seq.children).map(function (n) { return n.cloneNode(true); });
    var seqWidth = 0;
    var raf = null, lastT = null, offset = 0, velocity = 0, visible = false;

    function layout() {
      // Rebuild from the pristine sequence so repeated calls never compound.
      seq.replaceChildren.apply(seq, unit.map(function (n) { return n.cloneNode(true); }));
      while (root.children.length > 1 || track.children.length > 1) {
        var extra = track.lastElementChild;
        if (extra === seq) break;
        track.removeChild(extra);
      }
      seqWidth = Math.ceil(seq.getBoundingClientRect().width);
      if (!seqWidth) return;

      var copies = Math.max(MIN_COPIES, Math.ceil(root.clientWidth / seqWidth) + COPY_HEADROOM);
      for (var i = 1; i < copies; i++) {
        var copy = seq.cloneNode(true);
        // Only the first list is real content; the rest are decoration.
        copy.setAttribute('aria-hidden', 'true');
        copy.querySelectorAll('a, button').forEach(function (f) { f.tabIndex = -1; });
        track.appendChild(copy);
      }
    }

    function frame(t) {
      if (!visible) { raf = null; lastT = null; return; }
      raf = requestAnimationFrame(frame);
      if (lastT === null) { lastT = t; return; }
      var dt = Math.max(0, t - lastT) / 1000;
      lastT = t;

      var ease = 1 - Math.exp(-dt / SMOOTH_TAU);
      velocity += (target - velocity) * ease;

      if (seqWidth > 0) {
        offset = (((offset + velocity * dt) % seqWidth) + seqWidth) % seqWidth;
        track.style.transform = 'translate3d(' + (-offset) + 'px, 0, 0)';
      }
    }

    function setVisible(v) {
      if (v === visible) return;
      visible = v;
      if (v && raf === null) { lastT = null; raf = requestAnimationFrame(frame); }
    }

    layout();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { setVisible(e.isIntersecting); });
      }, { rootMargin: '200px 0px' }).observe(root);
    } else {
      setVisible(true);
    }

    var rt = null;
    addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(layout, 180);
    }, { passive: true });

    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () {
        clearTimeout(rt);
        rt = setTimeout(layout, 180);
      });
      ro.observe(root);
    }

    // Images change how wide a sequence is once they land.
    var imgs = seq.querySelectorAll('img');
    if (imgs.length) {
      var left = imgs.length;
      imgs.forEach(function (img) {
        if (img.complete) { if (--left === 0) layout(); return; }
        img.addEventListener('load', function () { if (--left === 0) layout(); }, { once: true });
        img.addEventListener('error', function () { if (--left === 0) layout(); }, { once: true });
      });
    }
  }

  function start() {
    var nodes = document.querySelectorAll('[data-logoloop]');
    if (!nodes.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Static row, still readable, no travel.
      for (var j = 0; j < nodes.length; j++) nodes[j].classList.add('is-static');
      return;
    }
    for (var i = 0; i < nodes.length; i++) init(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
