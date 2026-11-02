/* eslint-disable */
/**
 * The form embed script served at GET /api/form-embed.js (FormEmbedController). Plain browser JavaScript, no
 * build step: it is sent as written. Keep it free of backticks and dollar-brace (it lives in a String.raw template).
 * Layouts (FormSettings.layout): page, steps (page by section, About you last), questions (page by question: one
 * question or text block per screen, single choices move on by themselves), accordion (details), tabs.
 * Text blocks (type CONTENT) are formatted text from the form's owner, cleaned to a short list of safe tags.
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
    ':where(.ubo-form .ubo-area){display:flex;justify-content:space-between;padding:.35rem 0;border-bottom:1px solid var(--ubo-border)}',
    ':where(.ubo-form .ubo-step){color:var(--ubo-muted);margin:0 0 .25rem}',
    ':where(.ubo-form .ubo-nav){display:flex;gap:.75rem;flex-wrap:wrap}',
    ':where(.ubo-form .ubo-button--secondary){background:transparent;color:inherit;border:1px solid var(--ubo-border)}',
    ':where(.ubo-form .ubo-file){padding:.35rem 0}',
    ':where(.ubo-form .ubo-inline){display:flex;gap:.5rem;align-items:center}',
    ':where(.ubo-form .ubo-group-row){border:1px solid var(--ubo-border);border-radius:var(--ubo-radius);padding:.75rem .75rem 0;margin:0 0 .75rem}',
    ':where(.ubo-form .ubo-group-remove){font:inherit;background:none;border:0;color:var(--ubo-muted);cursor:pointer;padding:0 0 .75rem;text-decoration:underline}',
    ':where(.ubo-form .ubo-panel){border:1px solid var(--ubo-border);border-radius:var(--ubo-radius);margin:0 0 .75rem;padding:0 1rem}',
    ':where(.ubo-form .ubo-panel > summary){cursor:pointer;font-weight:600;padding:.85rem 0}',
    ':where(.ubo-form .ubo-panel[open] > summary){border-bottom:1px solid var(--ubo-border);margin-bottom:1rem}',
    ':where(.ubo-form .ubo-tabs){display:flex;gap:.25rem;overflow-x:auto;border-bottom:1px solid var(--ubo-border);margin:0 0 var(--ubo-gap)}',
    ':where(.ubo-form .ubo-tab){font:inherit;background:none;border:0;border-bottom:2px solid transparent;padding:.6rem .9rem;cursor:pointer;white-space:nowrap;color:var(--ubo-muted)}',
    ':where(.ubo-form .ubo-tab[aria-selected=true]){border-bottom-color:var(--ubo-accent);color:inherit;font-weight:600}',
    ':where(.ubo-form .ubo-text){margin:0 0 var(--ubo-gap);line-height:1.55}',
    ':where(.ubo-form .ubo-text p){margin:0 0 .6rem}',
    ':where(.ubo-form .ubo-text p:last-child){margin-bottom:0}',
    ':where(.ubo-form .ubo-text ul,.ubo-form .ubo-text ol){margin:0 0 .6rem;padding-left:1.25rem}',
    ':where(.ubo-form .ubo-progress){height:4px;background:var(--ubo-border);border-radius:2px;margin:0 0 var(--ubo-gap);overflow:hidden}',
    ':where(.ubo-form .ubo-progress > span){display:block;height:100%;background:var(--ubo-accent);transition:width .25s}',
    ':where(.ubo-form .ubo-kicker){color:var(--ubo-muted);font-size:.85em;text-transform:uppercase;letter-spacing:.04em;margin:0 0 .5rem}'
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

  /** A text block's formatted text, keeping only simple, safe tags (no scripts, styles or event handlers). */
  var SAFE_TAGS = { P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, S: 1, A: 1, UL: 1, OL: 1, LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, BLOCKQUOTE: 1, SPAN: 1 };
  function richText(html) {
    var box = el('div', { className: 'ubo-text' });
    var src = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html').body.firstChild;
    function copy(from, to) {
      Array.prototype.forEach.call(from.childNodes, function (n) {
        if (n.nodeType === 3) { to.appendChild(document.createTextNode(n.nodeValue)); return; }
        if (n.nodeType !== 1) return;
        if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
        if (!SAFE_TAGS[n.tagName]) { copy(n, to); return; }
        var c = document.createElement(n.tagName.toLowerCase());
        if (n.tagName === 'A') {
          var href = n.getAttribute('href') || '';
          if (/^(https?:|mailto:|tel:)/i.test(href)) { c.setAttribute('href', href); c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener'); }
        }
        copy(n, c);
        to.appendChild(c);
      });
    }
    if (src) copy(src, box);
    return box;
  }

  var FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg';
  var FILE_MAX_BYTES = 10 * 1024 * 1024;

  /**
   * One form field: returns { node, read() } where read() gives the value to send. onPick: a single choice was made.
   * filesUrl: where file questions upload (the link's /files address).
   */
  function field(f, onPick, filesUrl) {
    var id = 'ubo-' + (++uid);
    if (f.type === 'CONTENT') {
      return { node: richText(f.name), read: function () { return null; }, missing: function () { return false; }, name: '', content: true };
    }
    if (f.type === 'SINGLE_SELECT' || f.type === 'MULTI_SELECT') {
      var multi = f.type === 'MULTI_SELECT';
      var name = 'f-' + f.id;
      var inputs = [];
      var choices = f.options.map(function (o) {
        var input = el('input', { type: multi ? 'checkbox' : 'radio', name: name, value: o.id, required: !multi && f.required });
        if (!multi && onPick) input.addEventListener('change', function () { onPick(); });
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
    if (f.type === 'FILE') {
      // A file upload: each chosen file uploads right away; the answer is the list of uploaded files.
      var max = f.multiple ? 10 : 1;
      var refs = [];
      var list = el('div');
      var status = el('p', { className: 'ubo-description' });
      var picker = el('input', { id: id, type: 'file', accept: FILE_ACCEPT, multiple: f.multiple ? true : null });
      function drawFiles() {
        list.innerHTML = '';
        refs.forEach(function (r, i) {
          var rm = el('button', { type: 'button', className: 'ubo-group-remove', text: 'Remove' });
          rm.addEventListener('click', function () { refs.splice(i, 1); drawFiles(); });
          list.appendChild(el('div', { className: 'ubo-file' }, [el('span', { text: r.name + ' ' }), rm]));
        });
        picker.disabled = refs.length >= max;
      }
      picker.addEventListener('change', function () {
        var chosen = Array.prototype.slice.call(picker.files || [], 0, Math.max(0, max - refs.length));
        picker.value = '';
        var next = Promise.resolve();
        chosen.forEach(function (file) {
          next = next.then(function () {
            if (file.size > FILE_MAX_BYTES) throw new Error(file.name + ': files can be 10 MB at most');
            status.textContent = 'Uploading ' + file.name + '…';
            var body = new FormData();
            body.append('file', file);
            return fetch(filesUrl, { method: 'POST', body: body }).then(function (res) {
              return res.json().catch(function () { return null; }).then(function (json) {
                if (!res.ok) throw new Error(json && json.message ? (Array.isArray(json.message) ? json.message.join(', ') : json.message) : 'Upload failed');
                refs.push(json);
                drawFiles();
              });
            });
          });
        });
        next.then(function () { status.textContent = ''; }, function (err) { status.textContent = err.message; });
      });
      return {
        node: el('div', { className: 'ubo-field' }, [label(f.name, id, f.required), list, picker, status]),
        read: function () { return refs.length ? refs.slice() : null; },
        missing: function () { return f.required && !refs.length; },
        name: f.name
      };
    }
    if (f.type === 'GROUP') {
      // A repeating group: a box of sub-fields per row, Add another adds one.
      var subs = f.subfields || [];
      var rowsBox = el('div');
      var rows = [];
      function addRow() {
        var cells = subs.map(function (sf) {
          return { id: sf.id, ui: field({ id: sf.id, name: sf.name, type: sf.type, options: sf.options || [], required: false }) };
        });
        var remove = el('button', { type: 'button', className: 'ubo-group-remove', text: 'Remove' });
        var node = el('div', { className: 'ubo-group-row' }, cells.map(function (c) { return c.ui.node; }).concat([remove]));
        var row = { node: node, cells: cells };
        remove.addEventListener('click', function () {
          rows.splice(rows.indexOf(row), 1);
          rowsBox.removeChild(node);
          // There is always one row to fill in.
          if (!rows.length) addRow();
        });
        rows.push(row);
        rowsBox.appendChild(node);
      }
      var add = el('button', { type: 'button', className: 'ubo-button ubo-button--secondary', text: 'Add another' });
      add.addEventListener('click', function () { addRow(); });
      addRow();
      function readRows() {
        return rows
          .map(function (r) {
            var out = {};
            var any = false;
            r.cells.forEach(function (c) { var v = c.ui.read(); if (v !== null) { out[c.id] = v; any = true; } });
            return any ? out : null;
          })
          .filter(function (r) { return r; });
      }
      var groupLegend = el('legend', { className: 'ubo-label' }, [f.name, f.required ? el('span', { className: 'ubo-required', text: '*', 'aria-hidden': 'true' }) : null]);
      return {
        node: el('fieldset', { className: 'ubo-field' }, [groupLegend, rowsBox, add]),
        read: function () { var r = readRows(); return r.length ? r : null; },
        missing: function () { return f.required && !readRows().length; },
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
    if (f.type === 'PHONE' || f.type === 'SSN') {
      // Phone: (503) 555-1234 as you type. SSN: 123-45-6789 shown as ***-**-****, each digit hidden a second
      // after it's typed; the eye shows or hides it.
      var isSsn = f.type === 'SSN';
      var max = isSsn ? 9 : 10;
      var digits = '';
      var fresh = {};
      var shown = false;
      var hideTimer = null;
      var box = el('input', { id: id, type: isSsn ? 'text' : 'tel', inputmode: isSsn ? 'numeric' : 'tel', autocomplete: isSsn ? 'off' : 'tel', placeholder: isSsn ? '***-**-****' : '(555) 555-5555' });
      function fmt(d) {
        if (isSsn) return d.length <= 3 ? d : d.length <= 5 ? d.slice(0, 3) + '-' + d.slice(3) : d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5);
        if (!d.length) return '';
        if (d.length <= 3) return '(' + d;
        if (d.length <= 6) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
        return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
      }
      function display() {
        if (!isSsn) return fmt(digits);
        var m = '';
        for (var k = 0; k < digits.length; k++) m += shown || fresh[k] ? digits.charAt(k) : '*';
        return fmt(m);
      }
      function slots(t) { return t.replace(isSsn ? /[^\d*]/g : /\D/g, '').length; }
      box.addEventListener('input', function () {
        var before = display();
        var after = box.value;
        var p = 0;
        while (p < before.length && p < after.length && before.charAt(p) === after.charAt(p)) p++;
        var q = 0;
        while (q < before.length - p && q < after.length - p && before.charAt(before.length - 1 - q) === after.charAt(after.length - 1 - q)) q++;
        var removed = before.slice(p, before.length - q);
        var inserted = after.slice(p, after.length - q).replace(/\D/g, '');
        var start = slots(before.slice(0, p));
        var cut = slots(removed);
        if (removed && !cut && !inserted && start > 0) { start -= 1; cut = 1; }
        if (!isSsn && !digits && inserted.length === 11 && inserted.charAt(0) === '1') inserted = inserted.slice(1);
        digits = (digits.slice(0, start) + inserted + digits.slice(start + cut)).slice(0, max);
        fresh = {};
        for (var k = start; k < Math.min(max, start + inserted.length); k++) fresh[k] = true;
        box.value = display();
        if (isSsn && inserted) {
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = setTimeout(function () { fresh = {}; box.value = display(); }, 1000);
        }
      });
      var parts = [box];
      if (isSsn) {
        var eye = el('button', { type: 'button', className: 'ubo-button ubo-button--secondary', text: 'Show' });
        eye.addEventListener('click', function () { shown = !shown; eye.textContent = shown ? 'Hide' : 'Show'; box.value = display(); });
        parts = [el('div', { className: 'ubo-inline' }, [box, eye])];
      }
      return {
        node: el('div', { className: 'ubo-field' }, [label(f.name, id, f.required)].concat(parts)),
        read: function () { return digits.length === max ? fmt(digits) : null; },
        missing: function () { return (f.required && digits.length !== max) || (digits.length > 0 && digits.length !== max); },
        name: f.name
      };
    }
    if (f.type === 'CURRENCY') {
      var money = el('input', { id: id, type: 'text', inputmode: 'decimal', placeholder: '$0.00' });
      function amount() {
        var t = money.value.replace(/[$,\s]/g, '');
        if (!t) return null;
        var n = Number(t);
        return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
      }
      money.addEventListener('blur', function () {
        var n = amount();
        if (n !== null && !isNaN(n)) money.value = '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      });
      return {
        node: el('div', { className: 'ubo-field' }, [label(f.name, id, f.required), money]),
        read: function () { var n = amount(); return n === null || isNaN(n) ? null : n; },
        missing: function () { var n = amount(); return (f.required && n === null) || (n !== null && isNaN(n)); },
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
        var layout = form.layout || 'page';
        var whoBlock = el('div', { className: 'ubo-row' }, who);
        var paged = layout === 'steps' || layout === 'questions';
        var pages = [];
        var step = 0;
        function autoNext() {
          // Page by question: a single choice moves on by itself after a moment (Back fixes a wrong pick).
          if (layout !== 'questions') return;
          var at = step;
          setTimeout(function () { if (step === at) nextBtn.click(); }, 350);
        }
        // One block per section: its title (unless the layout shows it), old-style intro, and its items.
        var blocks = form.sections.map(function (s, si) {
          var parts = [];
          if (layout === 'page' || layout === 'steps') parts.push(el('h3', { className: 'ubo-section', text: s.name }));
          if (s.description) {
            var intro = el('p', { className: 'ubo-description', text: s.description });
            if (layout === 'questions') pages.push({ node: el('div', { className: 'ubo-section-body' }, [el('p', { className: 'ubo-kicker', text: s.name }), intro]), fields: [], question: false });
            else parts.push(intro);
          }
          var own = [];
          s.fields.forEach(function (f) {
            var x = field(f, f.type === 'SINGLE_SELECT' ? autoNext : null, base + '/files');
            if (!x.content) fields.push({ def: f, ui: x });
            own.push({ def: f, ui: x });
            if (layout === 'questions') {
              pages.push({ node: el('div', { className: 'ubo-section-body' }, [el('p', { className: 'ubo-kicker', text: s.name }), x.node]), fields: x.content ? [] : [{ def: f, ui: x }], question: !x.content });
            } else parts.push(x.node);
          });
          return { section: s, fields: own.filter(function (x) { return !x.ui.content; }), node: el('div', { className: 'ubo-section-body', 'data-section': String(si) }, parts) };
        });
        if (layout === 'steps') blocks.forEach(function (b) { pages.push({ node: b.node, fields: b.fields, question: false }); });
        var body = [];
        var stepLabel = el('p', { className: 'ubo-step' });
        var bar = el('span');
        var progress = el('div', { className: 'ubo-progress', 'aria-hidden': 'true' }, [bar]);
        var backBtn = el('button', { type: 'button', className: 'ubo-button ubo-button--secondary', text: 'Back' });
        var nextBtn = el('button', { type: 'button', className: 'ubo-button', text: 'Next' });
        var aboutBlock = el('div', { className: 'ubo-section-body' }, [el('h3', { className: 'ubo-section', text: 'About you' }), whoBlock]);
        if (paged && info.kind === 'NEW') pages.push({ node: aboutBlock, fields: [], question: false, about: true });
        var questionCount = pages.filter(function (p) { return p.question; }).length;
        if (paged) {
          body.push(layout === 'questions' ? progress : stepLabel);
          if (layout === 'questions') body.push(stepLabel);
          pages.forEach(function (p) { body.push(p.node); });
        } else if (layout === 'accordion') {
          body.push(whoBlock);
          blocks.forEach(function (b, i) {
            var d = el('details', { className: 'ubo-panel', name: 'ubo-accordion-' + uid, open: i === 0 }, [el('summary', { text: b.section.name }), b.node]);
            body.push(d);
          });
        } else if (layout === 'tabs') {
          body.push(whoBlock);
          var tabs = el('div', { className: 'ubo-tabs', role: 'tablist' });
          blocks.forEach(function (b, i) {
            var t = el('button', { type: 'button', role: 'tab', className: 'ubo-tab', 'aria-selected': i === 0 ? 'true' : 'false', text: b.section.name });
            t.addEventListener('click', function () {
              blocks.forEach(function (x, j) { x.node.hidden = j !== i; });
              tabs.querySelectorAll('.ubo-tab').forEach(function (x, j) { x.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
            });
            tabs.appendChild(t);
            b.node.hidden = i !== 0;
          });
          body.push(tabs);
          blocks.forEach(function (b) { body.push(b.node); });
        } else {
          body.push(whoBlock);
          blocks.forEach(function (b) { body.push(b.node); });
        }
        function showStep() {
          pages.forEach(function (p, i) { p.node.hidden = i !== step; });
          var page = pages[step];
          if (layout === 'questions') {
            var done = pages.slice(0, step).filter(function (p) { return p.question; }).length;
            bar.style.width = (questionCount ? Math.round((done / questionCount) * 100) : 0) + '%';
            stepLabel.textContent = page && page.question ? 'Question ' + (done + 1) + ' of ' + questionCount : page && page.about ? 'Last step' : '';
            stepLabel.hidden = !stepLabel.textContent;
          } else {
            stepLabel.textContent = 'Step ' + (step + 1) + ' of ' + pages.length;
          }
          backBtn.hidden = step === 0;
          var last = step >= pages.length - 1;
          nextBtn.hidden = last;
          button.hidden = !last;
        }
        var hp = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' });
        var errorBox = el('p', { className: 'ubo-error', role: 'alert' });
        errorBox.hidden = true;
        var button = el('button', { type: 'submit', className: 'ubo-button', text: info.kind === 'NEW' ? 'Send' : 'Submit' });
        var formEl = el('form', { novalidate: true }, [
          el('h2', { text: info.formName }),
          info.description ? el('p', { className: 'ubo-description', text: info.description }) : null
        ].concat(body, [
          el('div', { className: 'ubo-hp', 'aria-hidden': 'true' }, [hp]),
          errorBox,
          paged ? el('div', { className: 'ubo-nav' }, [backBtn, nextBtn, button]) : button
        ]));
        // Auto-save: answers save a moment after each change. New-response links start a draft on the first answer
        // (kept for this page visit); client links save into their result.
        var draftToken = null;
        var saveTimer = null;
        var saving = Promise.resolve();
        function collect() {
          var values = {};
          fields.forEach(function (x) { values[x.def.id] = x.ui.read(); });
          return values;
        }
        function submitter() {
          return {
            name: nameIn.input.value.trim(), email: emailIn.input.value.trim(),
            organization: orgIn ? orgIn.input.value.trim() : undefined, phone: phoneIn ? phoneIn.input.value.trim() : undefined
          };
        }
        function saveDraft() {
          saveTimer = null;
          var values = collect();
          var started = Object.keys(values).some(function (k) { return values[k] !== null; });
          if (info.kind === 'NEW' && !draftToken && !started) return saving;
          saving = saving.then(function () {
            var body = { values: values, submitter: submitter() };
            if (draftToken) body.draftToken = draftToken;
            return apiCall(base, 'POST', '/draft', body).then(function (res) {
              if (res && res.draftToken) draftToken = res.draftToken;
            });
          }).catch(function () {
            // Try again a little later; Send also includes every answer.
            if (!saveTimer) saveTimer = setTimeout(saveDraft, 5000);
          });
          return saving;
        }
        function queueSave() {
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(saveDraft, 800);
        }
        formEl.addEventListener('input', queueSave);
        formEl.addEventListener('change', queueSave);
        if (paged) {
          nextBtn.addEventListener('click', function () {
            var p = pages[step];
            var miss = p ? p.fields.filter(function (x) { return x.ui.missing(); })[0] : null;
            if (miss) { errorBox.textContent = layout === 'questions' ? 'Please answer this question' : miss.def.name + ': required'; errorBox.hidden = false; return; }
            errorBox.hidden = true;
            step = Math.min(step + 1, pages.length - 1);
            showStep();
            root.scrollIntoView({ block: 'start', behavior: 'smooth' });
          });
          backBtn.addEventListener('click', function () {
            errorBox.hidden = true;
            step = Math.max(0, step - 1);
            showStep();
            root.scrollIntoView({ block: 'start', behavior: 'smooth' });
          });
          showStep();
        }
        formEl.addEventListener('submit', function (ev) {
          ev.preventDefault();
          if (paged && step < pages.length - 1) { nextBtn.click(); return; }
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
          if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
          saving.then(function () {
            var body = { values: values, submitter: submitter(), website: hp.value };
            if (draftToken) body.draftToken = draftToken;
            return apiCall(base, 'POST', '/submit', body);
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
