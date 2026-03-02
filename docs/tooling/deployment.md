# Deployment Guide

How to deploy Tova applications to production. For zero-config VPS deployment using the `deploy` block, see the [Deploy Block guide](/guide/deploy).

## Build for Production

```bash
tova build --production
```

This generates optimized output in `.tova-out/`:
- Bundled JavaScript files
- Hashed filenames for cache busting
- Minified code
- Source maps

## Deployment Targets

### Fly.io

1. Create a `Dockerfile`:

```dockerfile
FROM oven/bun:1-slim
WORKDIR /app
COPY .tova-out/ ./.tova-out/
EXPOSE 3000
CMD ["bun", "run", ".tova-out/server.min.js"]
```

2. Deploy:

```bash
tova build --production
fly launch
fly deploy
```

### Railway

1. Set the build command in your Railway project:

```
tova build --production
```

2. Set the start command:

```
bun run .tova-out/server.min.js
```

3. Push to your Railway-connected Git repository.

### Vercel (Serverless)

For client-only Tova applications:

1. Create `vercel.json`:

```json
{
  "buildCommand": "tova build --production",
  "outputDirectory": ".tova-out",
  "framework": null
}
```

2. Deploy:

```bash
vercel
```

For full-stack Tova apps with server routes, use Vercel's Node.js serverless functions:

```json
{
  "buildCommand": "tova build --production",
  "functions": {
    ".tova-out/server.min.js": {
      "runtime": "bun@1"
    }
  }
}
```

### Docker

Multi-stage build with `oven/bun:1-slim` for a minimal production image:

```dockerfile
# Build stage
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install
COPY src/ ./src/
COPY tova.toml ./
RUN bunx tova build --production

# Production stage
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app/.tova-out ./.tova-out
EXPOSE 3000
CMD ["bun", "run", ".tova-out/server.min.js"]
```

Add a `.dockerignore` to keep the build context small:

```
.tova-out
node_modules
.git
```

Build and run:

```bash
docker build -t my-tova-app .
docker run -p 3000:3000 my-tova-app
```

The production build bundles everything into self-contained files — no `node_modules` needed in the production image.

### Static Hosting (Netlify, GitHub Pages)

For client-only apps:

```bash
tova build --production
# Upload .tova-out/ to your static host
```

Netlify `netlify.toml`:

```toml
[build]
  command = "tova build --production"
  publish = ".tova-out"
```

## Environment Variables

Set environment variables for your server:

```tova
server {
  env PORT: Int = 3000
  env DATABASE_URL: String
  env SECRET_KEY: String
}
```

These map to `process.env` at runtime. Set them in your hosting platform's dashboard or via `.env` files during development.

## Health Checks

Add a health check endpoint:

```tova
server {
  health "/health"
}
```

Configure your platform to ping `/health` for uptime monitoring.

## Production Checklist

- [ ] Run `tova check --strict` to verify no type errors
- [ ] Run `tova test` to verify all tests pass
- [ ] Build with `tova build --production`
- [ ] Set all required environment variables
- [ ] Configure health check endpoint
- [ ] Enable HTTPS (handled by most platforms)
- [ ] Set up logging and error monitoring
