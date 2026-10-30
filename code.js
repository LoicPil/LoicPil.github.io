// Turns <figure class="codeblock"> elements into code blocks with
// syntax highlighting, a Copy button and, for Rust, a Run button.
//
// Markup (the code inside <code> must be HTML-escaped: &lt; &gt; &amp;):
//
//   <figure class="codeblock" data-lang="rust" data-title="main.rs" data-run="rust">
//     <pre><code>fn main() { println!("hi"); }</code></pre>
//     <figcaption>Optional note shown under the block.</figcaption>
//   </figure>
//
// data-run="rust" adds Run (executes on the official Rust Playground through
// its public API) and "Open in Playground". Without data-run, only Copy is shown.
// Playground programs are limited to the standard library plus the top crates
// available there, so blocks that need other dependencies should stay static.

(function () {
  'use strict';

  var PLAYGROUND_EXECUTE = 'https://play.rust-lang.org/execute';
  var PLAYGROUND_OPEN = 'https://play.rust-lang.org/';
  var RUN_TIMEOUT_MS = 40000;

  /* ---------- Rust syntax highlighting (tiny, dependency-free) ---------- */

  var RUST_KEYWORDS = new Set([
    'as', 'assert', 'break', 'const', 'continue', 'crate', 'else', 'enum',
    'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match',
    'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static',
    'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while'
  ]);
  var RUST_TYPES = new Set([
    'f32', 'f64', 'i8', 'i16', 'i32', 'i64', 'i128', 'isize', 'u8', 'u16',
    'u32', 'u64', 'u128', 'usize', 'bool', 'char', 'str', 'String', 'Vec',
    'Option', 'Result', 'Some', 'None', 'Ok', 'Err', 'Box'
  ]);

  // Order matters: comments and strings first, then numbers, then words.
  var RUST_TOKEN = new RegExp([
    '(\\/\\/[^\\n]*)',                                  // 1: line comment
    '("(?:\\\\.|[^"\\\\])*")',                          // 2: string
    '(\\b\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?(?:_?(?:f32|f64|[iu](?:8|16|32|64|128|size)))?\\b)', // 3: number
    '(\\b[A-Za-z_][A-Za-z0-9_]*!)',                     // 4: macro call
    '(\\b[A-Za-z_][A-Za-z0-9_]*\\b)'                    // 5: identifier
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

  function button(label) {
    var b = el('button', 'codeblock-btn', label);
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

  function runOnPlayground(src, signal) {
    return fetch(PLAYGROUND_EXECUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'stable',
        mode: 'debug',
        edition: '2021',
        crateType: 'bin',
        tests: false,
        code: src,
        backtrace: false
      }),
      signal: signal
    }).then(function (res) {
      if (!res.ok) throw new Error('The Playground answered with HTTP ' + res.status + '.');
      return res.json();
    });
  }

  /* ---------- Block enhancement ---------- */

  function enhance(fig) {
    if (fig.getAttribute('data-enhanced')) return; // never enhance a block twice
    var codeEl = fig.querySelector('pre code');
    if (!codeEl) return;
    fig.setAttribute('data-enhanced', 'true');

    var src = codeEl.textContent.replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
    var lang = (fig.getAttribute('data-lang') || '').toLowerCase();
    var runnable = fig.getAttribute('data-run') === 'rust';

    codeEl.innerHTML = lang === 'rust' ? highlightRust(src) : escapeHtml(src);

    var bar = el('div', 'codeblock-bar');
    bar.appendChild(el('span', 'codeblock-title', fig.getAttribute('data-title') || lang || 'code'));
    var actions = el('span', 'codeblock-actions');

    var output = null;
    var runBtn = null;

    if (runnable) {
      runBtn = button('▶ Run');
      runBtn.setAttribute('aria-label', 'Run this code on the Rust Playground');
      actions.appendChild(runBtn);

      var open = el('a', 'codeblock-btn', 'Playground ↗');
      open.href = PLAYGROUND_OPEN + '?version=stable&mode=debug&edition=2021&code=' + encodeURIComponent(src);
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      actions.appendChild(open);

      output = el('div', 'codeblock-output');
      output.hidden = true;
      output.setAttribute('role', 'status');
      output.setAttribute('aria-live', 'polite');
    }

    var copyBtn = button('Copy');
    actions.appendChild(copyBtn);
    bar.appendChild(actions);
    fig.insertBefore(bar, fig.firstChild);

    var pre = fig.querySelector('pre');
    pre.tabIndex = 0; // keyboard-scrollable
    if (output) pre.parentNode.insertBefore(output, pre.nextSibling);

    copyBtn.addEventListener('click', function () {
      copyText(src).then(function () {
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

        runOnPlayground(src, controller.signal).then(function (r) {
          output.textContent = '';
          if (r.success) {
            output.appendChild(el('pre', 'codeblock-stdout', r.stdout || '(no output)'));
          } else {
            output.classList.add('is-error');
            output.appendChild(el('pre', 'codeblock-stderr', r.stderr || r.error || 'Execution failed.'));
          }
        }).catch(function (err) {
          output.classList.add('is-error');
          output.textContent = err && err.name === 'AbortError'
            ? 'Timed out. Try again, or use “Playground ↗” to run it there.'
            : 'Could not reach the Rust Playground (' + (err && err.message ? err.message : 'network error') +
              '). Use “Playground ↗” to run it there.';
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
