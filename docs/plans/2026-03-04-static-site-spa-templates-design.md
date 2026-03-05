# Static Site & SPA Templates for Tova

## Summary

Add two new project templates (`site` and `spa`) to `tova new`, plus build infrastructure fixes so that Tova projects can be deployed as static sites to GitHub Pages, Firebase Hosting, Surge, Netlify, etc. without post-build hack scripts.

## Templates

### `site` — Documentation / Static Sites
- Browser-only (no server block) using `browser { }` block with client-side routing
- 3 example pages: Home, Docs, About
- Sidebar navigation, clean documentation layout
- `[deploy]` section in tova.toml with configurable `base` path
- Works with `tova dev` and deploys as static files

### `spa` — Single-Page Applications
- Browser-only using `browser { }` block with client-side routing
- 2 example routes: Home, Dashboard
- App-shell layout with navbar
- `[deploy]` section with configurable `base` path
- Deploys as static files

Both templates produce no server output — pure static deployment.

### Fix existing `fullstack` template
- Replace deprecated `client { }` block with `browser { }` block

## Infrastructure Changes

### 1. `[deploy]` Config Section
Add to `src/config/resolve.js`:
- New `deploy` section with `base` (default `"/"`)
- Parsed from `tova.toml`, used by build pipeline

### 2. Fix Import Paths at Build Time
In `buildProject()` (bin/tova.js):
- Generate correct relative import paths based on file depth in output directory
- Auto-add `.js` extensions to all relative imports
- Inject missing router imports when router functions are detected
- Handle component imports pointing to correct compiled output

### 3. Production Build Enhancements
In `productionBuild()`:
- Read `deploy.base` from config
- Generate base-path-aware script src and import map URLs in index.html
- Generate `404.html` (SPA fallback for GitHub Pages)
- Generate `200.html` (SPA fallback for Surge)

### 4. Static Generation (`tova build --static`)
- After normal production build, pre-render each route using SSR runtime
- Output: `index.html`, `about/index.html`, `docs/index.html`, etc.
- Each pre-rendered page includes inline content + hydration script tags
- Non-pre-rendered routes fall back to SPA client routing

### 5. Dev Server SPA Support
In `devServer()`:
- Detect client-only projects (no server block)
- Start a static file server for `.tova-out/` with correct MIME types
- SPA fallback: serve `index.html` for any non-file route

## Fixing new_docs (tova-packages/ui)

Once infrastructure is in place:
1. Add `[deploy]` section to `new_docs/tova.toml`
2. Remove `new_docs/scripts/fix-imports.py` (no longer needed)
3. Update `new_docs/index.html` to use base-path-aware paths
4. Simplify `.github/workflows/deploy-docs.yml` to use standard build pipeline
5. Verify `tova dev` and `tova build --production` work correctly

## Deployment Compatibility

| Platform | Strategy |
|----------|----------|
| GitHub Pages | `404.html` SPA fallback + configurable base path |
| Firebase Hosting | SPA rewrites in `firebase.json` (template includes it) |
| Surge | `200.html` SPA fallback |
| Netlify | `_redirects` file (template includes it) |
| Vercel | `vercel.json` rewrites |
| Any static host | `--static` pre-renders all routes to HTML |

## Template Order

Updated `TEMPLATE_ORDER`:
```
['fullstack', 'spa', 'site', 'api', 'script', 'library', 'blank']
```
