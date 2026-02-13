import{_ as n,o as s,c as e,ag as t}from"./chunks/framework.DEqXEGcv.js";const h=JSON.parse('{"title":"REPL","description":"","frontmatter":{"title":"REPL"},"headers":[],"relativePath":"tooling/repl.md","filePath":"tooling/repl.md"}'),p={name:"tooling/repl.md"};function i(l,a,o,r,d,c){return s(),e("div",null,[...a[0]||(a[0]=[t(`<h1 id="repl" tabindex="-1">REPL <a class="header-anchor" href="#repl" aria-label="Permalink to &quot;REPL&quot;">​</a></h1><p>The Lux REPL (Read-Eval-Print Loop) provides an interactive environment for experimenting with Lux code, testing expressions, and exploring the standard library.</p><h2 id="starting-the-repl" tabindex="-1">Starting the REPL <a class="header-anchor" href="#starting-the-repl" aria-label="Permalink to &quot;Starting the REPL&quot;">​</a></h2><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">lux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> repl</span></span></code></pre></div><p>You will see:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>  Lux REPL v0.1.0</span></span>
<span class="line"><span>  Type expressions to evaluate. Use :quit to exit.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lux&gt;</span></span></code></pre></div><h2 id="evaluating-expressions" tabindex="-1">Evaluating Expressions <a class="header-anchor" href="#evaluating-expressions" aria-label="Permalink to &quot;Evaluating Expressions&quot;">​</a></h2><p>Type any Lux expression and press Enter to see the result:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>lux&gt; 1 + 2</span></span>
<span class="line"><span>3</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lux&gt; &quot;Hello&quot; ++ &quot; &quot; ++ &quot;World&quot;</span></span>
<span class="line"><span>Hello World</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lux&gt; [1, 2, 3] |&gt; map(fn(x) x * 2)</span></span>
<span class="line"><span>[2, 4, 6]</span></span></code></pre></div><h2 id="variable-binding" tabindex="-1">Variable Binding <a class="header-anchor" href="#variable-binding" aria-label="Permalink to &quot;Variable Binding&quot;">​</a></h2><p>Define variables that persist across evaluations in the current session:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>lux&gt; name = &quot;Lux&quot;</span></span>
<span class="line"><span>Lux</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lux&gt; greeting = &quot;Hello, {name}!&quot;</span></span>
<span class="line"><span>Hello, Lux!</span></span></code></pre></div><h2 id="function-definitions" tabindex="-1">Function Definitions <a class="header-anchor" href="#function-definitions" aria-label="Permalink to &quot;Function Definitions&quot;">​</a></h2><p>Define and call functions:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>lux&gt; fn double(x) { x * 2 }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lux&gt; double(21)</span></span>
<span class="line"><span>42</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lux&gt; fn factorial(n) {</span></span>
<span class="line"><span>...    match n {</span></span>
<span class="line"><span>...      0 =&gt; 1</span></span>
<span class="line"><span>...      n =&gt; n * factorial(n - 1)</span></span>
<span class="line"><span>...    }</span></span>
<span class="line"><span>...  }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lux&gt; factorial(10)</span></span>
<span class="line"><span>3628800</span></span></code></pre></div><h2 id="multi-line-input" tabindex="-1">Multi-Line Input <a class="header-anchor" href="#multi-line-input" aria-label="Permalink to &quot;Multi-Line Input&quot;">​</a></h2><p>The REPL automatically detects incomplete expressions by tracking open braces, brackets, and parentheses. When a line ends with an unclosed delimiter, the prompt changes to <code>...</code> and waits for more input:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>lux&gt; fn greet(name) {</span></span>
<span class="line"><span>...    message = &quot;Hello, {name}!&quot;</span></span>
<span class="line"><span>...    print(message)</span></span>
<span class="line"><span>...  }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lux&gt; greet(&quot;World&quot;)</span></span>
<span class="line"><span>Hello, World!</span></span></code></pre></div><h2 id="standard-library" tabindex="-1">Standard Library <a class="header-anchor" href="#standard-library" aria-label="Permalink to &quot;Standard Library&quot;">​</a></h2><p>The full Lux standard library is available in the REPL, including all built-in functions and <code>Result</code>/<code>Option</code> types:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>lux&gt; range(1, 6)</span></span>
<span class="line"><span>[1, 2, 3, 4, 5]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lux&gt; [3, 1, 4, 1, 5] |&gt; sorted()</span></span>
<span class="line"><span>[1, 1, 3, 4, 5]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lux&gt; sum(range(1, 101))</span></span>
<span class="line"><span>5050</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lux&gt; Ok(42) |&gt; map(fn(x) x * 2)</span></span>
<span class="line"><span>Ok(84)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lux&gt; Some(&quot;hello&quot;) |&gt; unwrap_or(&quot;default&quot;)</span></span>
<span class="line"><span>hello</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lux&gt; type_of([1, 2, 3])</span></span>
<span class="line"><span>Array</span></span></code></pre></div><h2 id="repl-commands" tabindex="-1">REPL Commands <a class="header-anchor" href="#repl-commands" aria-label="Permalink to &quot;REPL Commands&quot;">​</a></h2><table tabindex="0"><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><code>:quit</code> or <code>:q</code></td><td>Exit the REPL</td></tr><tr><td><code>:exit</code></td><td>Exit the REPL (alias)</td></tr><tr><td><code>:help</code></td><td>Show available commands</td></tr><tr><td><code>:clear</code></td><td>Reset the REPL context, clearing all defined variables and functions</td></tr></tbody></table><h2 id="tips" tabindex="-1">Tips <a class="header-anchor" href="#tips" aria-label="Permalink to &quot;Tips&quot;">​</a></h2><ul><li><strong>Quick experiments</strong>: Use the REPL to test pattern matching, pipe chains, or standard library functions before adding them to your source files.</li><li><strong>Exploring types</strong>: Use <code>type_of(value)</code> to inspect the runtime type of any value.</li><li><strong>Error handling</strong>: Test <code>Result</code> and <code>Option</code> chains interactively to verify your error handling logic.</li><li><strong>No imports needed</strong>: The standard library is pre-loaded, so you can use <code>map</code>, <code>filter</code>, <code>sorted</code>, <code>Ok</code>, <code>Err</code>, <code>Some</code>, <code>None</code>, and all other built-ins immediately.</li></ul>`,25)])])}const g=n(p,[["render",i]]);export{h as __pageData,g as default};
