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

The first command shows what will be provisioned (Bun, Caddy, UFW, systemd services). The second executes it over SSH.

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
| `tova deploy prod` | Deploy to the named environment |
| `tova deploy prod --plan` | Preview infrastructure without deploying |
| `tova deploy prod --rollback` | Revert to the previous release |
| `tova deploy prod --status` | Check systemd service status |
| `tova deploy prod --logs` | Tail service logs |
| `tova deploy prod --logs --since "1 hour ago"` | Logs since a specific time |
| `tova deploy prod --logs --instance 1` | Logs for a specific instance |
| `tova deploy prod --ssh` | Open an SSH session to the server |
| `tova deploy prod --setup-git` | Configure push-to-deploy |
| `tova deploy prod --remove` | Stop and remove the deployment |
| `tova deploy --list --server root@example.com` | List deployments on a server |

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

```caddy
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

Application logs flow through systemd's journal. Use the `--logs` flag to view them:

```bash
# Tail recent logs
tova deploy prod --logs

# Logs since a specific time
tova deploy prod --logs --since "1 hour ago"

# Logs for a specific instance
tova deploy prod --logs --instance 1
```

Caddy access logs are written to `/var/log/caddy/<appname>.log`.

## Security

Tova's provisioning applies several security measures by default:

- **UFW firewall** restricts inbound traffic to ports 22, 80, and 443
- **`tova` system user** runs the application with no root privileges — the systemd unit specifies `User=tova`
- **MemoryMax** limits per-instance memory consumption to prevent runaway processes
- **Secrets via EnvironmentFile** keeps sensitive values in `.env.production` on the server, outside of source control
- **Auto-HTTPS** via Caddy provisions and renews TLS certificates from Let's Encrypt without configuration

## Git Push-to-Deploy

The `--setup-git` flag configures a bare Git repository on the server with a `post-receive` hook that automatically deploys on push:

```bash
tova deploy prod --setup-git
```

Once configured, deploy by pushing to the remote:

```bash
git remote add prod root@198.51.100.1:/opt/tova/apps/myapp/repo.git
git push prod main
```

The `post-receive` hook checks out the pushed branch, runs `bun install`, builds the project, and restarts the systemd services.

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

    route POST "/users" => fn() {
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

**Start with defaults and scale up.** A single instance with 512mb is enough for most applications. Add instances when traffic demands it.

**Keep secrets out of source code.** Use `.env.production` on the server for database URLs, API keys, and JWT secrets. The deploy block's `env` sub-block is for non-sensitive configuration like `LOG_LEVEL`.

**Use `keep_releases` for safe rollbacks.** The default of 5 gives you a window to roll back if a deployment introduces issues. Increase it for critical production services.

**Separate staging from production.** Use different servers, domains, and branches for each environment. Deploy to staging first, verify, then deploy to production.

**Use git push-to-deploy for continuous deployment.** After `--setup-git`, every `git push prod main` triggers a full build and restart — no CI pipeline needed for simple projects.
