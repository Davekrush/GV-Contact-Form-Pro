(() => {
  // ---------------- helpers ----------------
  const pickRecaptchaKey = (form) =>
    (window.gvForms && gvForms.recaptchaKey) ||
    form.dataset.recaptchaKey ||
    '';

  const setResp = (box, msg, ok = true) => {
    if (!box) return;
    box.textContent = msg || '';
    box.classList.remove('success', 'error');
    if (msg) box.classList.add(ok ? 'success' : 'error');
    if (msg) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const clearResp = (box) => {
    if (!box) return;
    box.textContent = '';
    box.classList.remove('success', 'error');
  };

  const toggleBtnLoading = (btn, on) => {
    if (!btn) return;
    btn.classList.toggle('loading', !!on);
    btn.disabled = !!on;
  };

  // reCAPTCHA loader + per-form token cache
  let greLoaded = false;
  let greLoadingPromise = null;

  const loadRecaptcha = (siteKey) => {
    if (window.grecaptcha) return Promise.resolve();
    if (greLoadingPromise) return greLoadingPromise;

    greLoadingPromise = new Promise((resolve) => {
      const s = document.createElement('script');
      const key = encodeURIComponent(siteKey || '');
      s.src = 'https://www.google.com/recaptcha/api.js?render=' + key;
      s.async = true;
      s.defer = true;
      s.onload = () => {
        greLoaded = true;
        resolve();
      };
      s.onerror = () => resolve(); // don't block submit forever
      document.body.appendChild(s);
    });
    return greLoadingPromise;
  };

  const tokenCache = new WeakMap(); // form -> { token, t }

  const getRecaptchaToken = async (form) => {
    const siteKey = pickRecaptchaKey(form);
    if (!siteKey) return '';

    if (!window.grecaptcha) await loadRecaptcha(siteKey);
    if (window.grecaptcha && typeof grecaptcha.ready === 'function') {
      await new Promise((res) => grecaptcha.ready(res));
    }

    const cached = tokenCache.get(form);
    const now = Date.now();
    if (cached && now - cached.t < 90 * 1000) return cached.token;

    try {
      const token = await grecaptcha.execute(siteKey, { action: 'contact' });
      tokenCache.set(form, { token, t: now });
      return token;
    } catch {
      return '';
    }
  };

  // mark first interaction time for min-time checks server-side
  const ensureStartTs = (form) => {
    if (!form.dataset.ts) form.dataset.ts = String(Math.floor(Date.now() / 1000));
  };

  document.addEventListener('focusin', (e) => {
    const form = e.target && e.target.closest && e.target.closest('.gv-form');
    if (!form) return;
    ensureStartTs(form);
  });

  // clear response when user edits
  document.addEventListener('input', (e) => {
    const form = e.target && e.target.closest && e.target.closest('.gv-form');
    if (!form) return;
    const respBox = form.querySelector('.gv-resp');
    if (respBox && respBox.textContent) clearResp(respBox);
  });

  // ---------------- submit ----------------
  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (!form.classList || !form.classList.contains('gv-form')) return;

    e.preventDefault();

    if (form.dataset.sending === '1') return; // double-submit guard
    form.dataset.sending = '1';

    const respBox = form.querySelector('.gv-resp');
    const submitBtn = form.querySelector('button[type="submit"]');
    setResp(respBox, 'Sending…', true);
    toggleBtnLoading(submitBtn, true);

    // Honeypot
    if (form.hp && form.hp.value) {
      setResp(respBox, 'OK', true);
      toggleBtnLoading(submitBtn, false);
      form.dataset.sending = '0';
      return;
    }

    // reCAPTCHA
    const tokenField = form.querySelector('[name="recaptcha_token"]');
    const siteKey = pickRecaptchaKey(form);
    if (tokenField && siteKey) {
      // force fresh token per submit to avoid "used token" edge cases
      tokenCache.delete(form);
      const token = await getRecaptchaToken(form);
      if (!token) {
        setResp(respBox, 'reCAPTCHA error – try again.', false);
        toggleBtnLoading(submitBtn, false);
        form.dataset.sending = '0';
        return;
      }
      tokenField.value = token;
    }

    // Send data
    try {
      const fd = new FormData(form);
      fd.append('action', form.dataset.action || '');

      // lightweight context (only add if not already present in DOM)
      if (!fd.has('_ts')) fd.append('_ts', form.dataset.ts || String(Math.floor(Date.now() / 1000)));
      if (!fd.has('_page')) fd.append('_page', location.href);
      if (!fd.has('_ref')) fd.append('_ref', document.referrer || '');

      const r = await fetch(gvForms.ajaxUrl, {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      });

      let js = null;
      try {
        js = await r.json();
      } catch (_e) {}

      if (!r.ok || !js || js.success === false) {
        const msg = (js && (js.data || js.message)) || 'Server error';
        throw new Error(msg);
      }

      if (js.redirect) {
        location.assign(js.redirect);
        return;
      }

      setResp(respBox, js.data || 'Thank you!', true);
      form.reset();
      tokenCache.delete(form); // refresh next time
      setTimeout(() => clearResp(respBox), 3000);
    } catch (err) {
      setResp(respBox, err?.message || 'Network error – try again.', false);
    } finally {
      toggleBtnLoading(submitBtn, false);
      form.dataset.sending = '0';
    }
  });
})();
