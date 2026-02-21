# Deployment Guide

How to deploy Tova applications to production.

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
FROM oven/bun:1
WORKDIR /app
COPY tova.toml ./
COPY .tova-out/ ./.tova-out/
COPY node_modules/ ./node_modules/
EXPOSE 3000
CMD ["bun", "run", ".tova-out/server.js"]
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
bun run .tova-out/server.js
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
    ".tova-out/server.js": {
      "runtime": "bun@1"
    }
  }
}
```

### Docker

```dockerfile
# Build stage
FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
RUN bun install
RUN bun run bin/tova.js build --production

# Production stage
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app/.tova-out ./.tova-out
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["bun", "run", ".tova-out/server.js"]
```

Build and run:

```bash
docker build -t my-tova-app .
docker run -p 3000:3000 my-tova-app
```

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
