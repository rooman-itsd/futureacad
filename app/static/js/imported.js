/* ============================================================
   FutureAcad — Imported pages (Build / Transform / Staffing / GCC /
   Careers): scroll reveals, stat count-ups, and the enquiry forms.

   Reveals: [data-imp-reveal] elements start hidden only once this
   script has marked the page (.imp-js), so without JS nothing is lost.

   Forms: each form keeps its own fields. On submit, name, email, phone and
   organisation map onto /api/contact; every other answer is folded
   into the message, labelled, so nothing the visitor typed is lost.
   ============================================================ */
(function () {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Scroll reveals + count-ups ---- */
  const targets = document.querySelectorAll('[data-imp-reveal]');
  if (!reduced && 'IntersectionObserver' in window && targets.length) {
    document.documentElement.classList.add('imp-js');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-shown');
        const dd = e.target.querySelector(':scope > dd');
        if (dd) countUp(dd);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    targets.forEach((t) => io.observe(t));
  }

  // "1.3M+", "1,000+", "98%", "13 markets": animate the leading figure,
  // keeping its separators, decimals and whatever text follows it.
  function countUp(el) {
    const m = el.textContent.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/s);
    if (!m) return;
    const [, pre, num, post] = m;
    const target = parseFloat(num.replace(/,/g, ''));
    const decimals = (num.split('.')[1] || '').length;
    const commas = num.includes(',');
    if (!isFinite(target) || target === 0) return;
    const fmt = (v) => {
      const s = v.toFixed(decimals);
      return commas ? Number(s).toLocaleString('en-US', { minimumFractionDigits: decimals }) : s;
    };
    const start = performance.now(), dur = 1300;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = pre + fmt(target * eased) + post;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = pre + num + post;
    };
    requestAnimationFrame(tick);
  }

  /* ---- Self-assessments (AI Readiness Score) ----
     One step at a time: team size first, then each question. Every answer
     scores 0-3; an area scores its points out of its maximum, the total is
     all points out of all maximums, both as percentages (Rooman's formula).
     The result fills the report form's hidden fields, so the lead carries
     the score, the plan and every answer. */
  document.querySelectorAll('[data-rs]').forEach((rs) => {
    const d = JSON.parse(rs.querySelector('[data-rs-data]').textContent);
    const stepsBox = rs.querySelector('[data-rs-steps]');
    const steps = [...rs.querySelectorAll('[data-rs-step]')];
    const back = rs.querySelector('[data-rs-back]');
    const next = rs.querySelector('[data-rs-next]');
    const hint = rs.querySelector('[data-rs-hint]');
    const bar = rs.querySelector('.imp-rs__bar span');
    const result = rs.querySelector('[data-rs-result]');
    const $ = (sel) => result.querySelector(sel);
    let at = 0;
    rs.classList.add('is-live');

    const picked = (i) => {
      const r = steps[i].querySelector('input:checked');
      return r ? Number(r.value) : null;
    };
    const scrollTo = (el) => el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });

    function show(i) {
      at = i;
      steps.forEach((s, j) => { s.hidden = j !== i; });
      back.style.visibility = i ? 'visible' : 'hidden';
      next.textContent = i === steps.length - 1 ? 'See my score' : 'Next';
      bar.style.width = (i / steps.length) * 100 + '%';
      hint.textContent = '';
    }

    function score() {
      const areas = {};
      d.questions.forEach((q, i) => {
        const a = (areas[q.area] = areas[q.area] || [0, 0]);
        a[0] += picked(i + 1) ?? 0;
        a[1] += 3;
      });
      const got = Object.values(areas).reduce((s, [p]) => s + p, 0);
      const max = Object.values(areas).reduce((s, [, m]) => s + m, 0);
      const total = Math.round((got / max) * 100);
      return {
        total,
        band: d.bands.find((b) => total <= b.upto) || d.bands[d.bands.length - 1],
        // In question order: |tojson sorts the areas' keys alphabetically.
        areas: [...new Set(d.questions.map((q) => q.area))].map((key) => ({
          key, ...d.areas[key], pct: Math.round((areas[key][0] / areas[key][1]) * 100),
        })),
        plan: d.sizes[picked(0) ?? 0],
      };
    }

    function el(tag, cls, text) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }

    function finish() {
      const r = score();
      const industry = rs.querySelector('[name="rs-industry"]').value;
      $('[data-rs-total]').textContent = r.total;
      $('[data-rs-dial]').style.setProperty('--v', r.total);
      $('[data-rs-dial]').setAttribute('aria-label', 'Score ' + r.total + ' out of 100');
      $('[data-rs-band]').textContent = r.band.name;
      $('[data-rs-band-body]').textContent = r.band.body;
      $('[data-rs-plan]').textContent = r.plan.plan;
      $('[data-rs-plan-why]').textContent = r.plan.why;

      const areasBox = $('[data-rs-areas]');
      areasBox.replaceChildren(...r.areas.map((a) => {
        const row = el('div', 'imp-rs__area');
        const track = el('span', 'imp-rs__track');
        track.setAttribute('aria-hidden', 'true');
        const fill = el('i');
        fill.style.width = a.pct + '%';
        track.append(fill);
        row.append(el('span', null, a.name), track, el('b', null, a.pct));
        return row;
      }));
      $('[data-rs-wins]').replaceChildren(...[...r.areas].sort((a, b) => a.pct - b.pct).slice(0, 3).map((a) => {
        const li = el('li');
        li.append(el('b', null, a.name), document.createTextNode(a.fix));
        return li;
      }));

      const set = (name, v) => { $('[name="' + name + '"]').value = v; };
      set('rs-size', r.plan.label);
      set('rs-industry', industry);
      set('rs-score', r.total + '/100 (' + r.band.name + ')');
      set('rs-plan', r.plan.plan);
      set('rs-areas', r.areas.map((a) => a.name + ' ' + a.pct).join(', '));
      set('rs-answers', d.questions.map((q, i) => q.q + ' — ' + q.options[picked(i + 1) ?? 0]).join(' | '));

      stepsBox.hidden = true;
      result.hidden = false;
      // The report form's reveal could not trigger while the result was hidden.
      result.querySelectorAll('[data-imp-reveal]').forEach((e) => e.classList.add('is-shown'));
      scrollTo(rs);
      result.focus({ preventScroll: true });
    }

    next.addEventListener('click', () => {
      if (picked(at) === null) {
        hint.textContent = 'Pick one answer to continue.';
        return;
      }
      if (at < steps.length - 1) show(at + 1);
      else finish();
    });
    back.addEventListener('click', () => show(at - 1));
    // Answering a question moves on by itself; the size step waits for the
    // industry, and the last step for "See my score".
    steps.forEach((s, i) => s.addEventListener('change', (e) => {
      hint.textContent = '';
      if (e.target.type === 'radio' && i > 0 && i < steps.length - 1) {
        window.setTimeout(() => { if (at === i) show(i + 1); }, 250);
      }
    }));
    rs.querySelector('[data-rs-again]').addEventListener('click', () => {
      rs.querySelectorAll('[data-rs-steps] input:checked').forEach((r) => { r.checked = false; });
      rs.querySelector('[name="rs-industry"]').value = '';
      result.hidden = true;
      stepsBox.hidden = false;
      show(0);
      scrollTo(rs);
    });
    show(0);
  });

  /* ---- Enquiry and application forms ---- */
  const CORE = { name: 'name', email: 'email', phone: 'phone', company: 'company', organisation: 'company' };

  document.querySelectorAll('[data-imported-form]').forEach((form) => {
    const status = form.querySelector('.form__status');
    const btn = form.querySelector('button[type="submit"]');

    function setStatus(msg, kind) {
      status.textContent = msg;
      status.className = 'form__status' + (kind ? ' form__status--' + kind : '');
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.querySelector('[name="company_website"]').value) return;

      const data = { name: '', email: '', phone: '', company: '', interest: form.dataset.interest || '', message: '' };
      const lines = [];
      form.querySelectorAll('input, select, textarea').forEach((el) => {
        if (el.name === 'company_website' || (el.type === 'radio' && !el.checked)) return;
        const value = el.value.trim();
        if (!value) return;
        const core = CORE[el.name];
        if (core) {
          data[core] = el.dataset.dial && !value.startsWith('+') ? el.dataset.dial + ' ' + value : value;
        } else {
          const label = el.dataset.label || (el.closest('fieldset') && el.closest('fieldset').querySelector('legend').textContent) || el.name;
          lines.push(label.trim() + ': ' + value);
        }
      });
      data.message = lines.length ? lines.join('\n') : 'Enquiry from the ' + data.interest + ' page.';

      if (!data.name || !data.email) {
        setStatus('Please fill in your name and email.', 'error');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        setStatus('That email address doesn’t look right.', 'error');
        return;
      }

      btn.disabled = true;
      const label = btn.querySelector('span');
      const original = label ? label.textContent : '';
      if (label) label.textContent = 'Sending…';
      setStatus('', '');

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': form.dataset.csrf || '' },
          body: JSON.stringify(data),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok) {
          form.reset();
          setStatus('Thank you — we have your details and will be in touch shortly.', 'ok');
          form.classList.add('is-sent');
        } else {
          setStatus(json.error || 'Something went wrong. Please try again.', 'error');
        }
      } catch (err) {
        setStatus('Network error. Please check your connection and retry.', 'error');
      } finally {
        btn.disabled = false;
        if (label) label.textContent = original;
      }
    });
  });
})();
