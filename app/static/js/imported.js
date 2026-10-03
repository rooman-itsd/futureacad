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
