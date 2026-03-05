# Static Site & SPA Templates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `site` and `spa` templates to `tova new`, fix the build pipeline to handle static/SPA deployments correctly, and fix the `new_docs` project to use the improved infrastructure.

**Architecture:** Two new templates in `PROJECT_TEMPLATES` + infrastructure changes in `resolve.js` (deploy config), `buildProject()` (import path fixing), `productionBuild()` (base-path-aware HTML, SPA fallbacks), and `devServer()` (static file serving for browser-only projects). The existing `fullstack` template also gets updated from deprecated `client {}` to `browser {}`.

**Tech Stack:** JavaScript (Bun runtime), Tova compiler CLI (`bin/tova.js`), Tova config system (`src/config/resolve.js`), Tova router runtime (`src/runtime/router.js`)

---

### Task 1: Add `[deploy]` Config Section

**Files:**
- Modify: `/Users/macm1/new-y-combinator/lux-lang/src/config/resolve.js:7-22` (DEFAULTS)
- Modify: `/Users/macm1/new-y-combinator/lux-lang/src/config/resolve.js:45-93` (normalizeConfig)

**Step 1: Add deploy defaults**

In `resolve.js`, add `deploy` to the `DEFAULTS` object (line 7):

```javascript
const DEFAULTS = {
  project: {
    name: 'tova-app',
    version: '0.1.0',
    description: '',
    entry: 'src',
  },
  build: {
    output: '.tova-out',
  },
  deploy: {
    base: '/',
  },
  dev: {
    port: 3000,
  },
  dependencies: {},
  npm: {},
};
```

**Step 2: Parse deploy section in normalizeConfig**

In `normalizeConfig()` (line 45), add deploy parsing after the `dev` section:

```javascript
    deploy: {
      base: parsed.deploy?.base || DEFAULTS.deploy.base,
    },
```

The full config object in normalizeConfig should become:
```javascript
  const config = {
    project: { ... },
    build: { ... },
    deploy: {
      base: parsed.deploy?.base || DEFAULTS.deploy.base,
    },
    dev: { ... },
    dependencies: ...,
    npm: {},
    _source: source,
  };
```

Also add `deploy: { base: '/' }` to the `configFromPackageJson` fallback function (line 96).

**Step 3: Verify**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun run tests/cli-commands.test.js`
Expected: Existing tests still pass (no breaking changes, deploy defaults are backward-compatible)

**Step 4: Commit**

```bash
git add src/config/resolve.js
git commit -m "feat: add [deploy] config section with base path support"
```

---

### Task 2: Fix Import Paths at Build Time

**Files:**
- Modify: `/Users/macm1/new-y-combinator/lux-lang/bin/tova.js:752-960` (buildProject function)

**Step 1: Add import path fixing utility functions**

Add these helper functions before the `buildProject` function (around line 750):

```javascript
// ─── Import Path Fixup ──────────────────────────────────────

function fixImportPaths(code, outputFilePath, outDir) {
  // Calculate depth of this file relative to outDir
  const relPath = relative(outDir, outputFilePath);
  const depth = dirname(relPath).split(sep).filter(p => p && p !== '.').length;

  // Fix runtime imports: './runtime/X.js' → correct relative path
  if (depth > 0) {
    const prefix = '../'.repeat(depth);
    for (const runtimeFile of ['reactivity.js', 'rpc.js', 'router.js', 'devtools.js', 'ssr.js', 'testing.js']) {
      code = code.split(`'./runtime/${runtimeFile}'`).join(`'${prefix}runtime/${runtimeFile}'`);
      code = code.split(`"./runtime/${runtimeFile}"`).join(`"${prefix}runtime/${runtimeFile}"`);
    }
  }

  // Add .js extension to relative imports that don't have one
  code = code.replace(
    /from\s+(['"])(\.[^'"]+)\1/g,
    (match, quote, path) => {
      if (path.endsWith('.js')) return match;
      return `from ${quote}${path}.js${quote}`;
    }
  );

  // Inject missing router imports
  code = injectRouterImport(code, depth);

  return code;
}

function injectRouterImport(code, depth) {
  const routerFuncs = ['getPath', 'navigate', 'getCurrentRoute', 'getParams', 'getQuery',
                       'defineRoutes', 'onRouteChange', 'Router', 'Link', 'Outlet', 'Redirect',
                       'beforeNavigate', 'afterNavigate'];
  const hasRouterImport = /runtime\/router/.test(code);
  if (hasRouterImport) return code;

  const usedFuncs = routerFuncs.filter(fn => new RegExp('\\b' + fn + '\\b').test(code));
  if (usedFuncs.length === 0) return code;

  // Skip runtime files themselves
  if (/\/runtime\//.test(code) && code.includes('export function')) return code;

  const routerPath = depth === 0
    ? './runtime/router.js'
    : '../'.repeat(depth) + 'runtime/router.js';

  const importLine = `import { ${usedFuncs.join(', ')} } from '${routerPath}';\n`;

  // Insert after first import line, or at the start
  const firstImportEnd = code.indexOf(';\n');
  if (firstImportEnd !== -1 && code.trimStart().startsWith('import ')) {
    return code.slice(0, firstImportEnd + 2) + importLine + code.slice(firstImportEnd + 2);
  }
  return importLine + code;
}
```

**Step 2: Apply fixImportPaths in buildProject**

In the `buildProject` function, after writing each output file, apply `fixImportPaths`. Find the section that writes browser/server/shared files (around lines 920-950) and wrap each `writeFileSync` with path fixing:

For browser output (around line 937):
```javascript
if (output.browser) {
  const browserPath = join(outDir, `${outBaseName}.browser.js`);
  const fixedBrowser = fixImportPaths(generateSourceMap(output.browser, browserPath), browserPath, outDir);
  writeFileSync(browserPath, fixedBrowser);
  if (!isQuiet) console.log(`  ✓ ${relLabel} → ${relative('.', browserPath)}${timing}`);
}
```

Apply the same pattern to shared, server, module, and CLI outputs.

**Step 3: Verify**

Run a build on an existing project:
```bash
cd /Users/macm1/new-y-combinator/tova-packages/ui && /Users/macm1/new-y-combinator/lux-lang/bin/tova.js build
```
Check that the output in `.tova-out/` has correct relative import paths.

**Step 4: Commit**

```bash
git add bin/tova.js
git commit -m "feat: fix import paths at build time (depth-aware, .js ext, router injection)"
```

---

### Task 3: Add `spa` Template

**Files:**
- Modify: `/Users/macm1/new-y-combinator/lux-lang/bin/tova.js:1641-1831` (PROJECT_TEMPLATES and TEMPLATE_ORDER)

**Step 1: Add the spa template**

Add after the `fullstack` template (after line 1765), before `api`:

```javascript
  spa: {
    label: 'Single-page app',
    description: 'browser-only app with routing',
    tomlDescription: 'A Tova single-page application',
    entry: 'src',
    file: 'src/app.tova',
    content: name => `// ${name} — Built with Tova

browser {
  component NavBar {
    path = getPath()
    <nav class="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg"></div>
          <span class="font-bold text-gray-900 text-lg">"${name}"</span>
        </div>
        <div class="flex items-center gap-6">
          <a href="/" class={"text-sm font-medium transition-colors " + if path() == "/" { "text-indigo-600" } else { "text-gray-500 hover:text-gray-900" }}>"Home"</a>
          <a href="/dashboard" class={"text-sm font-medium transition-colors " + if path() == "/dashboard" { "text-indigo-600" } else { "text-gray-500 hover:text-gray-900" }}>"Dashboard"</a>
          <a href="/settings" class={"text-sm font-medium transition-colors " + if path() == "/settings" { "text-indigo-600" } else { "text-gray-500 hover:text-gray-900" }}>"Settings"</a>
        </div>
      </div>
    </nav>
  }

  component HomePage {
    <div class="max-w-5xl mx-auto px-6 py-16 text-center">
      <h1 class="text-4xl font-bold text-gray-900 mb-4">"Welcome to " <span class="text-indigo-600">"${name}"</span></h1>
      <p class="text-lg text-gray-500 mb-8">"A single-page app built with Tova. Edit " <code class="bg-gray-100 text-indigo-600 px-2 py-1 rounded text-sm">"src/app.tova"</code> " to get started."</p>
      <a href="/dashboard" class="inline-block bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 transition-colors">"Go to Dashboard"</a>
    </div>
  }

  component DashboardPage {
    <div class="max-w-5xl mx-auto px-6 py-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">"Dashboard"</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-white rounded-xl border border-gray-200 p-6">
          <p class="text-sm text-gray-500 mb-1">"Total Users"</p>
          <p class="text-3xl font-bold text-gray-900">"1,234"</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-6">
          <p class="text-sm text-gray-500 mb-1">"Revenue"</p>
          <p class="text-3xl font-bold text-gray-900">"$12.4k"</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-6">
          <p class="text-sm text-gray-500 mb-1">"Active Now"</p>
          <p class="text-3xl font-bold text-gray-900">"42"</p>
        </div>
      </div>
    </div>
  }

  component SettingsPage {
    <div class="max-w-5xl mx-auto px-6 py-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">"Settings"</h2>
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <p class="text-gray-500">"Settings page. Customize this for your app."</p>
      </div>
    </div>
  }

  component NotFoundPage {
    <div class="max-w-5xl mx-auto px-6 py-16 text-center">
      <h1 class="text-6xl font-bold text-gray-200 mb-4">"404"</h1>
      <p class="text-lg text-gray-500 mb-6">"Page not found"</p>
      <a href="/" class="text-indigo-600 hover:text-indigo-700 font-medium">"Go home"</a>
    </div>
  }

  defineRoutes({
    "/": HomePage,
    "/dashboard": DashboardPage,
    "/settings": SettingsPage,
    "404": NotFoundPage,
  })

  component App {
    <div class="min-h-screen bg-gray-50">
      <NavBar />
      <Router />
    </div>
  }
}
`,
    nextSteps: name => `    cd ${name}\n    tova dev`,
  },
```

**Step 2: Update TEMPLATE_ORDER**

Change line 1831:
```javascript
const TEMPLATE_ORDER = ['fullstack', 'spa', 'site', 'api', 'script', 'library', 'blank'];
```

**Step 3: Update help text**

In the HELP constant (line 56), update the template list:
```
  new <name>       Create a new Tova project (--template fullstack|spa|site|api|script|library|blank)
```

**Step 4: Update the error message for unknown templates**

In `newProject()` (around line 1862), the error message auto-shows `TEMPLATE_ORDER.join(', ')` so no change needed.

**Step 5: Update tova.toml generation for spa template**

In `newProject()` (around line 1938), add spa to the condition that adds `[dev]` port:
```javascript
if (templateName === 'fullstack' || templateName === 'api' || templateName === 'spa' || templateName === 'site') {
  tomlConfig.dev = { port: 3000 };
  tomlConfig.npm = {};
}
```

Also add deploy config for spa and site:
```javascript
if (templateName === 'spa' || templateName === 'site') {
  tomlConfig.deploy = { base: '/' };
}
```

**Step 6: Verify**

```bash
cd /tmp && /Users/macm1/new-y-combinator/lux-lang/bin/tova.js new test-spa --template spa
cat test-spa/src/app.tova
cat test-spa/tova.toml
rm -rf test-spa
```
Expected: Project created with correct files and deploy config.

**Step 7: Commit**

```bash
git add bin/tova.js
git commit -m "feat: add spa template to tova new"
```

---

### Task 4: Add `site` Template

**Files:**
- Modify: `/Users/macm1/new-y-combinator/lux-lang/bin/tova.js` (PROJECT_TEMPLATES)

**Step 1: Add the site template**

Add after the `spa` template in PROJECT_TEMPLATES:

```javascript
  site: {
    label: 'Static site',
    description: 'docs or marketing site with pages',
    tomlDescription: 'A Tova static site',
    entry: 'src',
    file: 'src/app.tova',
    extraFiles: [
      {
        path: 'src/pages/home.tova',
        content: name => `pub component HomePage {
  <div class="max-w-4xl mx-auto px-6 py-16">
    <h1 class="text-4xl font-bold text-gray-900 mb-4">"Welcome to ${name}"</h1>
    <p class="text-lg text-gray-600 mb-8">"A static site built with Tova. Fast, simple, and easy to deploy anywhere."</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-900 mb-2">"Fast by default"</h3>
        <p class="text-gray-500 text-sm">"Pre-rendered pages load instantly. Client-side routing for smooth navigation."</p>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-900 mb-2">"Deploy anywhere"</h3>
        <p class="text-gray-500 text-sm">"GitHub Pages, Netlify, Vercel, Firebase — works with any static host."</p>
      </div>
    </div>
  </div>
}
`,
      },
      {
        path: 'src/pages/docs.tova',
        content: name => `pub component DocsPage {
  <div class="max-w-4xl mx-auto px-6 py-12">
    <h1 class="text-3xl font-bold text-gray-900 mb-6">"Documentation"</h1>
    <div class="prose">
      <h2 class="text-xl font-semibold text-gray-900 mt-8 mb-3">"Getting Started"</h2>
      <p class="text-gray-600 mb-4">"Add your documentation content here. Each page is a Tova component with its own route."</p>
      <h2 class="text-xl font-semibold text-gray-900 mt-8 mb-3">"Adding Pages"</h2>
      <p class="text-gray-600 mb-4">"Create a new file in " <code class="bg-gray-100 text-indigo-600 px-1.5 py-0.5 rounded text-sm">"src/pages/"</code> " and add a route in " <code class="bg-gray-100 text-indigo-600 px-1.5 py-0.5 rounded text-sm">"src/app.tova"</code> "."</p>
    </div>
  </div>
}
`,
      },
      {
        path: 'src/pages/about.tova',
        content: name => `pub component AboutPage {
  <div class="max-w-4xl mx-auto px-6 py-12">
    <h1 class="text-3xl font-bold text-gray-900 mb-6">"About"</h1>
    <p class="text-gray-600">"This site was built with Tova — a modern programming language that compiles to JavaScript."</p>
  </div>
}
`,
      },
    ],
    content: name => `// ${name} — Built with Tova
import { HomePage } from "./pages/home"
import { DocsPage } from "./pages/docs"
import { AboutPage } from "./pages/about"

browser {
  state mobile_menu_open = false

  component SiteNav {
    path = getPath()
    <header class="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="/" class="flex items-center gap-2 no-underline">
          <div class="w-7 h-7 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg"></div>
          <span class="font-bold text-gray-900">"${name}"</span>
        </a>
        <nav class="flex items-center gap-6">
          <a href="/" class={"text-sm font-medium transition-colors no-underline " + if path() == "/" { "text-indigo-600" } else { "text-gray-500 hover:text-gray-900" }}>"Home"</a>
          <a href="/docs" class={"text-sm font-medium transition-colors no-underline " + if path() == "/docs" { "text-indigo-600" } else { "text-gray-500 hover:text-gray-900" }}>"Docs"</a>
          <a href="/about" class={"text-sm font-medium transition-colors no-underline " + if path() == "/about" { "text-indigo-600" } else { "text-gray-500 hover:text-gray-900" }}>"About"</a>
        </nav>
      </div>
    </header>
  }

  component NotFoundPage {
    <div class="max-w-4xl mx-auto px-6 py-16 text-center">
      <h1 class="text-6xl font-bold text-gray-200 mb-4">"404"</h1>
      <p class="text-lg text-gray-500 mb-6">"Page not found"</p>
      <a href="/" class="text-indigo-600 hover:text-indigo-700 font-medium">"Go home"</a>
    </div>
  }

  defineRoutes({
    "/": HomePage,
    "/docs": DocsPage,
    "/about": AboutPage,
    "404": NotFoundPage,
  })

  component App {
    <div class="min-h-screen bg-gray-50">
      <SiteNav />
      <main>
        <Router />
      </main>
      <footer class="border-t border-gray-100 py-8 text-center">
        <p class="text-sm text-gray-400">"Built with Tova"</p>
      </footer>
    </div>
  }
}
`,
    nextSteps: name => `    cd ${name}\n    tova dev`,
  },
```

**Step 2: Support extraFiles in newProject()**

In `newProject()` (around line 1958), after writing the main template source file, add support for `extraFiles`:

```javascript
  // Template source file
  if (template.file && template.content) {
    writeFileSync(join(projectDir, template.file), template.content(projectName));
    createdFiles.push(template.file);
  }

  // Extra files (e.g., page components for site template)
  if (template.extraFiles) {
    for (const extra of template.extraFiles) {
      const extraPath = join(projectDir, extra.path);
      mkdirSync(dirname(extraPath), { recursive: true });
      writeFileSync(extraPath, extra.content(projectName));
      createdFiles.push(extra.path);
    }
  }
```

Add `import { dirname } from 'path'` if not already imported — check if `dirname` is already imported (it likely is since it's used elsewhere in tova.js).

**Step 3: Verify**

```bash
cd /tmp && /Users/macm1/new-y-combinator/lux-lang/bin/tova.js new test-site --template site
ls -la test-site/src/pages/
cat test-site/src/app.tova
cat test-site/tova.toml
rm -rf test-site
```
Expected: Project with src/app.tova + src/pages/home.tova, docs.tova, about.tova

**Step 4: Commit**

```bash
git add bin/tova.js
git commit -m "feat: add site template to tova new with multi-page support"
```

---

### Task 5: Fix `fullstack` Template (client → browser)

**Files:**
- Modify: `/Users/macm1/new-y-combinator/lux-lang/bin/tova.js:1648-1763` (fullstack template content)

**Step 1: Replace `client {` with `browser {` in fullstack template**

In the fullstack template content function (line 1665), change:
```javascript
client {
```
to:
```javascript
browser {
```

That's the only occurrence — the rest of the template content is inside this block.

**Step 2: Verify**

```bash
cd /tmp && /Users/macm1/new-y-combinator/lux-lang/bin/tova.js new test-fullstack --template fullstack
grep -n "browser {" test-fullstack/src/app.tova
grep -n "client {" test-fullstack/src/app.tova
rm -rf test-fullstack
```
Expected: `browser {` found, `client {` not found.

**Step 3: Commit**

```bash
git add bin/tova.js
git commit -m "fix: update fullstack template from deprecated client{} to browser{}"
```

---

### Task 6: Production Build — Base Path + SPA Fallbacks

**Files:**
- Modify: `/Users/macm1/new-y-combinator/lux-lang/bin/tova.js:3466-3618` (productionBuild function)

**Step 1: Read deploy config in productionBuild**

At the start of `productionBuild()` (line 3466), read the deploy config:

```javascript
async function productionBuild(srcDir, outDir) {
  const config = resolveConfig(process.cwd());
  const basePath = config.deploy?.base || '/';
  // Ensure basePath ends with /
  const base = basePath.endsWith('/') ? basePath : basePath + '/';
```

**Step 2: Use base path in generated HTML**

Replace the HTML generation (around lines 3550-3567) to use the base path:

```javascript
    // Generate production HTML
    const scriptTag = useModule
      ? `<script type="module" src="${base}.tova-out/client.${hash}.js"></script>`
      : `<script src="${base}.tova-out/client.${hash}.js"></script>`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tova App</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  <div id="app"></div>
  ${scriptTag}
</body>
</html>`;
    writeFileSync(join(outDir, 'index.html'), html);
    console.log(`  index.html`);

    // SPA fallback files for various static hosts
    writeFileSync(join(outDir, '404.html'), html);  // GitHub Pages
    console.log(`  404.html (GitHub Pages SPA fallback)`);
    writeFileSync(join(outDir, '200.html'), html);  // Surge
    console.log(`  200.html (Surge SPA fallback)`);
```

**Step 3: Apply fixImportPaths to production build output**

After writing client bundle (around line 3547), apply import path fixing:

```javascript
    const fixedBundle = fixImportPaths(clientBundle, clientPath, outDir);
    writeFileSync(clientPath, fixedBundle);
```

**Step 4: Verify**

```bash
cd /tmp && /Users/macm1/new-y-combinator/lux-lang/bin/tova.js new test-prod --template spa
cd test-prod && /Users/macm1/new-y-combinator/lux-lang/bin/tova.js build --production
ls .tova-out/
cat .tova-out/index.html
cat .tova-out/404.html
cd .. && rm -rf test-prod
```
Expected: index.html, 404.html, and 200.html all exist with correct base paths.

**Step 5: Commit**

```bash
git add bin/tova.js
git commit -m "feat: production build generates SPA fallbacks and uses deploy.base"
```

---

### Task 7: Dev Server — Static File Serving for Browser-Only Projects

**Files:**
- Modify: `/Users/macm1/new-y-combinator/lux-lang/bin/tova.js:1209-1522` (devServer function)

**Step 1: Add static file server for browser-only projects**

After the existing dev server setup (around line 1370, where it checks `if (processes.length > 0)`), add a static file server when there are no server processes but there is a client:

```javascript
  // If no server blocks were found but we have a client, start a static file server
  if (processes.length === 0 && hasClient) {
    const config = resolveConfig(process.cwd());
    const staticPort = basePort;
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.map': 'application/json',
    };

    const staticServer = Bun.serve({
      port: staticPort,
      async fetch(req) {
        const url = new URL(req.url);
        let pathname = url.pathname;

        // Try to serve the file directly from outDir or srcDir
        const tryPaths = [
          join(outDir, pathname),           // .tova-out/path
          join(srcDir, pathname),            // src/path (for index.html at root)
          join(process.cwd(), pathname),     // project-root/path (for index.html)
        ];

        for (const filePath of tryPaths) {
          if (existsSync(filePath) && statSync(filePath).isFile()) {
            const ext = extname(filePath);
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            const content = readFileSync(filePath);
            return new Response(content, {
              headers: {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }
        }

        // SPA fallback: serve index.html for non-file routes
        const indexPath = join(outDir, 'index.html');
        if (existsSync(indexPath)) {
          return new Response(readFileSync(indexPath), {
            headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' },
          });
        }

        // Try project-root index.html
        const rootIndex = join(process.cwd(), 'index.html');
        if (existsSync(rootIndex)) {
          return new Response(readFileSync(rootIndex), {
            headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' },
          });
        }

        return new Response('Not Found', { status: 404 });
      },
    });

    console.log(`\n  Static file server running:`);
    console.log(`    → http://localhost:${staticPort}`);
  }
```

Note: `extname` needs to be imported from `path` — check if it's already imported at the top of tova.js. If not, add it to the existing path import.

**Step 2: Verify**

```bash
cd /tmp && /Users/macm1/new-y-combinator/lux-lang/bin/tova.js new test-dev --template spa
cd test-dev && /Users/macm1/new-y-combinator/lux-lang/bin/tova.js dev
```
Expected: Static server starts on port 3000, serves index.html, handles SPA routing.

**Step 3: Commit**

```bash
git add bin/tova.js
git commit -m "feat: dev server serves static files with SPA fallback for browser-only projects"
```

---

### Task 8: Static Generation (`tova build --static`)

**Files:**
- Modify: `/Users/macm1/new-y-combinator/lux-lang/bin/tova.js` (buildProject and productionBuild)

**Step 1: Parse --static flag in buildProject**

In `buildProject()` (line 752), add:
```javascript
const isStatic = args.includes('--static');
```

Pass it through to productionBuild:
```javascript
if (isProduction) {
  return await productionBuild(srcDir, outDir, isStatic);
}
```

**Step 2: Add static generation to productionBuild**

Update function signature:
```javascript
async function productionBuild(srcDir, outDir, isStatic = false) {
```

After the main build completes (before the "Production build complete" message), add:

```javascript
  // Static generation: pre-render each route to its own HTML file
  if (isStatic && allClientCode.trim()) {
    console.log(`\n  Static generation...\n`);

    // Extract route paths from defineRoutes() call in the client code
    const routePaths = extractRoutePaths(allClientCode);
    if (routePaths.length > 0) {
      for (const routePath of routePaths) {
        // Generate path like /about → about/index.html, / → index.html
        const htmlPath = routePath === '/'
          ? join(outDir, 'index.html')
          : join(outDir, routePath.replace(/^\//, ''), 'index.html');

        mkdirSync(dirname(htmlPath), { recursive: true });

        // Each pre-rendered page is the same SPA shell — the client router
        // will match the route from window.location.pathname on load
        writeFileSync(htmlPath, html);
        const relPath = relative(outDir, htmlPath);
        console.log(`  ${relPath}`);
      }
      console.log(`\n  Pre-rendered ${routePaths.length} route(s)`);
    }
  }
```

**Step 3: Add route extraction helper**

```javascript
function extractRoutePaths(code) {
  // Match defineRoutes({ "/path": Component, ... })
  const match = code.match(/defineRoutes\s*\(\s*\{([^}]+)\}\s*\)/);
  if (!match) return [];

  const paths = [];
  const entries = match[1].matchAll(/"([^"]+)"\s*:/g);
  for (const entry of entries) {
    const path = entry[1];
    // Skip special routes like "404" and "*"
    if (path === '404' || path === '*') continue;
    // Skip paths with dynamic segments
    if (path.includes(':')) continue;
    paths.push(path);
  }
  return paths;
}
```

**Step 4: Verify**

```bash
cd /tmp && /Users/macm1/new-y-combinator/lux-lang/bin/tova.js new test-static --template site
cd test-static && /Users/macm1/new-y-combinator/lux-lang/bin/tova.js build --production --static
ls -R .tova-out/
```
Expected: index.html + docs/index.html + about/index.html

**Step 5: Commit**

```bash
git add bin/tova.js
git commit -m "feat: add --static flag for pre-rendering routes to HTML files"
```

---

### Task 9: Update Help Text and Template Validation

**Files:**
- Modify: `/Users/macm1/new-y-combinator/lux-lang/bin/tova.js:39-89` (HELP constant)
- Modify: `/Users/macm1/new-y-combinator/lux-lang/bin/tova.js:82` (Options section)

**Step 1: Update HELP text**

Update line 56:
```
  new <name>       Create a new Tova project (--template fullstack|spa|site|api|script|library|blank)
```

Add `--static` to the Options section (around line 82):
```
  --static         Pre-render routes to static HTML files (used with --production)
```

**Step 2: Commit**

```bash
git add bin/tova.js
git commit -m "docs: update help text with new templates and --static flag"
```

---

### Task 10: Fix new_docs — Update tova.toml

**Files:**
- Modify: `/Users/macm1/new-y-combinator/tova-packages/ui/new_docs/tova.toml`

**Step 1: Add deploy section**

```toml
[project]
name = "tova-ui-docs"
version = "0.1.0"
description = "Documentation for tova/ui component library"
entry = "src"

[build]
output = ".tova-out"

[deploy]
base = "/"

[dependencies]
"tova/ui" = { path = ".." }

[dev]
port = 3001

[npm]
```

Note: The base path stays as `/` since this will be deployed to the root of a GitHub Pages site. If it were deployed to a subdirectory, this would be `/repo-name/`.

**Step 2: Commit**

```bash
cd /Users/macm1/new-y-combinator/tova-packages/ui
git add new_docs/tova.toml
git commit -m "feat: add [deploy] config to new_docs"
```

---

### Task 11: Fix new_docs — Update index.html

**Files:**
- Modify: `/Users/macm1/new-y-combinator/tova-packages/ui/new_docs/index.html`

**Step 1: Update index.html to use relative paths**

Change absolute paths to relative:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>tova/ui - Beautiful, accessible UI components for Tova</title>
  <meta name="description" content="A comprehensive library of 50+ production-ready, accessible UI components built with the Tova language.">
  <script type="importmap">
    { "imports": { "tova/ui": "./.tova-out/tova-ui.js" } }
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif; }
    #app { height: 100%; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./.tova-out/app.browser.js"></script>
</body>
</html>
```

Key changes: `/.tova-out/` → `./.tova-out/` (relative instead of absolute)

**Step 2: Commit**

```bash
git add new_docs/index.html
git commit -m "fix: use relative paths in new_docs index.html for deployment flexibility"
```

---

### Task 12: Fix new_docs — Update GitHub Actions Workflow

**Files:**
- Modify: `/Users/macm1/new-y-combinator/tova-packages/ui/.github/workflows/deploy-docs.yml`

**Step 1: Update workflow to use the fixed build pipeline**

```yaml
name: Deploy Documentation

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - name: Install Tova
        run: curl -fsSL https://tova.dev/install.sh | bash

      - name: Add Tova to PATH
        run: echo "$HOME/.tova/bin" >> "$GITHUB_PATH"

      - name: Build UI library
        run: tova build

      - name: Post-process UI build
        run: python3 scripts/postprocess-build.py

      - name: Build documentation site
        working-directory: new_docs
        run: tova build

      - name: Prepare deployment
        run: |
          mkdir -p _site
          cp new_docs/index.html _site/
          cp -r new_docs/.tova-out _site/.tova-out
          cp .tova-out/src.js _site/.tova-out/tova-ui.js
          # SPA fallback for GitHub Pages
          cp _site/index.html _site/404.html

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3

  deploy:
    environment:
      name: github-pages
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

Key changes:
- Removed `--production` from docs build (use regular build since import paths are now fixed)
- Added `404.html` copy for SPA fallback
- Removed the separate fix-imports step (no longer needed with build-time fixing)

**Step 2: Commit**

```bash
git add .github/workflows/deploy-docs.yml
git commit -m "fix: simplify deployment workflow, import fixing now built into tova build"
```

---

### Task 13: Remove fix-imports.py Hack Script

**Files:**
- Delete: `/Users/macm1/new-y-combinator/tova-packages/ui/new_docs/scripts/fix-imports.py`

**Step 1: Remove the script**

```bash
rm /Users/macm1/new-y-combinator/tova-packages/ui/new_docs/scripts/fix-imports.py
rmdir /Users/macm1/new-y-combinator/tova-packages/ui/new_docs/scripts/  # only if empty
```

**Step 2: Verify build still works**

```bash
cd /Users/macm1/new-y-combinator/tova-packages/ui/new_docs
/Users/macm1/new-y-combinator/lux-lang/bin/tova.js build
# Check that .tova-out/ has correct import paths
grep -r "from './runtime/" .tova-out/pages/ | head -5
```
Expected: No `./runtime/` imports in nested page files — they should all be `../../runtime/` etc.

**Step 3: Commit**

```bash
git add -A new_docs/scripts/
git commit -m "chore: remove fix-imports.py, build pipeline handles import fixing natively"
```

---

### Task 14: End-to-End Verification

**Step 1: Test spa template**

```bash
cd /tmp
/Users/macm1/new-y-combinator/lux-lang/bin/tova.js new my-spa --template spa
cd my-spa
/Users/macm1/new-y-combinator/lux-lang/bin/tova.js build
ls .tova-out/
/Users/macm1/new-y-combinator/lux-lang/bin/tova.js build --production
ls .tova-out/
# Should see: index.html, 404.html, 200.html, client.*.js, client.*.min.js
cd .. && rm -rf my-spa
```

**Step 2: Test site template**

```bash
cd /tmp
/Users/macm1/new-y-combinator/lux-lang/bin/tova.js new my-docs --template site
cd my-docs
/Users/macm1/new-y-combinator/lux-lang/bin/tova.js build
ls .tova-out/
/Users/macm1/new-y-combinator/lux-lang/bin/tova.js build --production --static
ls -R .tova-out/
# Should see: index.html, 404.html, 200.html, docs/index.html, about/index.html
cd .. && rm -rf my-docs
```

**Step 3: Test new_docs build**

```bash
cd /Users/macm1/new-y-combinator/tova-packages/ui
/Users/macm1/new-y-combinator/lux-lang/bin/tova.js build
cd new_docs
/Users/macm1/new-y-combinator/lux-lang/bin/tova.js build
# Verify import paths in nested files
grep "from '../../runtime/" .tova-out/pages/button/button.js
# Should show correct relative imports
```

**Step 4: Test interactive template picker**

```bash
cd /tmp
echo "2" | /Users/macm1/new-y-combinator/lux-lang/bin/tova.js new test-interactive
# Should create with spa template (2nd in list)
cat test-interactive/tova.toml
rm -rf test-interactive
```
