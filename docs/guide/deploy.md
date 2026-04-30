# Deploy

Tova's `deploy` block is declarative infrastructure-as-code built into the language. Define your server, domain, and scaling requirements directly in your `.tova` file and deploy to any VPS with a single command — no Dockerfiles, Terraform, or YAML.

## Quick Start

A minimal deployment requires a server block and a deploy block:

```tova
server {
  route GET "/healthz" => fn() { "ok" }
  route GET "/" => fn() { "<h1>Hello from Tova</h1>" }
}

deploy "prod" {
  server: "root@198.51.100.1"
  domain: "myapp.com"
}
```

Preview the infrastructure plan, then deploy:

```bash
tova deploy prod --plan
tova deploy prod
```

The first command parses your project and prints the infrastructure summary (services, databases, env vars, required secrets) without contacting the server. The second runs the full deploy: it builds your project, provisions the host on first run (Bun, Caddy, UFW, systemd, optional Postgres/Redis), uploads a new release, flips the `current` symlink, and restarts services.

## Prerequisites

The deploy command shells out to `ssh`, `scp`, and `rsync`, so the local machine running `tova deploy` needs:

- `ssh`, `scp`, and `rsync` on `PATH`
- An SSH key that authenticates to the user in `server: "user@host"` — `tova deploy` invokes `ssh` with `BatchMode=yes`, which disables password prompts. Test it once with `ssh user@host` before deploying

The remote host should be a Debian/Ubuntu Linux server with `apt-get` and `systemd` available. The first deploy installs everything else (Bun, Caddy, UFW, optional Postgres/Redis) idempotently — re-runs skip components that are already present.

**The SSH user can be either `root` or a non-root user with passwordless `sudo`.** Before doing anything, the CLI runs a one-line probe to detect which model the host uses and routes commands appropriately:

- **Root SSH user** (e.g., `root@host` on a freshly-imaged droplet): commands run directly, no `sudo` prefix.
- **Non-root with sudo** (e.g., `ubuntu@ec2`, `deploy@host`): every privileged step is prefixed with `sudo`, and `rsync` runs with `--rsync-path=sudo rsync` so it can write under `/opt/tova/apps`. This requires the user to have **passwordless** `sudo` (no TTY prompt) — the standard cloud-image setup. If the user is non-root and `sudo` isn't installed, the CLI exits with a clear error before running any commands.

Bun is always installed under the `tova` system user (created by the provisioner), so the systemd unit's hardcoded `/home/tova/.bun/bin/bun` path resolves correctly regardless of which SSH user kicked off the deploy.

## Deploy Block Syntax

A deploy block starts with the `deploy` keyword followed by a quoted environment name and a body of configuration fields:

```tova
deploy "prod" {
  server: "root@198.51.100.1"
  domain: "myapp.com"
  instances: 2
  memory: "1gb"
  branch: "main"
  health: "/healthz"
  health_interval: 30
  health_timeout: 5
  restart_on_failure: true
  keep_releases: 5
}
```

Key rules:

- The environment name (`"prod"`, `"staging"`) is required and identifies the deployment target on the CLI
- `server` and `domain` are the only required fields — everything else has sensible defaults
- Multiple deploy blocks with different names can coexist in the same file

### Config Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `server` | String | (required) | SSH connection string |
| `domain` | String | (required) | Domain for HTTPS and reverse proxy |
| `instances` | Int | `1` | Number of app processes |
| `memory` | String | `"512mb"` | Memory limit per instance |
| `branch` | String | `"main"` | Git branch to deploy |
| `health` | String | `"/healthz"` | Health check endpoint path |
| `health_interval` | Int | `30` | Seconds between health checks |
| `health_timeout` | Int | `5` | Health check timeout in seconds |
| `restart_on_failure` | Bool | `true` | Auto-restart crashed processes |
| `keep_releases` | Int | `5` | Old releases to retain for rollback |

## Environment Variables

The `env` sub-block declares environment variables that are passed to your application at runtime:

```tova
deploy "prod" {
  server: "root@198.51.100.1"
  domain: "myapp.com"

  env {
    NODE_ENV: "production"
    PORT: 3000
    API_KEY: "sk-abc123"
  }
}
```

Key rules:

- `NODE_ENV` is always set to `production` and `PORT` is always set to the instance port (3000, 3001, etc.) — these are managed by the systemd template and cannot be overridden in the `env` block
- Variables declared in `env` are written to the systemd unit as `Environment=KEY=value` directives
- For secrets that should not live in source code, use a `.env.production` file on the server — systemd loads it via `EnvironmentFile`

The `.env.production` file is loaded before inline `env` values, so inline declarations override file values for the same key:

```
# /opt/tova/apps/myapp/.env.production
DATABASE_URL=postgres://localhost/myapp_db
JWT_SECRET=real-secret-here
```

## Database Declarations

The `db` sub-block declares database engines that should be provisioned on the server:

```tova
deploy "prod" {
  server: "root@198.51.100.1"
  domain: "myapp.com"

  db {
    postgres {
      name: "myapp_db"
    }
    redis {
    }
  }
}
```

Key rules:

- Supported engines are `postgres`, `redis`, and `sqlite`
- PostgreSQL is installed via `apt-get`, and the named database is created idempotently with `createdb`
- Redis is installed and enabled as a systemd service
- SQLite databases declared in a `server` block (via `db { path }`) are automatically detected — no need to redeclare them in the deploy block
- Database provisioning is idempotent — re-running the deploy will not drop or recreate existing databases

## Multi-Environment Deployments

Define separate deploy blocks for each environment with different servers, domains, and scaling:

```tova
deploy "staging" {
  server: "root@staging.example.com"
  domain: "staging.myapp.com"
  instances: 1
  memory: "512mb"
  branch: "develop"

  env {
    LOG_LEVEL: "debug"
  }
}

deploy "prod" {
  server: "root@prod.example.com"
  domain: "myapp.com"
  instances: 3
  memory: "1gb"
  branch: "main"

  env {
    LOG_LEVEL: "warn"
  }

  db {
    postgres {
      name: "myapp_prod"
    }
    redis {
    }
  }
}
```

Deploy to either environment by name:

```bash
tova deploy staging
tova deploy prod
```

## Infrastructure Inference

Tova analyzes your entire program — not just the deploy block — to determine what infrastructure is needed. Features used in server, browser, and security blocks are automatically detected and provisioned.

| Source Block | Detection | Infrastructure Added |
|-------------|-----------|---------------------|
| `server { }` | Automatic | Bun, Caddy, UFW |
| `browser { }` | Automatic | Static asset serving |
| `ws { }` in server | WebSocket detected | Caddy WebSocket proxy |
| `sse` in server | SSE detected | SSE feature flag |
| `db { path }` in server | SQLite detected | Data directory provisioned |
| `env("SECRET")` in security | env() calls collected | Required secrets list |

For example, if your server block uses WebSocket:

```tova
server {
  ws {
    on_message fn(msg) {
      broadcast(msg)
    }
  }
}

deploy "prod" {
  server: "root@198.51.100.1"
  domain: "myapp.com"
}
```

Tova automatically configures Caddy with WebSocket proxy headers — no additional deploy configuration needed.

## CLI Reference

All deploy operations use the `tova deploy` command:

| Command | Description |
|---------|-------------|
| `tova deploy prod` | Build, provision, upload a release, and restart services |
| `tova deploy prod --plan` | Print the inferred infrastructure plan (no SSH) |
| `tova deploy prod --rollback` | Symlink `current` to the previous release and restart |
| `tova deploy prod --status` | Run `systemctl status` for the app's units over SSH |
| `tova deploy prod --logs` | Run `journalctl --since "1 hour ago"` for the app's units |
| `tova deploy prod --logs --since "30 minutes ago"` | Override the journalctl `--since` window |
| `tova deploy prod --logs --instance 0` | Logs for a single instance — `0` is port 3000, `1` is 3001, etc. |
| `tova deploy prod --ssh` | Open an interactive SSH session to the server |
| `tova deploy prod --setup-git` | Create a bare repo and `post-receive` hook for push-to-deploy |
| `tova deploy prod --remove` | Stop units and delete `/opt/tova/apps/<env>` (interactive `yes` confirmation) |
| `tova deploy --list --server root@example.com` | List `/opt/tova/apps` entries on the given host |

A few CLI behaviours worth knowing:

**Dry-run.** Set `TOVA_DEPLOY_DRY_RUN=1` to print every `ssh`, `scp`, and `rsync` command instead of executing them. The build step still runs locally, so this is also a quick way to see exactly what would land on the server:

```bash
TOVA_DEPLOY_DRY_RUN=1 tova deploy prod
```

**`--remove` requires confirmation.** It deletes the release directory, removes the systemd unit, and stops services — there is no automatic backup. The CLI prompts for `yes` and refuses to run on a non-TTY (CI, piped scripts). Use `TOVA_DEPLOY_DRY_RUN=1` if you want to preview the destructive commands first.

**`--list` needs a target.** When invoked without an environment name, it has no deploy block to read `server` from, so `--server user@host` is required. With an environment name, it uses that block's `server`.

**Errors surface verbatim.** `ssh`/`scp`/`rsync` exit codes propagate to `tova deploy`, so a hostname resolution failure, a permission error, or a non-zero `systemctl` exit shows up directly in the output and the CLI exits non-zero.

```bash
# Preview what will be provisioned
tova deploy prod --plan

# Deploy
tova deploy prod

# Check status after deploy
tova deploy prod --status

# View recent logs
tova deploy prod --logs --since "30 minutes ago"

# Roll back if something is wrong
tova deploy prod --rollback
```

## How `tova deploy` Works

A bare `tova deploy <env>` runs the following sequence. Every step is idempotent — re-running a deploy on the same host either skips or replaces existing state.

1. **Probe** the SSH user on the remote (`id -u`, `command -v sudo`) to decide whether commands need a `sudo ` prefix. Cached for the rest of the deploy.
2. **Parse** every `.tova` file under `project.entry` (or the project root) and merge them into a single AST.
3. **Infer** the infrastructure manifest for the named environment — services, databases, env vars, required secrets, WebSocket/SSE flags.
4. **Build** the project (`tova build --production --quiet`) into `.tova-out/`.
5. **Generate** a provisioning bash script for the manifest (it does its own root/sudo detection in shell) and `scp` it to `/tmp/tova-provision.sh` on the server.
6. **Provision** the host: `ssh user@host bash /tmp/tova-provision.sh` creates the `tova` system user, installs Bun *as that user* into `/home/tova/.bun/`, and idempotently installs Caddy, UFW, the `<env>@.service` systemd template, and any declared databases.
7. **Upload** the build with `rsync -az --delete` (using `--rsync-path=sudo rsync` for non-root SSH users) into `/opt/tova/apps/<env>/releases/<UTC-timestamp>/`.
8. **Re-chown** the release tree to `tova:tova`. rsync writes files as the SSH user, but the systemd unit runs as `User=tova` and needs write access to its working directory (e.g. for SQLite databases under `shared/data/`).
9. **Activate** the release: re-point `current` to the new directory, `systemctl restart '<env>@*.service'`, and prune releases older than `keep_releases`.

`--rollback` skips steps 4–8 and runs only an inverse of step 9: select the previous release, swap the symlink, restart. The other action flags (`--status`, `--logs`, `--ssh`, `--setup-git`, `--remove`, `--list`) bypass the build/upload pipeline entirely and run a single SSH command (still after the privilege probe).

## Server Layout

Tova organizes deployments in a standard directory structure under `/opt/tova/apps/`:

```
/opt/tova/apps/<name>/
├── releases/
│   ├── 20250115-143022/
│   ├── 20250116-091545/
│   └── 20250117-120000/
├── current -> releases/20250117-120000
├── shared/
│   ├── logs/
│   └── data/
└── .env.production
```

- `releases/` contains timestamped release directories
- `current` is a symlink to the active release
- `shared/logs/` and `shared/data/` persist across releases
- `.env.production` holds secrets loaded by systemd

## Provisioning

Running `tova deploy` provisions the server in idempotent layers. Each layer checks whether its components are already installed before acting.

### Bun Runtime

Bun is installed via the official install script. The check is idempotent — if `bun` is already on the PATH, the step is skipped:

```bash
if ! command -v bun &>/dev/null; then
  curl -fsSL https://bun.sh/install | bash
fi
```

### Caddy Reverse Proxy

Caddy handles HTTPS certificates automatically via Let's Encrypt. The generated Caddyfile configures reverse proxying to your app instances with health checks and load balancing:

```text
myapp.com {
  reverse_proxy localhost:3000 localhost:3001 localhost:3002 {
    lb_policy round_robin
    health_uri /healthz
    health_interval 30s
    health_timeout 5s
  }

  log {
    output file /var/log/caddy/myapp.log
  }
}
```

For a single instance, the load balancer configuration is omitted and traffic goes directly to `localhost:3000`.

### UFW Firewall

The firewall is configured to allow only SSH, HTTP, and HTTPS traffic:

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### systemd Services

Each app instance runs as a systemd template unit. The template uses `%i` as the port number, allowing multiple instances with a single unit file:

```ini
[Unit]
Description=myapp instance on port %i
After=network.target

[Service]
Type=simple
User=tova
Group=tova
WorkingDirectory=/opt/tova/apps/myapp/current
ExecStart=/home/tova/.bun/bin/bun run server.js --port %i
Restart=on-failure
RestartSec=5
MemoryMax=512M

EnvironmentFile=-/opt/tova/apps/myapp/.env.production
Environment=NODE_ENV=production
Environment=PORT=%i

StandardOutput=journal
StandardError=journal
SyslogIdentifier=myapp-%i

[Install]
WantedBy=multi-user.target
```

With `instances: 3`, Tova enables `myapp@3000`, `myapp@3001`, and `myapp@3002`.

### PostgreSQL and Redis

Database engines declared in the `db` sub-block are installed conditionally:

- PostgreSQL is installed via `apt-get` and the named database is created if it does not already exist
- Redis is installed and enabled as a systemd service
- Both are idempotent — re-running provisioning skips already-installed components

## Health Checks

The `health` field in the deploy block defines the endpoint that Caddy uses for health monitoring:

```tova
deploy "prod" {
  server: "root@198.51.100.1"
  domain: "myapp.com"
  health: "/healthz"
  health_interval: 30
  health_timeout: 5
}
```

Caddy polls each upstream instance at the `health_uri` on the configured interval. Instances that fail the health check are removed from the load balancer pool until they recover. This means a crashing instance stops receiving traffic while systemd restarts it.

Your server block should expose the health endpoint:

```tova
server {
  route GET "/healthz" => fn() { "ok" }
}
```

## Rollback and Release Management

Each deployment creates a timestamped directory under `releases/` and updates the `current` symlink. Rolling back switches the symlink to the previous release:

```bash
tova deploy prod --rollback
```

The `keep_releases` field controls how many old releases are retained. After a successful deploy, releases older than the configured limit are deleted:

```tova
deploy "prod" {
  server: "root@198.51.100.1"
  domain: "myapp.com"
  keep_releases: 5
}
```

With `keep_releases: 5`, the five most recent releases are kept. Older releases are removed automatically.

## Logging

Application logs flow through systemd's journal. `--logs` runs `journalctl --no-pager --since <window>` over SSH and streams the output back to your terminal:

```bash
# Default: last hour, all instances
tova deploy prod --logs

# Custom time window — anything journalctl accepts
tova deploy prod --logs --since "30 minutes ago"
tova deploy prod --logs --since "2026-04-25 09:00:00"

# A single instance — 0 is port 3000, 1 is 3001, etc.
tova deploy prod --logs --instance 0
```

For a continuous tail, open an SSH session and run `journalctl -fu '<env>@*.service'` directly — the `--logs` flag is intentionally a one-shot read so it works in scripts.

Caddy access logs are written to `/var/log/caddy/<appname>.log` on the server.

## Security

Tova's provisioning applies several security measures by default:

- **UFW firewall** restricts inbound traffic to ports 22, 80, and 443
- **`tova` system user** runs the application with no root privileges — the systemd unit specifies `User=tova`
- **MemoryMax** limits per-instance memory consumption to prevent runaway processes
- **Secrets via EnvironmentFile** keeps sensitive values in `.env.production` on the server, outside of source control
- **Auto-HTTPS** via Caddy provisions and renews TLS certificates from Let's Encrypt without configuration

## Git Push-to-Deploy

The `--setup-git` flag creates `/opt/tova/apps/<env>/repo.git` as a bare repository on the server and installs a `post-receive` hook that rebuilds and restarts the deployment on every push:

```bash
tova deploy prod --setup-git
```

The CLI prints the exact `git remote add` command to copy back to your machine — it uses the env name as the remote and the server from your deploy block, e.g.:

```bash
git remote add prod deploy@prod.example.com:/opt/tova/apps/prod/repo.git
git push prod main
```

The `post-receive` hook checks the working tree out into `/opt/tova/apps/<env>/source`, runs `bun install` and `tova build --production` if the project has a `package.json` or `tova.toml`, and then `systemctl restart`s the units. This path is for simple projects — for full release isolation (timestamped directories, rollback, prune), use `tova deploy <env>` instead.

## Complete Examples

### Todo App

A minimal full-stack application with SQLite, single instance, and all defaults:

```tova
server {
  db { path: "todos.db" }

  route GET "/healthz" => fn() { "ok" }

  route GET "/todos" => fn() {
    todos = query("SELECT * FROM todos ORDER BY id DESC")
    json(todos)
  }

  route POST "/todos" => fn() {
    body = await request.json()
    run("INSERT INTO todos (title, done) VALUES (?, ?)", body.title, false)
    json({ ok: true })
  }
}

browser {
  state {
    todos: List = []
  }

  fn load_todos() {
    todos = await fetch("/todos").json()
  }

  <main>
    <h1>"Todo App"</h1>
    <ul>
      for todo in todos {
        <li>{todo.title}</li>
      }
    </ul>
  </main>
}

deploy "prod" {
  server: "root@198.51.100.1"
  domain: "todos.example.com"
}
```

```bash
tova deploy prod --plan
tova deploy prod
```

### SaaS App

A production SaaS application with PostgreSQL, Redis, JWT auth, and multi-environment deployment:

```tova
shared {
  type User { id: Int, email: String, role: String }
}

security {
  auth jwt {
    secret: env("JWT_SECRET")
    expiry: "7d"
  }
}

server {
  route GET "/healthz" => fn() { "ok" }

  routes "/api" {
    route GET "/users" => fn() {
      users = query("SELECT id, email, role FROM users")
      json(users)
    }

    route POST "/users" => async fn() {
      body = await request.json()
      run("INSERT INTO users (email, role) VALUES ($1, $2)", body.email, body.role)
      json({ ok: true })
    }
  }
}

deploy "staging" {
  server: "root@staging.saas.com"
  domain: "staging.saas.com"
  instances: 1
  memory: "512mb"
  branch: "develop"

  env {
    LOG_LEVEL: "debug"
  }

  db {
    postgres {
      name: "saas_staging"
    }
    redis {
    }
  }
}

deploy "prod" {
  server: "root@prod.saas.com"
  domain: "app.saas.com"
  instances: 3
  memory: "1gb"
  branch: "main"

  env {
    LOG_LEVEL: "warn"
  }

  db {
    postgres {
      name: "saas_prod"
    }
    redis {
    }
  }
}
```

```bash
tova deploy staging --plan
tova deploy staging

tova deploy prod --plan
tova deploy prod
```

### Real-Time API

A WebSocket and SSE application with auto-detected features and multiple instances:

```tova
server {
  route GET "/healthz" => fn() { "ok" }

  ws {
    on_open fn(client) {
      print("Connected: {client.id}")
    }
    on_message fn(msg) {
      broadcast(msg)
    }
    on_close fn(client) {
      print("Left: {client.id}")
    }
  }

  sse "/events" fn(emit) {
    interval(1000) {
      emit("heartbeat", { time: now() })
    }
  }

  route GET "/api/status" => fn() {
    json({ connected: ws_client_count(), uptime: uptime() })
  }
}

deploy "prod" {
  server: "root@realtime.example.com"
  domain: "realtime.example.com"
  instances: 2
  memory: "1gb"
}
```

Tova detects the `ws` and `sse` declarations and configures Caddy with WebSocket proxy headers automatically:

```bash
tova deploy prod --plan
# Shows: Features: WebSocket, SSE

tova deploy prod
```

## Practical Tips

**Always preview with `--plan` first.** The plan shows every service, database, and configuration that will be applied to the server. Review it before deploying.

**Use `TOVA_DEPLOY_DRY_RUN=1` to inspect commands.** When you want to see the exact SSH/scp/rsync sequence — including the rendered provisioning script — run any deploy action with that env var set.

**Start with defaults and scale up.** A single instance with 512mb is enough for most applications. Add instances when traffic demands it.

**Keep secrets out of source code.** Use `.env.production` on the server for database URLs, API keys, and JWT secrets. The deploy block's `env` sub-block is for non-sensitive configuration like `LOG_LEVEL`.

**Use `keep_releases` for safe rollbacks.** The default of 5 gives you a window to roll back if a deployment introduces issues. Increase it for critical production services.

**Separate staging from production.** Use different servers, domains, and branches for each environment. Deploy to staging first, verify, then deploy to production.

**Use git push-to-deploy for continuous deployment.** After `--setup-git`, every `git push prod main` triggers a full build and restart — no CI pipeline needed for simple projects.

## Troubleshooting

**`Permission denied (publickey)`** — `tova deploy` runs `ssh` with `BatchMode=yes`, which disables password and keyboard-interactive auth. Add your SSH key to the server's `~/.ssh/authorized_keys` (or use an `ssh-agent`) and verify with `ssh -o BatchMode=yes user@host` before deploying.

**`Could not resolve hostname`** — DNS or `/etc/hosts` doesn't know about the host in your `server:` field. Test with `ssh user@host` directly. The CLI exits with code 255 (the SSH exit code) and prints the underlying error verbatim.

**`Error: no .tova files found`** — the deploy CLI looks under `project.entry` from `tova.toml`, falling back to the project root when that directory does not exist. Either set `entry` correctly in `tova.toml` or place a `.tova` file at the project root.

**`Error: no deploy block named "prod"`** — the project parses cleanly but has no matching deploy block. The error message lists the environments it did find — check the spelling in your `deploy "<name>" { ... }` declaration.

**`apt-get` failures during provisioning** — the provision script assumes Debian/Ubuntu. On other distributions you'll need to install Bun, Caddy, and Postgres/Redis manually before running `tova deploy`. Future releases may add detection for other package managers.

**`sudo: a password is required`** — the SSH user has `sudo` but not passwordless `sudo`. `tova deploy` runs `ssh` with `BatchMode=yes` and `rsync --rsync-path=sudo rsync`, both of which fail when sudo would prompt for a password. Either deploy as `root`, or grant `NOPASSWD` on the deploy user via `/etc/sudoers.d/` (e.g. `deploy ALL=(ALL) NOPASSWD: ALL`).

**Server requires either root SSH access or sudo installed** — the privilege probe ran successfully but found neither. This usually means a stripped-down container image. Install `sudo` (`apt-get install sudo`) and grant the deploy user passwordless privileges, or SSH in as `root` instead.
