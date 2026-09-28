/* ============================================================
   FutureAcad - Electric border
   Traces a rounded rectangle and pushes every sample around with
   layered value noise, so the outline crawls like a live wire.

   Ported from a React component. The geometry is unchanged: the
   same perimeter walk, the same corner arcs, the same octaved
   noise displacing each sample on both axes.

   Four changes, all for cost. The original mounts one
   requestAnimationFrame loop per instance; five cards on this page
   would mean five loops competing every frame, and this page has a
   history of scroll stutter. So:
     - one shared loop drives every instance
     - instances off screen are skipped entirely
     - octaves and sample density are tuned down, measured rather
       than guessed (see the numbers in the site notes)
     - nothing runs under prefers-reduced-motion

   Pure ASCII on purpose.
   ============================================================ */
(function () {
  'use strict';

  function random(x) {
    return (Math.sin(x * 12.9898) * 43758.5453) % 1;
  }

  function noise2D(x, y) {
    var i = Math.floor(x), j = Math.floor(y);
    var fx = x - i, fy = y - j;
    var a = random(i + j * 57);
    var b = random(i + 1 + j * 57);
    var c = random(i + (j + 1) * 57);
    var d = random(i + 1 + (j + 1) * 57);
    var ux = fx * fx * (3.0 - 2.0 * fx);
    var uy = fy * fy * (3.0 - 2.0 * fy);
    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
  }

  function octavedNoise(x, octaves, lacunarity, gain, baseAmp, baseFreq, time, seed, flatness) {
    var y = 0, amplitude = baseAmp, frequency = baseFreq;
    for (var i = 0; i < octaves; i++) {
      var oct = amplitude;
      if (i === 0) oct *= flatness;
      y += oct * noise2D(frequency * x + seed * 100, time * frequency * 0.3);
      frequency *= lacunarity;
      amplitude *= gain;
    }
    return y;
  }

  function cornerPoint(cx, cy, r, startAngle, arc, t) {
    var a = startAngle + t * arc;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  // Walks the rounded rectangle once, t in [0,1].
  function rectPoint(t, left, top, w, h, r) {
    var sw = w - 2 * r, sh = h - 2 * r;
    var arc = (Math.PI * r) / 2;
    var total = 2 * sw + 2 * sh + 4 * arc;
    var dist = t * total;
    var acc = 0, p;

    if (dist <= acc + sw) { p = (dist - acc) / sw; return { x: left + r + p * sw, y: top }; }
    acc += sw;
    if (dist <= acc + arc) { p = (dist - acc) / arc; return cornerPoint(left + w - r, top + r, r, -Math.PI / 2, Math.PI / 2, p); }
    acc += arc;
    if (dist <= acc + sh) { p = (dist - acc) / sh; return { x: left + w, y: top + r + p * sh }; }
    acc += sh;
    if (dist <= acc + arc) { p = (dist - acc) / arc; return cornerPoint(left + w - r, top + h - r, r, 0, Math.PI / 2, p); }
    acc += arc;
    if (dist <= acc + sw) { p = (dist - acc) / sw; return { x: left + w - r - p * sw, y: top + h }; }
    acc += sw;
    if (dist <= acc + arc) { p = (dist - acc) / arc; return cornerPoint(left + r, top + h - r, r, Math.PI / 2, Math.PI / 2, p); }
    acc += arc;
    if (dist <= acc + sh) { p = (dist - acc) / sh; return { x: left, y: top + h - r - p * sh }; }
    acc += sh;
    p = (dist - acc) / arc;
    return cornerPoint(left + r, top + r, r, Math.PI, Math.PI / 2, p);
  }

  function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }

  var instances = [];
  var running = false;
  var lastTime = 0;

  function Instance(host) {
    var d = host.dataset;
    this.host = host;
    this.color = d.ebColor || '#006078';
    this.speed = num(d.ebSpeed, 1);
    this.chaos = num(d.ebChaos, 0.12);
    this.radius = num(d.ebRadius, 16);
    this.offset = num(d.ebOffset, 26);   // canvas bleed around the card
    this.octaves = num(d.ebOctaves, 5);
    this.step = num(d.ebStep, 3);        // px between samples
    this.displacement = num(d.ebDisplacement, 22);
    this.time = 0;
    this.visible = false;
    this.active = false;
    this.dirty = false;

    var wrap = document.createElement('span');
    wrap.className = 'eb-canvas-wrap';
    wrap.setAttribute('aria-hidden', 'true');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'eb-canvas';
    wrap.appendChild(this.canvas);
    host.insertBefore(wrap, host.firstChild);
    host.classList.add('has-electric-border');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
  }

  Instance.prototype.resize = function () {
    var r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.w = r.width + this.offset * 2;
    this.h = r.height + this.offset * 2;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.canvas.style.left = -this.offset + 'px';
    this.canvas.style.top = -this.offset + 'px';
  };

  Instance.prototype.draw = function () {
    var ctx = this.ctx;
    if (!ctx || !this.w) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.active) return;
    this.dirty = true;
    ctx.scale(this.dpr, this.dpr);

    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    var left = this.offset, top = this.offset;
    var bw = this.w - 2 * this.offset, bh = this.h - 2 * this.offset;
    var maxR = Math.min(bw, bh) / 2;
    var r = Math.min(this.radius, maxR);
    var perim = 2 * (bw + bh) + 2 * Math.PI * r;
    var samples = Math.max(48, Math.floor(perim / this.step));

    ctx.beginPath();
    for (var i = 0; i <= samples; i++) {
      var t = i / samples;
      var pt = rectPoint(t, left, top, bw, bh, r);
      var nx = octavedNoise(t * 8, this.octaves, 1.6, 0.7, this.chaos, 10, this.time, 0, 0);
      var ny = octavedNoise(t * 8, this.octaves, 1.6, 0.7, this.chaos, 10, this.time, 1, 0);
      var x = pt.x + nx * this.displacement;
      var y = pt.y + ny * this.displacement;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  };

  function frame(now) {
    var dt = lastTime ? (now - lastTime) / 1000 : 0;
    lastTime = now;
    var work = false;
    for (var i = 0; i < instances.length; i++) {
      var inst = instances[i];
      if (inst.active && inst.visible) {
        inst.time += dt * inst.speed;
        inst.draw();
        work = true;
      } else if (inst.dirty) {
        // One last pass to wipe the canvas, then leave it alone.
        inst.draw();
        inst.dirty = false;
      }
    }
    // Idle costs nothing: with no card lit the loop stops entirely rather
    // than clearing five canvases every frame for the rest of the visit.
    if (work) {
      requestAnimationFrame(frame);
    } else {
      running = false;
      lastTime = 0;
    }
  }

  function kick() {
    if (running) return;
    running = true;
    lastTime = 0;
    requestAnimationFrame(frame);
  }

  function start() {
    var nodes = document.querySelectorAll('[data-electric-border]');
    if (!nodes.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    for (var i = 0; i < nodes.length; i++) instances.push(new Instance(nodes[i]));

    // Only cards on screen cost anything.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          var inst = instances.filter(function (x) { return x.host === e.target; })[0];
          if (!inst) return;
          inst.visible = e.isIntersecting;
          if (!inst.visible) { inst.active = false; }
        });
        kick();
      }, { rootMargin: '120px 0px' });
      instances.forEach(function (inst) { io.observe(inst.host); });
    } else {
      instances.forEach(function (inst) { inst.visible = true; });
      kick();
    }

    // The wire lights on the card you are pointing at. Five crawling
    // outlines at once is noise, not detail, and costs five times as much.
    instances.forEach(function (inst) {
      inst.host.addEventListener('pointerenter', function () { inst.active = true; kick(); });
      inst.host.addEventListener('pointerleave', function () { inst.active = false; kick(); });
      inst.host.addEventListener('focusin', function () { inst.active = true; kick(); });
      inst.host.addEventListener('focusout', function () { inst.active = false; kick(); });
    });

    var t = null;
    addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { instances.forEach(function (inst) { inst.resize(); }); }, 180);
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
