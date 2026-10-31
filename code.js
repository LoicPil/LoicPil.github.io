// Turns <figure class="codeblock"> elements into code blocks with syntax
// highlighting and a Copy button. Rust blocks can also be made runnable and
// editable.
//
// Markup (the code inside <code> must be HTML-escaped: &lt; &gt; &amp;):
//
//   <figure class="codeblock" data-lang="rust" data-title="main.rs" data-run="rust">
//     <pre><code>fn main() { println!("hi"); }</code></pre>
//     <figcaption>Optional note shown under the block.</figcaption>
//   </figure>
//
// data-run="rust" adds three things:
//   Edit        switches the block to a text area so visitors can change the code
//   Run         compiles and runs the current code on the official Rust Playground
//   Playground  opens the current code there (hidden when the URL would be too long)
// Playground programs can only use the standard library and the crates the
// Playground ships, so blocks that need other dependencies stay static.

(function () {
  'use strict';

  var PLAYGROUND = 'https://play.rust-lang.org/';
  var RUN_TIMEOUT_MS = 40000;
  var MAX_URL_CODE = 6500; // longest encoded code we put in a Playground link

  /* ---------- Rust syntax highlighting (tiny, dependency-free) ---------- */

  var RUST_KEYWORDS = new Set([
    'as', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern',
    'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod',
    'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct',
    'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while'
  ]);
  var RUST_TYPES = new Set([
    'f32', 'f64', 'i8', 'i16', 'i32', 'i64', 'i128', 'isize', 'u8', 'u16',
    'u32', 'u64', 'u128', 'usize', 'bool', 'char', 'str', 'String', 'Vec',
    'Option', 'Result', 'Some', 'None', 'Ok', 'Err', 'Box'
  ]);

  // Order matters: comments and strings first, then numbers, then words.
  var RUST_TOKEN = new RegExp([
    '(\\/\\/[^\\n]*)',                                   // 1: line comment
    '(r#{0,4}"[\\s\\S]*?"#{0,4}|"(?:\\\\.|[^"\\\\])*")', // 2: raw or normal string
    '(\\b\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?(?:_?(?:f32|f64|[iu](?:8|16|32|64|128|size)))?\\b)', // 3: number
    '(\\b[A-Za-z_][A-Za-z0-9_]*!)',                      // 4: macro call
    '(\\b[A-Za-z_][A-Za-z0-9_]*\\b)'                     // 5: identifier
  ].join('|'), 'g');

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function span(cls, text) {
    return '<span class="tok-' + cls + '">' + escapeHtml(text) + '</span>';
  }

  function highlightRust(src) {
    var out = '';
    var last = 0;
    var m;
    RUST_TOKEN.lastIndex = 0;
    while ((m = RUST_TOKEN.exec(src)) !== null) {
      out += escapeHtml(src.slice(last, m.index));
      var t = m[0];
      if (m[1]) out += span('comment', t);
      else if (m[2]) out += span('string', t);
      else if (m[3]) out += span('number', t);
      else if (m[4]) out += span('macro', t);
      else if (RUST_KEYWORDS.has(t)) out += span('keyword', t);
      else if (RUST_TYPES.has(t) || /^[A-Z]/.test(t)) out += span('type', t);
      else out += escapeHtml(t);
      last = m.index + t.length;
    }
    return out + escapeHtml(src.slice(last));
  }

  /* ---------- Helpers ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, extra) {
    var b = el('button', 'codeblock-btn' + (extra ? ' ' + extra : ''), label);
    b.type = 'button';
    return b;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  function post(url, payload, signal) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: signal
    }).then(function (res) {
      if (!res.ok) throw new Error('The Playground answered with HTTP ' + res.status + '.');
      return res.json();
    });
  }

  // Newer endpoint first; if the browser cannot reach it, fall back to the
  // older one that mdBook uses, which answers with one combined output string.
  function runOnPlayground(src, signal) {
    return post(PLAYGROUND + 'execute', {
      channel: 'stable', mode: 'debug', edition: '2021', crateType: 'bin',
      tests: false, code: src, backtrace: false
    }, signal).then(function (r) {
      return { ok: !!r.success, text: r.success ? (r.stdout || '(no output)') : (r.stderr || r.error || 'Execution failed.') };
    }).catch(function (err) {
      if (err && err.name === 'AbortError') throw err;
      return post(PLAYGROUND + 'evaluate.json', {
        version: 'stable', optimize: '0', code: src, edition: '2021'
      }, signal).then(function (r) {
        var failed = !!r.error;
        return { ok: !failed, text: (failed ? r.error : r.result) || '(no output)' };
      });
    });
  }

  /* ---------- Block enhancement ---------- */

  function enhance(fig) {
    if (fig.getAttribute('data-enhanced')) return; // never enhance a block twice
    var pre = fig.querySelector('pre');
    var codeEl = pre && pre.querySelector('code');
    if (!codeEl) return;
    fig.setAttribute('data-enhanced', 'true');

    var original = codeEl.textContent.replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
    var current = original;
    var lang = (fig.getAttribute('data-lang') || '').toLowerCase();
    var runnable = fig.getAttribute('data-run') === 'rust';
    var editor = null;

    function paint() {
      codeEl.innerHTML = lang === 'rust' ? highlightRust(current) : escapeHtml(current);
    }
    paint();

    var bar = el('div', 'codeblock-bar');
    bar.appendChild(el('span', 'codeblock-title', fig.getAttribute('data-title') || lang || 'code'));
    var actions = el('span', 'codeblock-actions');

    var output = null, runBtn = null, editBtn = null, resetBtn = null, open = null;

    function updateLink() {
      if (!open) return;
      var enc = encodeURIComponent(current);
      if (enc.length > MAX_URL_CODE) { open.hidden = true; return; }
      open.hidden = false;
      open.href = PLAYGROUND + '?version=stable&mode=debug&edition=2021&code=' + enc;
    }

    if (runnable) {
      runBtn = button('▶ Run', 'primary');
      runBtn.setAttribute('aria-label', 'Run this code on the Rust Playground');
      actions.appendChild(runBtn);

      editBtn = button('Edit');
      editBtn.setAttribute('aria-pressed', 'false');
      actions.appendChild(editBtn);

      resetBtn = button('Reset');
      resetBtn.hidden = true;
      actions.appendChild(resetBtn);

      open = el('a', 'codeblock-btn', 'Playground ↗');
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      actions.appendChild(open);
      updateLink();

      output = el('div', 'codeblock-output');
      output.hidden = true;
      output.setAttribute('role', 'status');
      output.setAttribute('aria-live', 'polite');
    }

    var copyBtn = button('Copy');
    actions.appendChild(copyBtn);
    bar.appendChild(actions);
    fig.insertBefore(bar, fig.firstChild);

    pre.tabIndex = 0; // keyboard-scrollable
    if (output) pre.parentNode.insertBefore(output, pre.nextSibling);

    function setEditing(on) {
      if (on && !editor) {
        editor = document.createElement('textarea');
        editor.value = current;
        editor.spellcheck = false;
        editor.setAttribute('autocapitalize', 'off');
        editor.setAttribute('aria-label', 'Editable code: ' + (fig.getAttribute('data-title') || 'Rust'));
        editor.rows = Math.min(30, Math.max(10, current.split('\n').length));
        editor.addEventListener('input', function () { current = editor.value; updateLink(); });
        editor.addEventListener('keydown', function (e) {
          if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault(); // keep the keyboard useful for indenting
            var s = editor.selectionStart, t = editor.selectionEnd;
            editor.value = editor.value.slice(0, s) + '    ' + editor.value.slice(t);
            editor.selectionStart = editor.selectionEnd = s + 4;
            current = editor.value; updateLink();
          } else if (e.key === 'Escape') {
            editBtn.focus(); // do not trap keyboard users in the text area
          }
        });
        pre.parentNode.insertBefore(editor, pre);
      }
      if (editor) {
        if (on) editor.value = current;
        editor.hidden = !on;
      }
      if (!on) paint();
      pre.hidden = on;
      editBtn.textContent = on ? 'Done' : 'Edit';
      editBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      resetBtn.hidden = current === original && !on;
      if (on) editor.focus();
    }

    if (editBtn) {
      editBtn.addEventListener('click', function () { setEditing(pre.hidden ? false : true); });
      resetBtn.addEventListener('click', function () {
        current = original;
        if (editor) editor.value = original;
        paint(); updateLink();
        resetBtn.hidden = true;
      });
    }

    copyBtn.addEventListener('click', function () {
      copyText(current).then(function () {
        copyBtn.textContent = 'Copied ✓';
      }, function () {
        copyBtn.textContent = 'Copy failed';
      }).then(function () {
        setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1600);
      });
    });

    if (runBtn) {
      runBtn.addEventListener('click', function () {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, RUN_TIMEOUT_MS);

        runBtn.disabled = true;
        runBtn.textContent = 'Running…';
        output.hidden = false;
        output.className = 'codeblock-output';
        output.textContent = 'Compiling and running on the Rust Playground…';
        resetBtn.hidden = current === original && pre.hidden === false;

        runOnPlayground(current, controller.signal).then(function (r) {
          output.textContent = '';
          if (!r.ok) output.classList.add('is-error');
          output.appendChild(el('pre', r.ok ? 'codeblock-stdout' : 'codeblock-stderr', r.text));
        }).catch(function (err) {
          output.classList.add('is-error');
          output.textContent = err && err.name === 'AbortError'
            ? 'Timed out after 40 seconds. Try again, or open it in the Playground.'
            : 'Could not reach the Rust Playground (' + (err && err.message ? err.message : 'network error') +
              '). Check your connection, or copy the code and run it with cargo.';
        }).then(function () {
          clearTimeout(timer);
          runBtn.disabled = false;
          runBtn.textContent = '▶ Run';
        });
      });
    }
  }

  function init() {
    document.querySelectorAll('figure.codeblock').forEach(enhance);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // Exposed for testing.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { highlightRust: highlightRust, escapeHtml: escapeHtml };
  }
})();
