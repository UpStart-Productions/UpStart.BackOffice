/* eslint-disable */
/**
 * The form embed script served at GET /api/form-embed.js (FormEmbedController). Plain browser JavaScript, no
 * build step: it is sent as written. Keep it free of backticks and dollar-brace (it lives in a String.raw template).
 */
export const FORM_EMBED_SCRIPT = String.raw`/* UpStart Back Office form embed. <script src=".../api/form-embed.js" data-ubo-form="LINK_TOKEN" async></script>
   Optional: data-target="#css-selector" (where to draw; default: right after the script),
   data-redirect="https://site/results?r={token}" (scored forms: go there with the result token after sending).
   Styling: the form uses the page's fonts; tune it with CSS variables on .ubo-form
   (--ubo-accent, --ubo-accent-text, --ubo-border, --ubo-radius, --ubo-gap, --ubo-muted, --ubo-error).
   Events on the form's container: "ubo-form:ready", "ubo-form:submitted" (detail: { message, resultToken }). */
(function () {
  'use strict';
  var STYLE_ID = 'ubo-form-style';
  var CSS = [
    ':where(.ubo-form){--ubo-accent:#6d28d9;--ubo-accent-text:#fff;--ubo-border:#d4d4d8;--ubo-radius:8px;--ubo-gap:1rem;--ubo-muted:#6b7280;--ubo-error:#b91c1c;font:inherit;color:inherit;display:block;max-width:100%}',
    ':where(.ubo-form) *{box-sizing:border-box}',
    ':where(.ubo-form h2){margin:0 0 .5rem}',
    ':where(.ubo-form .ubo-description){color:var(--ubo-muted);margin:0 0 var(--ubo-gap)}',
    ':where(.ubo-form .ubo-section){margin:calc(var(--ubo-gap)*1.5) 0 var(--ubo-gap);font-size:1.15em}',
    ':where(.ubo-form .ubo-field){margin:0 0 var(--ubo-gap);border:0;padding:0;min-width:0}',
    ':where(.ubo-form .ubo-label){display:block;font-weight:600;margin:0 0 .4rem}',
    ':where(.ubo-form .ubo-required){color:var(--ubo-error);margin-left:.15em}',
    ':where(.ubo-form input[type=text],.ubo-form input[type=email],.ubo-form input[type=tel],.ubo-form input[type=number],.ubo-form input[type=date],.ubo-form select,.ubo-form textarea){width:100%;font:inherit;padding:.65rem .75rem;border:1px solid var(--ubo-border);border-radius:var(--ubo-radius);background:#fff;color:inherit}',
    ':where(.ubo-form textarea){min-height:6rem;resize:vertical}',
    ':where(.ubo-form .ubo-choice){display:flex;gap:.6rem;align-items:flex-start;padding:.6rem .75rem;border:1px solid var(--ubo-border);border-radius:var(--ubo-radius);margin:0 0 .5rem;cursor:pointer;line-height:1.35}',
    ':where(.ubo-form .ubo-choice input){margin-top:.15rem;flex:none;width:1.1rem;height:1.1rem;accent-color:var(--ubo-accent)}',
    ':where(.ubo-form .ubo-choice:has(input:checked)){border-color:var(--ubo-accent)}',
    ':where(.ubo-form .ubo-row){display:grid;gap:var(--ubo-gap);grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}',
    ':where(.ubo-form .ubo-button){font:inherit;font-weight:600;padding:.8rem 1.4rem;border:0;border-radius:var(--ubo-radius);background:var(--ubo-accent);color:var(--ubo-accent-text);cursor:pointer;text-decoration:none;display:inline-block}',
    ':where(.ubo-form .ubo-button[disabled]){opacity:.6;cursor:default}',
    ':where(.ubo-form .ubo-error){color:var(--ubo-error);margin:0 0 var(--ubo-gap)}',
    ':where(.ubo-form .ubo-hp){position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}',
    ':where(.ubo-form .ubo-score){font-size:2.5em;font-weight:700;margin:.5rem 0}',
    ':where(.ubo-form .ubo-area){display:flex;justify-content:space-between;padding:.35rem 0;border-bottom:1px solid var(--ubo-border)}'
  ].join('\n');

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k) || attrs[k] === null || attrs[k] === undefined || attrs[k] === false) continue;
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'className') e.className = attrs[k];
      else e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = el('style', { id: STYLE_ID });
    s.textContent = CSS;
    (document.head || document.documentElement).insertBefore(s, (document.head || document.documentElement).firstChild);
  }

  function apiCall(api, method, path, body) {
    return fetch(api + path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        if (!res.ok) {
          var msg = json && json.message ? (Array.isArray(json.message) ? json.message.join(', ') : json.message) : 'Something went wrong';
          var err = new Error(msg); err.status = res.status; throw err;
        }
        return json;
      });
    });
  }

  var uid = 0;
  function label(text, forId, required) {
    return el('label', { className: 'ubo-label', 'for': forId }, [text, required ? el('span', { className: 'ubo-required', text: '*', 'aria-hidden': 'true' }) : null]);
  }

  function textInput(type, name, labelText, required, autocomplete) {
    var id = 'ubo-' + (++uid);
    var input = el('input', { type: type, id: id, name: name, required: required, autocomplete: autocomplete || null });
    return { node: el('div', { className: 'ubo-field' }, [label(labelText, id, required), input]), input: input };
  }

  /** One form field: returns { node, read() } where read() gives the value to send. */
  function field(f) {
    var id = 'ubo-' + (++uid);
    if (f.type === 'SINGLE_SELECT' || f.type === 'MULTI_SELECT') {
      var multi = f.type === 'MULTI_SELECT';
      var name = 'f-' + f.id;
      var inputs = [];
      var choices = f.options.map(function (o) {
        var input = el('input', { type: multi ? 'checkbox' : 'radio', name: name, value: o.id, required: !multi && f.required });
        inputs.push(input);
        return el('label', { className: 'ubo-choice' }, [input, el('span', { text: o.label })]);
      });
      var legend = el('legend', { className: 'ubo-label' }, [f.name, f.required ? el('span', { className: 'ubo-required', text: '*', 'aria-hidden': 'true' }) : null]);
      return {
        node: el('fieldset', { className: 'ubo-field' }, [legend].concat(choices)),
        read: function () {
          var picked = inputs.filter(function (i) { return i.checked; }).map(function (i) { return i.value; });
          return multi ? (picked.length ? picked : null) : (picked[0] || null);
        },
        missing: function () { return f.required && !inputs.some(function (i) { return i.checked; }); },
        name: f.name
      };
    }
    if (f.type === 'CHECKBOX') {
      var box = el('input', { type: 'checkbox', id: id });
      return {
        node: el('div', { className: 'ubo-field' }, [el('label', { className: 'ubo-choice', 'for': id }, [box, el('span', { text: f.name })])]),
        read: function () { return box.checked ? true : null; },
        missing: function () { return f.required && !box.checked; },
        name: f.name
      };
    }
    var input = f.type === 'LONG_TEXT'
      ? el('textarea', { id: id, required: f.required })
      : el('input', { id: id, type: f.type === 'NUMBER' ? 'number' : f.type === 'DATE' ? 'date' : 'text', required: f.required, step: f.type === 'NUMBER' ? 'any' : null });
    return {
      node: el('div', { className: 'ubo-field' }, [label(f.name, id, f.required), input]),
      read: function () {
        var v = input.value.trim();
        if (!v) return null;
        return f.type === 'NUMBER' ? Number(v) : v;
      },
      missing: function () { return f.required && !input.value.trim(); },
      name: f.name
    };
  }

  function results(r) {
    var parts = [el('p', { className: 'ubo-score', text: Math.round(r.percent) + '%' })];
    if (r.band) {
      parts.push(el('h3', { text: r.band.label }));
      if (r.band.description) parts.push(el('p', { text: r.band.description }));
      if (r.band.nextSteps && r.band.nextSteps.length) {
        parts.push(el('h4', { text: 'Recommended next steps' }));
        parts.push(el('ul', null, r.band.nextSteps.map(function (n) { return el('li', { text: n }); })));
      }
      if (r.band.assetUrl) parts.push(el('p', null, [el('a', { href: r.band.assetUrl, target: '_blank', rel: 'noopener', text: r.band.assetLabel || 'Download your guide' })]));
    }
    if (r.groups && r.groups.length) {
      parts.push(el('h4', { text: 'By area' }));
      r.groups.forEach(function (g) { parts.push(el('div', { className: 'ubo-area' }, [el('span', { text: g.name }), el('strong', { text: Math.round(g.percent) + '%' })])); });
    }
    if (r.cta) parts.push(el('p', null, [el('a', { className: 'ubo-button', href: r.cta.url, text: r.cta.label })]));
    return el('div', { className: 'ubo-results' }, parts);
  }

  function mount(script) {
    if (script.getAttribute('data-ubo-mounted')) return;
    script.setAttribute('data-ubo-mounted', '1');
    var token = script.getAttribute('data-ubo-form');
    if (!token) return;
    var api = script.getAttribute('data-api') || (new URL(script.src, location.href).origin + '/api');
    var base = api + '/form-links/' + encodeURIComponent(token);
    var redirect = script.getAttribute('data-redirect');
    var targetSel = script.getAttribute('data-target');
    var host = targetSel ? document.querySelector(targetSel) : null;
    if (!host) { host = el('div'); script.parentNode.insertBefore(host, script.nextSibling); }
    var root = el('div', { className: 'ubo-form' });
    host.appendChild(root);
    function emit(name, detail) {
      var ev; try { ev = new CustomEvent(name, { detail: detail, bubbles: true }); } catch (e) { ev = document.createEvent('CustomEvent'); ev.initCustomEvent(name, true, false, detail); }
      host.dispatchEvent(ev);
    }
    function show(nodes) { root.innerHTML = ''; nodes.forEach(function (n) { if (n) root.appendChild(n); }); }

    show([el('p', { className: 'ubo-description', text: 'Loading…' })]);
    apiCall(base, 'GET', '').then(function (info) {
      if (info.verify !== 'NONE') {
        show([el('h2', { text: info.formName }), el('p', null, [el('a', { className: 'ubo-button', href: info.pageUrl, target: '_blank', rel: 'noopener', text: 'Open the form' })])]);
        return;
      }
      return apiCall(base, 'GET', '/form').then(function (form) {
        var who = [];
        var nameIn = textInput('text', 'name', 'Your name', info.kind === 'NEW', 'name');
        var emailIn = textInput('email', 'email', 'Your email', info.kind === 'NEW', 'email');
        who.push(nameIn.node, emailIn.node);
        var orgIn = info.kind === 'NEW' && info.ask && info.ask.organization ? textInput('text', 'organization', 'Organization', true, 'organization') : null;
        var phoneIn = info.kind === 'NEW' && info.ask && info.ask.phone ? textInput('tel', 'phone', 'Phone', false, 'tel') : null;
        if (orgIn) who.push(orgIn.node);
        if (phoneIn) who.push(phoneIn.node);
        var fields = [];
        var body = [el('div', { className: 'ubo-row' }, who)];
        form.sections.forEach(function (s) {
          body.push(el('h3', { className: 'ubo-section', text: s.name }));
          s.fields.forEach(function (f) { var x = field(f); fields.push({ def: f, ui: x }); body.push(x.node); });
        });
        var hp = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' });
        var errorBox = el('p', { className: 'ubo-error', role: 'alert' });
        errorBox.hidden = true;
        var button = el('button', { type: 'submit', className: 'ubo-button', text: 'Send' });
        var formEl = el('form', { novalidate: true }, [
          el('h2', { text: info.formName }),
          info.description ? el('p', { className: 'ubo-description', text: info.description }) : null
        ].concat(body, [el('div', { className: 'ubo-hp', 'aria-hidden': 'true' }, [hp]), errorBox, button]));
        formEl.addEventListener('submit', function (ev) {
          ev.preventDefault();
          errorBox.hidden = true;
          var missing = fields.filter(function (x) { return x.ui.missing(); })[0];
          var problem = (info.kind === 'NEW' && !nameIn.input.value.trim()) ? 'Your name is required'
            : (info.kind === 'NEW' && !/.+@.+\..+/.test(emailIn.input.value.trim())) ? 'A valid email address is required'
            : (orgIn && !orgIn.input.value.trim()) ? 'Your organization is required'
            : missing ? missing.def.name + ': required' : null;
          if (problem) { errorBox.textContent = problem; errorBox.hidden = false; errorBox.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
          var values = {};
          fields.forEach(function (x) { var v = x.ui.read(); if (v !== null) values[x.def.id] = v; });
          button.disabled = true;
          apiCall(base, 'POST', '/submit', {
            values: values,
            submitter: {
              name: nameIn.input.value.trim(), email: emailIn.input.value.trim(),
              organization: orgIn ? orgIn.input.value.trim() : undefined, phone: phoneIn ? phoneIn.input.value.trim() : undefined
            },
            website: hp.value
          }).then(function (res) {
            emit('ubo-form:submitted', { message: res.message, resultToken: res.resultToken || null });
            if (redirect && res.resultToken) { location.href = redirect.replace('{token}', encodeURIComponent(res.resultToken)); return; }
            var done = [el('h2', { text: 'Thank you' }), el('p', { text: res.message })];
            show(done);
            root.scrollIntoView({ block: 'start', behavior: 'smooth' });
            if (res.resultToken) {
              apiCall(api, 'GET', '/form-results/' + encodeURIComponent(res.resultToken)).then(function (r) { root.appendChild(results(r)); }).catch(function () {});
            }
          }).catch(function (err) {
            button.disabled = false;
            errorBox.textContent = err.message; errorBox.hidden = false;
          });
        });
        show([formEl]);
        emit('ubo-form:ready', { formName: info.formName });
      });
    }).catch(function (err) {
      show([el('p', { className: 'ubo-error', text: err.message || 'This form could not be loaded.' })]);
    });
  }

  function mountAll() {
    ensureStyle();
    var scripts = document.querySelectorAll('script[data-ubo-form]');
    for (var i = 0; i < scripts.length; i++) mount(scripts[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
`;
