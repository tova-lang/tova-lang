# Deploy Blocks Design

Self-configuring deployment for Tova applications. A `deploy { }` block in a `.tova` file declares everything needed to take a bare Linux server to a running production app — runtime, databases, reverse proxy, SSL, process management — with zero manual server configuration.

## Design Principles

- The compiler infers infrastructure requirements from existing blocks (`server`, `browser`, `security`, `data`). The deploy block only declares deployment-specific concerns: which server, which domain, how many instances.
- The output is a generated, idempotent shell script using standard Linux tooling (systemd, Caddy, apt). No agents, no daemons, no Tova-specific runtime on the server.
- Every provisioning script is auditable. The developer can read exactly what will run before it runs.
- Multi-tenant by default. One server hosts multiple Tova apps, each fully isolated.

## 1. Block Syntax

Named blocks for multiple environments:

```tova
deploy "prod" {
  server: "root@159.65.100.42"
  domain: "myapp.com"

  instances: 2
  memory: "512mb"

  env {
    NODE_ENV: "production"
  }
}

deploy "staging" {
  server: "root@staging.myapp.com"
  domain: "staging.myapp.com"
}
```

Minimal version — just a server and a domain:

```tova
deploy "prod" {
  server: "root@my-server.com"
  domain: "myapp.com"
}
```

Database overrides when the developer needs to customize what was inferred:

```tova
deploy "prod" {
  server: "root@my-server.com"
  domain: "myapp.com"

  db {
    postgres { name: "myapp_prod", port: 5433 }
    redis { maxmemory: "256mb" }
  }
}
```

Health check and process configuration:

```tova
deploy "prod" {
  server: "root@my-server.com"
  domain: "myapp.com"

  health: "/healthz"
  health_interval: 30
  health_timeout: 5
  restart_on_failure: true
  keep_releases: 5
}
```

Git push deployment with branch control:

```tova
deploy "prod" {
  server: "root@my-server.com"
  domain: "myapp.com"
  branch: "main"
}

deploy "staging" {
  server: "root@my-server.com"
  domain: "staging.myapp.com"
  branch: "develop"
}
```

### Block Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `server` | String | required | SSH target (`user@host` or SSH alias) |
| `domain` | String | required | Domain for reverse proxy and SSL |
| `instances` | Int | `1` | Number of app instances |
| `memory` | String | `"512mb"` | Memory limit per instance |
| `branch` | String | `"main"` | Branch that triggers git push deploys |
| `health` | String | `"/healthz"` | Health check endpoint path |
| `health_interval` | Int | `30` | Seconds between health checks |
| `health_timeout` | Int | `5` | Seconds before health check times out |
| `restart_on_failure` | Bool | `true` | Auto-restart on crash |
| `keep_releases` | Int | `5` | Number of old releases to retain |
| `env { }` | Block | `{}` | Static environment variables |
| `db { }` | Block | inferred | Database overrides |

## 2. Infrastructure Inference

The compiler reads all blocks across the project's `.tova` files and builds an infrastructure manifest. The developer never lists what to install.

### Inference Rules

| Compiler sees | Provisions |
|---|---|
| `server { }` exists | Bun runtime, systemd service, Caddy reverse proxy |
| `server { db { path: "..." } }` | SQLite data directory with proper permissions |
| `server { db { type: "postgres" } }` | PostgreSQL install, user, database |
| `server { db { type: "redis" } }` | Redis install, configure, secure |
| `browser { }` exists | Static file serving through Caddy |
| `security { auth jwt { ... } }` | Require `JWT_SECRET` in `.env.production` |
| `security { cors { origins: [...] } }` | Caddy CORS headers |
| `server { ws handler { } }` | WebSocket proxy in Caddy config |
| `server { sse "/events" { } }` | SSE proxy with appropriate timeouts |
| `deploy { domain: "..." }` | Caddy auto-SSL via Let's Encrypt |
| `deploy { instances: N }` | Multiple systemd instances, Caddy load balancing |
| `data { source x = read("file.csv") }` | Upload data files to server data directory |

### Manifest Preview

Before deploying, the developer can inspect the inferred plan:

```bash
$ tova deploy prod --plan

Deploy plan for "prod" → root@159.65.100.42
─────────────────────────────────────────────

  System:    Bun 1.1.x, Caddy 2.x, UFW firewall
  Database:  PostgreSQL 16 (myapp_db), Redis 7
  App:       2 instances on ports 3000-3001
  Domain:    myapp.com (auto-SSL)
  Proxy:     HTTP → localhost:3000,3001 (round-robin)
             WebSocket /ws → upgrade
  Secrets:   JWT_SECRET (required), DATABASE_URL (auto)
  Env:       NODE_ENV=production

  No changes from last deploy: database, system
  Changed: app bundle (12 files), Caddy config

Proceed? [y/n]
```

### Change Detection

Each deploy writes a `.tova-manifest.json` alongside the release containing a hash of the infrastructure requirements. On subsequent deploys, the compiler compares manifests. If infrastructure changed (e.g., developer added Redis), provisioning layers run. If only app code changed, it skips to upload and restart.

## 3. Server Layout

```
/opt/tova/
  registry.json                    # all deployed apps, ports, domains
  caddy/
    Caddyfile                      # master config, auto-includes app configs
    apps/
      myapp.caddy                  # per-app reverse proxy + SSL
      other-app.caddy
  apps/
    myapp/
      current -> releases/v3       # symlink to active release
      releases/
        v1/
        v2/
        v3/                        # latest
          app.server.js
          app.client.js
          public/
          .tova-manifest.json
      data/                        # persistent: SQLite files, uploads
      .env.production              # secrets (never overwritten on redeploy)
      provision.sh                 # generated script (auditable)
    other-app/
      ...
```

### Design Decisions

- **Release directories with symlink**: enables instant rollback by flipping `current` to a previous release. No downtime.
- **`data/` separate from releases**: persistent files (SQLite databases, uploads) survive redeploys and rollbacks.
- **`.env.production` never overwritten**: once secrets are set on first deploy, redeploys don't touch them.
- **`registry.json`**: single source of truth for all apps on the server — maps app names to ports, domains, and status.
- **`provision.sh` kept on server**: the developer can SSH in and read exactly what was run.

### Provisioning Layers

The generated script runs in six layers, each idempotent:

```
Layer 1: System        apt update, install Bun, install Caddy, configure UFW (22, 80, 443)
Layer 2: Databases     install + configure declared databases, create users/schemas
Layer 3: App           create dirs, upload bundle, set permissions
Layer 4: Secrets       check .env.production, prompt for missing values
Layer 5: Proxy         generate Caddy config for domain → app port(s)
Layer 6: Services      create/update systemd unit, enable, start
```

## 4. Deployment Workflow

### CLI Push: `tova deploy`

**First deploy** — full provisioning:

```bash
$ tova deploy prod

  Connecting to root@159.65.100.42...              ✓
  Analyzing app requirements...
    → Bun, PostgreSQL, Redis, Caddy (SSL)
    → 2 instances, domain: myapp.com

  Provisioning server...
    → Installing Bun 1.1.x                         ✓
    → Installing PostgreSQL 16                      ✓
    → Installing Redis 7                            ✓
    → Installing Caddy 2.x                          ✓
    → Configuring firewall (22, 80, 443)            ✓

  Setting up databases...
    → Creating PostgreSQL database "myapp_db"       ✓
    → DATABASE_URL auto-configured                  ✓
    → Starting Redis                                ✓
    → REDIS_URL auto-configured                     ✓

  Deploying app (v1)...
    → Uploading bundle (2.1 MB)                     ✓
    → Setting current → releases/v1                 ✓

  Configuring secrets...
    → Missing secrets in .env.production:
      JWT_SECRET: ▊
    → 3 secrets configured                          ✓

  Configuring reverse proxy...
    → myapp.com → localhost:3000,3001               ✓
    → WebSocket /ws → upgrade                       ✓
    → SSL certificate provisioning                  ✓

  Starting app...
    → tova-myapp@1.service started                  ✓
    → tova-myapp@2.service started                  ✓
    → Health check /healthz passed                  ✓

  ✓ Live at https://myapp.com
```

**Subsequent deploys** — fast, infrastructure skipped:

```bash
$ tova deploy prod

  Connecting to root@159.65.100.42...              ✓
  Analyzing changes...
    → Infrastructure: no changes
    → App: 8 files changed

  Deploying app (v4)...
    → Uploading bundle (2.1 MB)                     ✓
    → Setting current → releases/v4                 ✓

  Restarting app...
    → tova-myapp@1.service restarted                ✓
    → tova-myapp@2.service restarted                ✓
    → Health check passed                           ✓

  ✓ Live at https://myapp.com (v4)
```

**Rollback:**

```bash
$ tova deploy prod --rollback

  Rolling back myapp on root@159.65.100.42...
    → current → releases/v3 (was v4)               ✓
    → Services restarted                            ✓
    → Health check passed                           ✓

  ✓ Rolled back to v3
```

### CLI Commands

```bash
tova deploy <env>                # deploy to environment
tova deploy <env> --plan         # show what would happen, don't execute
tova deploy <env> --rollback     # roll back to previous release
tova deploy <env> --logs         # tail app logs (journalctl)
tova deploy <env> --logs --since "1 hour ago"
tova deploy <env> --logs --instance 1
tova deploy <env> --status       # running instances, uptime, memory
tova deploy <env> --ssh          # SSH into the server
tova deploy <env> --remove       # remove app from server (archives data)
tova deploy <env> --setup-git    # set up git push deployment
tova deploy --list --server <ssh-target>   # list all apps on a server
tova env <env> list              # list env var names
tova env <env> set KEY=value     # set/update a secret
```

## 5. Multi-App Management

### Port Allocation

`registry.json` coordinates all apps on a server:

```json
{
  "apps": {
    "myapp": {
      "ports": [3000, 3001],
      "domain": "myapp.com",
      "instances": 2,
      "version": "v4"
    },
    "blog": {
      "ports": [3002],
      "domain": "blog.myapp.com",
      "instances": 1,
      "version": "v2"
    },
    "api": {
      "ports": [3003, 3004, 3005],
      "domain": "api.myapp.com",
      "instances": 3,
      "version": "v7"
    }
  },
  "next_port": 3006
}
```

New apps claim the next available ports. Ports are stable across redeploys.

### Caddy Configuration

Master config imports per-app configs:

```
# /opt/tova/caddy/Caddyfile
import /opt/tova/caddy/apps/*.caddy
```

Per-app config (generated):

```
# /opt/tova/caddy/apps/myapp.caddy
myapp.com {
    reverse_proxy localhost:3000 localhost:3001 {
        lb_policy round_robin
        health_uri /healthz
        health_interval 30s
    }

    @ws path /ws
    reverse_proxy @ws localhost:3000 localhost:3001 {
        transport http {
            versions h2c 1.1
        }
    }
}
```

### Database Isolation

Database engines are shared; data is isolated per app:

- **PostgreSQL**: each app gets its own database and user (`myapp_db` owned by `tova_myapp`)
- **Redis**: keyspace isolation via prefix (`myapp:*`, `blog:*`)
- **SQLite**: file-level isolation (`/opt/tova/apps/<name>/data/data.db`)

### Server Overview

```bash
$ tova deploy --list --server root@159.65.100.42

  Apps on 159.65.100.42
  ─────────────────────────────────────
  myapp    myapp.com        v4   2 instances   ● running
  blog     blog.myapp.com   v2   1 instance    ● running
  api      api.myapp.com    v7   3 instances   ● running

  Resources: PostgreSQL 16 ●  Redis 7 ●  Caddy 2 ●
  Memory: 1.2 GB / 4 GB used
  Disk: 8.3 GB / 80 GB used
```

### App Removal

```bash
$ tova deploy prod --remove

  Remove "myapp" from 159.65.100.42?
    → Stop 2 instances                            ✓
    → Remove systemd services                     ✓
    → Remove Caddy config                         ✓
    → Drop database myapp_db                      ✓
    → Archive data to /opt/tova/archive/myapp/    ✓
    → Release ports 3000-3001                     ✓

  ✓ Removed (data archived, not deleted)
```

## 6. Git Push Deployment

### Setup

```bash
$ tova deploy prod --setup-git

  Setting up git deployment on root@159.65.100.42...
    → Creating bare repo at /opt/tova/apps/myapp/repo.git    ✓
    → Installing post-receive hook                            ✓
    → Adding git remote "prod" to local project               ✓

  Done. You can now deploy with:
    git push prod main
```

### Push Flow

```bash
$ git push prod main

  remote: [tova] Received push to main
  remote: [tova] Compiling .tova files...                    ✓
  remote: [tova] Analyzing changes...
  remote:          → Infrastructure: no changes
  remote:          → App: 3 files changed
  remote: [tova] Deploying app (v5)...                       ✓
  remote: [tova] Restarting services...                      ✓
  remote: [tova] Health check passed                         ✓
  remote:
  remote: ✓ Live at https://myapp.com (v5)
```

### Post-Receive Hook Behavior

1. Check out pushed code into temp directory
2. Verify the pushed branch matches the deploy block's `branch` property
3. Run `tova build` to compile `.tova` files
4. Compare infrastructure manifest against previous deploy
5. If infrastructure changed, run provisioning layers
6. Copy bundle into new release directory
7. Flip `current` symlink
8. Restart systemd services
9. Run health check
10. If health check fails, auto-roll back to previous release

### Auto-Rollback on Failed Health Check

```bash
$ git push prod main

  remote: [tova] Received push to main
  remote: [tova] Compiling...                                ✓
  remote: [tova] Deploying app (v6)...                       ✓
  remote: [tova] Restarting services...                      ✓
  remote: [tova] Health check /healthz...                    ✗ FAILED
  remote:
  remote: ⚠ Health check failed, rolling back...
  remote:   → current → releases/v5 (was v6)                ✓
  remote:   → Services restarted                             ✓
  remote:   → Health check passed                            ✓
  remote:
  remote: ✗ Deploy failed. Rolled back to v5.
  remote:   Run `tova deploy prod --logs` to investigate.
```

The git push succeeds (code is stored) but the deploy rolls back. The broken release stays in `releases/` for debugging.

### Relationship Between CLI and Git Push

Both models use the same provisioning and deployment code paths. The git hook calls the same logic as `tova deploy`. A developer can freely switch between the two.

## 7. Process Management and Monitoring

### systemd Services

Each app instance is a templated systemd service:

```ini
# /etc/systemd/system/tova-myapp@.service
[Unit]
Description=Tova app: myapp (instance %i)
After=network.target postgresql.service redis.service
Wants=network.target

[Service]
Type=simple
User=tova
WorkingDirectory=/opt/tova/apps/myapp/current
ExecStart=/usr/local/bin/bun run app.server.js --port %i
EnvironmentFile=/opt/tova/apps/myapp/.env.production
Restart=on-failure
RestartSec=5
StartLimitBurst=5
StartLimitIntervalSec=300
MemoryMax=512M

[Install]
WantedBy=multi-user.target
```

`tova-myapp@3000.service` and `tova-myapp@3001.service` run as separate instances. systemd manages them as a group.

### Health Check Timer

```ini
# /etc/systemd/system/tova-myapp-health.timer
[Timer]
OnBootSec=30
OnUnitActiveSec=30

# /etc/systemd/system/tova-myapp-health.service
# Hits /healthz on each instance, restarts failures
```

If an instance fails health checks repeatedly and exceeds `StartLimitBurst`, systemd stops restarting it.

### Logs

All logs go through journalctl — no log files to rotate or manage:

```bash
tova deploy prod --logs                        # stream all instances
tova deploy prod --logs --instance 1           # single instance
tova deploy prod --logs --since "1 hour ago"   # recent logs
```

### Status

```bash
$ tova deploy prod --status

  myapp — https://myapp.com
  ──────────────────────────────────────────────
  Status:     ● running (v4)
  Uptime:     3 days, 7 hours
  Instances:  2/2 healthy

    @3000   ● running   mem: 128 MB   cpu: 0.3%   uptime: 3d 7h
    @3001   ● running   mem: 134 MB   cpu: 0.2%   uptime: 3d 7h

  Database:
    PostgreSQL  ● running   myapp_db   size: 24 MB
    Redis       ● running   keys: 1,204   mem: 18 MB

  SSL:
    myapp.com   ● valid   expires: 2026-05-29 (90 days)

  Last deploy:  2026-02-25 09:14:03 (3 days ago)
  Releases:     4 (keeping last 5)
```

### Release Retention

Old releases are pruned automatically after deploy, controlled by `keep_releases` (default 5). The `data/` directory is never touched by pruning.

## 8. Secrets Management

Secrets are stored in `.env.production` on the server, never in source code.

**First deploy**: the compiler identifies required secrets from `security { }` and other blocks. `tova deploy` prompts for any missing values interactively.

**Subsequent deploys**: `.env.production` is never overwritten. New secrets are prompted only if new requirements are detected.

**Managing secrets**:

```bash
tova env prod list               # show secret names (not values)
tova env prod set KEY=value      # set or update a secret
```

**Auto-configured secrets**: database connection strings (`DATABASE_URL`, `REDIS_URL`) are generated automatically during provisioning and written to `.env.production` without developer input.

## 9. Security

### Firewall

UFW is configured on first deploy with minimal open ports:

- Port 22 (SSH)
- Port 80 (HTTP, redirects to HTTPS)
- Port 443 (HTTPS)

All other ports are blocked from external access. App ports (3000+) are only accessible via localhost through Caddy.

### Process Isolation

- Apps run as a dedicated `tova` user, not root
- Each app has its own database user with access only to its own database
- Memory limits enforced by systemd
- App processes cannot access other apps' data directories

### SSL

Caddy handles certificate provisioning and renewal automatically via Let's Encrypt. No certbot, no cron jobs, no manual renewal.

## Summary

The `deploy { }` block turns Tova into a complete platform. The developer writes their app using `server`, `browser`, `security`, and `data` blocks as they already do. They add a `deploy` block with a server address and domain. `tova deploy` handles everything else — from installing the runtime on a bare Linux server to serving the app over HTTPS with automatic SSL, database provisioning, process management, and health monitoring. Multiple apps share a server efficiently, and deployments are instant, auditable, and reversible.
