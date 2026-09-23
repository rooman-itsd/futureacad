/* ============================================================
   FutureAcad - Text loop
   Text set along an SVG path and travelled end to end, so the
   sentence reads as one unbroken ribbon.

   Ported from a React component. Faithful to the original
   geometry and to its two-copy scrolling trick; adapted in four
   places for this site:
     - no pause on hover, the band is meant to keep moving
     - parked while off screen, like the story row, so a transform
       is not left running for the whole page
     - viewBox height is a parameter (the original hardcodes 520,
       which makes a full-bleed band ~590px tall at desktop width)
     - configured from data attributes instead of props

   This file is deliberately pure ASCII. The two characters that are not
   (a non-breaking space and the separator star) are built with
   String.fromCharCode, so nothing depends on how the file gets decoded.
   ============================================================ */
(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var VIEW_W = 1200;
  var CX = VIEW_W / 2;
  var EDGE_PAD = 6;

  function buildPath(shape, curviness, ribbonWidth, viewH) {
    var CY = viewH / 2;
    var c = Math.max(0, curviness);
    var room = Math.max(20, CY - Math.max(0, ribbonWidth) / 2 - EDGE_PAD);
    var r, h, rise, a;

    switch (shape) {
      case 'circle':
        r = Math.min(90 + c * 0.95, room);
        return 'M ' + (CX - r) + ' ' + CY + ' A ' + r + ' ' + r + ' 0 1 1 ' + (CX + r) + ' ' + CY +
               ' A ' + r + ' ' + r + ' 0 1 1 ' + (CX - r) + ' ' + CY + ' Z';
      case 'infinity':
        r = 150 + c * 1.4;
        h = Math.min(60 + c * 0.95, room);
        return [
          'M ' + CX + ' ' + CY,
          'C ' + (CX + r * 0.55) + ' ' + (CY - h) + ' ' + (CX + r) + ' ' + (CY - h) + ' ' + (CX + r) + ' ' + CY,
          'C ' + (CX + r) + ' ' + (CY + h) + ' ' + (CX + r * 0.55) + ' ' + (CY + h) + ' ' + CX + ' ' + CY,
          'C ' + (CX - r * 0.55) + ' ' + (CY - h) + ' ' + (CX - r) + ' ' + (CY - h) + ' ' + (CX - r) + ' ' + CY,
          'C ' + (CX - r) + ' ' + (CY + h) + ' ' + (CX - r * 0.55) + ' ' + (CY + h) + ' ' + CX + ' ' + CY,
          'Z'
        ].join(' ');
      case 'arch':
        rise = Math.min(120 + c * 1.1, room * 2);
        return 'M 120 ' + (CY + rise / 2) + ' Q ' + CX + ' ' + (CY - rise * 1.5) + ' ' +
               (VIEW_W - 120) + ' ' + (CY + rise / 2);
      case 'line':
        return 'M -320 ' + CY + ' L ' + (VIEW_W + 320) + ' ' + CY;
      default:
        a = Math.min(c * 2.2, room * 2);
        return 'M -320 ' + CY + ' Q -160 ' + (CY - a) + ' 0 ' + CY +
               ' T 320 ' + CY + ' T 640 ' + CY + ' T 960 ' + CY + ' T 1280 ' + CY +
               ' T ' + (VIEW_W + 320) + ' ' + CY;
    }
  }

  function num(v, fallback) {
    var n = parseFloat(v);
    return isNaN(n) ? fallback : n;
  }

  var seq = 0;

  function init(root) {
    var d = root.dataset;
    var text = d.text || root.textContent.trim() || 'FutureAcad';
    var uppercase = d.uppercase !== 'false';
    // Built from char codes so this source file stays pure ASCII and
    // cannot be broken by a decoding mismatch.
    var NBSP = String.fromCharCode(160);
    var STAR = String.fromCharCode(10022);   // U+2726 four-pointed star
    var separator = d.separator === undefined ? STAR : d.separator;
    var shape = d.shape || 'wave';
    var curviness = num(d.curviness, 90);
    var ribbon = d.ribbon !== 'false';
    var ribbonWidth = num(d.ribbonWidth, 86);
    var speed = num(d.speed, 90);
    var reverse = d.direction === 'reverse';
    var fontSize = num(d.fontSize, 46);
    var fontWeight = d.fontWeight || '800';
    var letterSpacing = num(d.letterSpacing, 2);
    var viewH = num(d.viewHeight, 520);

    var base = uppercase ? String(text).toUpperCase() : String(text);
    var gap = separator ? NBSP + separator + NBSP : NBSP + NBSP + NBSP;
    var unit = base + gap;

    var pathId = 'fa-loop-path-' + (++seq);
    var pathD = d.path || buildPath(shape, curviness, ribbonWidth, viewH);

    root.textContent = '';

    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + VIEW_W + ' ' + viewH);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', base);

    var path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('id', pathId);
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', ribbon ? (d.ribbonColor || '#006078') : 'none');
    path.setAttribute('stroke-width', ribbon ? ribbonWidth : 0);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    function styleText(el) {
      el.style.fontSize = fontSize + 'px';
      el.style.fontWeight = fontWeight;
      el.style.letterSpacing = letterSpacing + 'px';
    }

    // Hidden copy of one repeat, used only to measure how wide a repeat is.
    var measure = document.createElementNS(SVGNS, 'text');
    measure.setAttribute('class', 'fa-loop__measure');
    measure.setAttribute('aria-hidden', 'true');
    measure.textContent = unit;
    styleText(measure);
    svg.appendChild(measure);

    // Two copies of the run, held exactly one path length apart. Whichever
    // one walks off the end, the other is already arriving, so the sentence
    // never shows a join.
    var runs = [];
    for (var i = 0; i < 2; i++) {
      var t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('class', 'fa-loop__text');
      t.setAttribute('fill', d.color || '#ffffff');
      t.setAttribute('dominant-baseline', 'central');
      t.setAttribute('aria-hidden', 'true');
      styleText(t);
      var tp = document.createElementNS(SVGNS, 'textPath');
      tp.setAttribute('href', '#' + pathId);
      tp.setAttribute('startOffset', '0');
      t.appendChild(tp);
      svg.appendChild(t);
      runs.push({ text: t, textPath: tp });
    }
    root.appendChild(svg);

    var tween = null;
    var watched = false;

    function layout() {
      var length, unitWidth;
      try {
        length = path.getTotalLength();
        unitWidth = measure.getComputedTextLength();
      } catch (e) { return; }
      if (!length) return;

      var reps = unitWidth > 0 ? Math.max(1, Math.round(length / unitWidth)) : 1;
      var run = new Array(reps + 1).join(unit);

      runs.forEach(function (r) {
        r.textPath.textContent = run;
        // Stretch the run to exactly one path length. That is what lets the
        // two copies line up: each is precisely as long as the loop it rides.
        r.text.setAttribute('textLength', length);
        r.text.setAttribute('lengthAdjust', 'spacing');
      });

      function apply(offset) {
        var partner = offset >= 0 ? offset - length : offset + length;
        runs[0].textPath.setAttribute('startOffset', String(offset));
        runs[1].textPath.setAttribute('startOffset', String(partner));
      }
      apply(0);

      if (tween) { tween.kill(); tween = null; }

      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || speed <= 0 || typeof gsap === 'undefined') return;

      var state = { offset: 0 };
      tween = gsap.to(state, {
        offset: reverse ? -length : length,
        duration: length / speed,
        ease: 'none',
        repeat: -1,
        onUpdate: function () { apply(state.offset); }
      });

      // Park it while off screen. Same reasoning as the story row: a
      // transform running for the whole page costs frames, and nobody can
      // see this one while it is out of view. Observed once, not per layout.
      if (!watched && 'IntersectionObserver' in window) {
        watched = true;
        new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!tween) return;
            if (e.isIntersecting) tween.resume(); else tween.pause();
          });
        }, { rootMargin: '250px 0px' }).observe(root);
      }
    }

    layout();
    // Web fonts change how wide a repeat is, so measure again once they land.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(layout).catch(function () {});
    }
  }

  function start() {
    var nodes = document.querySelectorAll('[data-text-loop]');
    for (var i = 0; i < nodes.length; i++) init(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
