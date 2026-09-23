/* ============================================================
   FutureAcad - Rotating text
   Swaps one string for another by animating the outgoing
   characters up and out while the incoming ones rise into place,
   staggered across the line.

   Ported from a React component built on Framer Motion. The
   structure is the same - words wrapped in an overflow-hidden
   span so characters can slide from below, graphemes split with
   Intl.Segmenter, stagger measured from first/last/centre/random.
   Framer's spring is replaced with the GSAP easing this site
   already loads.

   Exposes window.FaRotatingText.

   Pure ASCII on purpose; nothing here depends on file decoding.
   ============================================================ */
(function () {
  'use strict';

  function splitGraphemes(text) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      var seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
      return Array.from(seg.segment(text), function (s) { return s.segment; });
    }
    return Array.from(text);
  }

  // -> [{ characters: [...], needsSpace: bool }]
  function toElements(text, splitBy) {
    var parts;
    if (splitBy === 'characters') {
      return text.split(' ').map(function (word, i, arr) {
        return { characters: splitGraphemes(word), needsSpace: i !== arr.length - 1 };
      });
    }
    if (splitBy === 'words') parts = text.split(' ');
    else if (splitBy === 'lines') parts = text.split('\n');
    else parts = text.split(splitBy);
    return parts.map(function (part, i, arr) {
      return { characters: [part], needsSpace: i !== arr.length - 1 };
    });
  }

  function staggerDelay(index, total, from, step) {
    if (from === 'last') return (total - 1 - index) * step;
    if (from === 'center') return Math.abs(Math.floor(total / 2) - index) * step;
    if (from === 'random') return Math.abs(Math.floor(Math.random() * total) - index) * step;
    if (typeof from === 'number') return Math.abs(from - index) * step;
    return index * step;                       // 'first'
  }

  function build(host, text, splitBy) {
    var groups = toElements(text, splitBy);
    var wrap = document.createElement('span');
    wrap.className = 'fa-rotate__run';
    wrap.setAttribute('aria-hidden', 'true');

    var cells = [];
    groups.forEach(function (group) {
      var word = document.createElement('span');
      word.className = 'fa-rotate__word';
      group.characters.forEach(function (ch) {
        var cell = document.createElement('span');
        cell.className = 'fa-rotate__cell';
        cell.textContent = ch;
        word.appendChild(cell);
        cells.push(cell);
      });
      wrap.appendChild(word);
      if (group.needsSpace) {
        var sp = document.createElement('span');
        sp.className = 'fa-rotate__space';
        sp.textContent = ' ';
        wrap.appendChild(sp);
      }
    });
    host.appendChild(wrap);
    return { wrap: wrap, cells: cells };
  }

  /**
   * rotate(host, text, opts)
   * Replaces the contents of `host` with `text`, animated.
   * opts: splitBy ('characters' | 'words' | 'lines' | any string),
   *       stagger (seconds), staggerFrom, duration, ease.
   */
  function rotate(host, text, opts) {
    if (!host) return;
    opts = opts || {};
    var splitBy = opts.splitBy || 'characters';
    var step = typeof opts.stagger === 'number' ? opts.stagger : 0.018;
    var from = opts.staggerFrom || 'first';
    var dur = typeof opts.duration === 'number' ? opts.duration : 0.55;
    var ease = opts.ease || 'power3.out';

    // The real string, kept readable to assistive tech and to search. The
    // animated copy is aria-hidden, exactly as in the original component.
    var sr = host.querySelector('.fa-rotate__sr');
    if (!sr) {
      sr = document.createElement('span');
      sr.className = 'fa-rotate__sr';
      host.insertBefore(sr, host.firstChild);
    }
    sr.textContent = text;

    // On the first call the host still holds the server-rendered text node.
    // It is not a run, so nothing would ever animate or remove it, and the
    // old and new strings would stack. Clear anything that is not ours.
    Array.prototype.slice.call(host.childNodes).forEach(function (n) {
      if (n === sr) return;
      if (n.nodeType === 1 && n.classList.contains('fa-rotate__run')) return;
      host.removeChild(n);
    });

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var outgoing = host.querySelectorAll('.fa-rotate__run');

    if (reduced || typeof gsap === 'undefined') {
      for (var i = 0; i < outgoing.length; i++) outgoing[i].remove();
      build(host, text, splitBy);
      return;
    }

    host.classList.add('is-rotating');

    // Send the current line up and out. It is already positioned, so it can
    // leave while the new one arrives underneath - no gap, no reflow jump.
    outgoing.forEach(function (run) {
      var old = run.querySelectorAll('.fa-rotate__cell');
      gsap.killTweensOf(old);
      gsap.to(old, {
        yPercent: -120,
        opacity: 0,
        duration: dur * 0.62,
        ease: 'power2.in',
        stagger: { each: step, from: from },
        onComplete: function () { run.remove(); }
      });
      run.style.position = 'absolute';
      run.style.left = '0';
      run.style.top = '0';
    });

    var made = build(host, text, splitBy);
    gsap.set(made.cells, { yPercent: 100, opacity: 0 });
    gsap.to(made.cells, {
      yPercent: 0,
      opacity: 1,
      duration: dur,
      ease: ease,
      stagger: { each: step, from: from },
      onComplete: function () { host.classList.remove('is-rotating'); }
    });
  }

  window.FaRotatingText = { rotate: rotate, staggerDelay: staggerDelay };
})();
