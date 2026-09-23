/* ============================================================
   FutureAcad - Border glow
   A cone of light rides the edge of a card, aimed at the pointer
   and brightening as the pointer nears the rim.

   Ported from a React component. The two pieces of maths are kept
   exactly: the angle from the card's centre to the pointer, and
   the edge proximity - the ratio of how far out the pointer is
   toward whichever edge it would reach first.

   Three changes for this site:
     - one delegated listener for every card, rAF throttled, rather
       than a pointermove handler bound per card
     - the glow is brand light on a light surface, not the demo's
       purple and pink on near-black
     - nothing runs under prefers-reduced-motion

   Pure ASCII on purpose.
   ============================================================ */
(function () {
  'use strict';

  var SEL = '[data-glow]';

  function edgeProximity(rect, x, y) {
    var cx = rect.width / 2, cy = rect.height / 2;
    var dx = x - cx, dy = y - cy;
    var kx = Infinity, ky = Infinity;
    if (dx !== 0) kx = cx / Math.abs(dx);
    if (dy !== 0) ky = cy / Math.abs(dy);
    var k = Math.min(kx, ky);
    var p = 1 / k;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  function cursorAngle(rect, x, y) {
    var dx = x - rect.width / 2, dy = y - rect.height / 2;
    if (dx === 0 && dy === 0) return 0;
    var deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (deg < 0) deg += 360;
    return deg;
  }

  function start() {
    if (!document.querySelector(SEL)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // A pointer-tracked glow is meaningless without a pointer.
    if (window.matchMedia('(hover: none)').matches) return;

    var pending = null, queued = false;

    function flush() {
      queued = false;
      if (!pending) return;
      var card = pending.card, rect = pending.rect, x = pending.x, y = pending.y;
      card.style.setProperty('--edge-proximity', (edgeProximity(rect, x, y) * 100).toFixed(2));
      card.style.setProperty('--cursor-angle', cursorAngle(rect, x, y).toFixed(2) + 'deg');
      pending = null;
    }

    document.addEventListener('pointermove', function (e) {
      var card = e.target.closest ? e.target.closest(SEL) : null;
      if (!card) return;
      var rect = card.getBoundingClientRect();
      pending = { card: card, rect: rect, x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (queued) return;
      queued = true;
      requestAnimationFrame(flush);
    }, { passive: true });

    document.addEventListener('pointerout', function (e) {
      var card = e.target.closest ? e.target.closest(SEL) : null;
      if (!card || (e.relatedTarget && card.contains(e.relatedTarget))) return;
      card.style.setProperty('--edge-proximity', '0');
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
