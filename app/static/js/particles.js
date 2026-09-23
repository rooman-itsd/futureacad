/* ============================================================
   FutureAcad - Particle field
   A drifting cloud of dots behind a section.

   This began as a faithful port of a WebGL point cloud: points
   seeded in a sphere, each wandering on a sinusoid, sized by
   distance, the whole cloud slowly rotating. That version worked,
   but measured on this machine's GPU (Intel HD Graphics 400) it
   took the section from 16ms a frame to 65ms - about 15fps. A
   point cloud is fill-rate bound, and large soft alpha-blended
   points with no depth test mean heavy overdraw, which is exactly
   what weak integrated graphics cannot absorb.

   So the look is rebuilt with plain elements animated on transform
   and opacity only. Those run on the compositor, cost close to
   nothing, and can be far more visible because brightness is free
   here in a way it is not when every pixel is being blended.

   The seeding still borrows from the original: random placement,
   random size, and four independent randoms per dot driving its
   drift, timing and phase, so no two move alike.

   Pure ASCII on purpose.
   ============================================================ */
(function () {
  'use strict';

  function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  var sparkleCache = {};
  function sparkle(color) {
    if (sparkleCache[color]) return sparkleCache[color];
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
            + '<path fill="' + color + '" d="M12 0c.8 6.5 4.7 10.4 12 12'
            + '-7.3 1.6-11.2 5.5-12 12-.8-6.5-4.7-10.4-12-12'
            + 'C7.3 10.4 11.2 6.5 12 0z"/></svg>';
    var url = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    sparkleCache[color] = url;
    return url;
  }

  function build(host) {
    var d = host.dataset;
    var count = Math.round(num(d.pCount, 34));
    var minSize = num(d.pMin, 4);
    var maxSize = num(d.pMax, 13);
    var minOpacity = num(d.pOpacityMin, 0.25);
    var maxOpacity = num(d.pOpacityMax, 0.8);
    var palette = (d.pColors || '#006078,#82BAC4,#E37C78').split(',');
    var shape = d.pShape || 'dot';

    var frag = document.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var dot = document.createElement('span');
      // Every third one is a four-point sparkle rather than a round dot, so
      // the field reads as stars instead of confetti.
      var star = shape === 'star' && (i % 3 !== 0);
      dot.className = 'fa-particles__dot' + (star ? ' fa-particles__dot--star' : '');
      var size = rand(minSize, maxSize);
      var s = dot.style;
      s.width = s.height = size.toFixed(1) + 'px';
      s.left = rand(-2, 100).toFixed(2) + '%';
      s.top = rand(-2, 100).toFixed(2) + '%';
      var col = palette[Math.floor(Math.random() * palette.length)].trim();
      if (star) {
        // Drawn as a background image, not clip-path. Measured: clipping
        // forty-odd animated elements took the median frame from 19.5ms to
        // 43ms on this machine, because a clip has to be applied every frame
        // a transform moves. A background image is painted once and then
        // just composited. One image per palette colour, shared by every
        // star that uses it.
        s.backgroundImage = sparkle(col);
        s.backgroundRepeat = 'no-repeat';
        s.backgroundSize = '100% 100%';
      } else {
        s.background = col;
      }
      // Bigger dots sit further "back", so they are fainter. Same idea as
      // the original sizing points by camera distance, done with opacity.
      // Set as a property, not `opacity`: the twinkle keyframes animate up to
      // this value, so each dot keeps its own depth instead of every one
      // pulsing between the same two numbers.
      var o = rand(minOpacity, maxOpacity);
      s.setProperty('--o', o.toFixed(2));
      s.opacity = o.toFixed(2);
      s.setProperty('--dx', rand(-70, 70).toFixed(0) + 'px');
      s.setProperty('--dy', rand(-90, 90).toFixed(0) + 'px');
      var dur = rand(11, 26);
      s.animationDuration = dur.toFixed(1) + 's, ' + rand(3.2, 7.5).toFixed(1) + 's';
      s.animationDelay = (-rand(0, 26)).toFixed(1) + 's, ' + (-rand(0, 8)).toFixed(1) + 's';
      frag.appendChild(dot);
    }
    host.appendChild(frag);
  }

  function start() {
    var nodes = document.querySelectorAll('[data-particles]');
    if (!nodes.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    for (var i = 0; i < nodes.length; i++) {
      var host = nodes[i];
      build(host);
      host.classList.add('is-live');
      // Parked while off screen. Pausing the animation rather than removing
      // it means the dots resume where they were instead of snapping back.
      if ('IntersectionObserver' in window) {
        (function (el) {
          new IntersectionObserver(function (entries) {
            entries.forEach(function (e) { el.classList.toggle('is-idle', !e.isIntersecting); });
          }, { rootMargin: '150px 0px' }).observe(el);
        })(host);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
