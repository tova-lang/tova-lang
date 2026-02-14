# Monitoring Service

This example builds a monitoring system with named servers, scheduled tasks, background jobs, an event bus for notification routing, lifecycle hooks, service discovery with circuit breakers, and distributed tracing. It demonstrates advanced server-side patterns for production infrastructure.

## The Full Application

```tova
shared {
  type Metric {
    service: String
    name: String
    value: Float
    timestamp: String
    tags: [String]
  }

  type Alert {
    id: String
    service: String
    severity: AlertSeverity
    message: String
    timestamp: String
    resolved: Bool
  }

  type AlertSeverity { Info, Warning, Critical }

  type ServiceHealth {
    name: String
    status: String
    uptime: Float
    last_check: String
    response_ms: Int
  }

  type HealthReport {
    services: [ServiceHealth]
    active_alerts: [Alert]
    metrics_count: Int
    timestamp: String
  }
}

// --- Collector Server ---

server "collector" {
  env POLL_INTERVAL_SEC: Int = 30
  env RETENTION_HOURS: Int = 24
  env ALERT_WEBHOOK: Option<String> = None

  db {
    adapter: "sqlite"
    database: "metrics.db"
  }

  model MetricRecord {
    service: String
    name: String
    value: Float
    timestamp: String
    tags: String
  }

  model AlertRecord {
    service: String
    severity: String
    message: String
    timestamp: String
    resolved: Bool
  }

  var services_to_monitor = [
    { name: "api", url: "http://localhost:3001/health", threshold_ms: 500 },
    { name: "auth", url: "http://localhost:3002/health", threshold_ms: 300 },
    { name: "database", url: "http://localhost:5432", threshold_ms: 100 }
  ]

  // --- Service Discovery ---

  discover "api" at "http://localhost:3001" with {
    health: "/health",
    failure_threshold: 3,
    reset_timeout: 30.seconds,
    half_open_requests: 1
  }

  discover "auth" at "http://localhost:3002" with {
    health: "/health",
    failure_threshold: 5,
    reset_timeout: 60.seconds
  }

  // --- Scheduled Tasks ---

  schedule "*/30 * * * * *" fn() {
    services_to_monitor |> each(fn(service) {
      start = Date.now()

      var health = { status: "unknown", response_ms: -1 }
      try {
        response = await fetch(service.url, { timeout: service.threshold_ms * 2 })
        duration = Date.now() - start

        MetricRecord.create({
          service: service.name,
          name: "response_time_ms",
          value: duration,
          timestamp: Date.now(),
          tags: "health,latency"
        })

        match duration > service.threshold_ms {
          true => {
            slow_alert = Alert {
              id: uuid(),
              service: service.name,
              severity: Warning,
              message: "Slow response: {duration}ms (threshold: {service.threshold_ms}ms)",
              timestamp: Date.now(),
              resolved: false
            }
            publish("alerts", slow_alert)
          }
          false => {}
        }

        health = { status: "healthy", response_ms: duration }
      } catch err {
        down_alert = Alert {
          id: uuid(),
          service: service.name,
          severity: Critical,
          message: "Health check failed: {err.message}",
          timestamp: Date.now(),
          resolved: false
        }
        publish("alerts", down_alert)

        health = { status: "down", response_ms: -1 }
      }
    })
  }

  schedule "0 * * * *" fn() {
    cutoff = Date.now() - RETENTION_HOURS.hours
    MetricRecord.where({ timestamp_lt: cutoff }) |> delete_all()
    print("[cleanup] Removed metrics older than {RETENTION_HOURS}h")
  }

  // --- Background Jobs ---

  background fn send_alert_notification(alert: Alert) {
    match ALERT_WEBHOOK {
      Some(url) => {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "[{alert.severity |> to_string()}] {alert.service}: {alert.message}"
          })
        })
      }
      None => print("[alert] {alert.severity |> to_string()}: {alert.message}")
    }
  }

  background fn aggregate_metrics(service: String, window_minutes: Int) {
    cutoff = Date.now() - window_minutes.minutes
    metrics = MetricRecord.where({ service: service, timestamp_gt: cutoff })

    values = metrics |> map(fn(m) m.value)
    avg = values |> sum() / (values |> len() |> to_float())

    MetricRecord.create({
      service: service,
      name: "response_time_avg_{window_minutes}m",
      value: avg,
      timestamp: Date.now(),
      tags: "aggregate"
    })
  }

  // --- Event Bus ---

  subscribe "alerts" fn(alert: Alert) {
    // Store alert
    AlertRecord.create({
      service: alert.service,
      severity: alert.severity |> to_string(),
      message: alert.message,
      timestamp: alert.timestamp,
      resolved: false
    })

    // Send notification for warnings and criticals
    match alert.severity {
      Warning => spawn_job(send_alert_notification, alert)
      Critical => spawn_job(send_alert_notification, alert)
      Info => {}
    }

    // Auto-aggregate on critical alerts
    match alert.severity {
      Critical => spawn_job(aggregate_metrics, alert.service, 5)
      _ => {}
    }
  }

  subscribe "metric_ingested" fn(metric: Metric) {
    MetricRecord.create({
      service: metric.service,
      name: metric.name,
      value: metric.value,
      timestamp: metric.timestamp,
      tags: metric.tags |> join(",")
    })
  }

  // --- Lifecycle Hooks ---

  on_start fn() {
    print("[collector] Starting monitoring service...")
    print("[collector] Monitoring {services_to_monitor |> len()} services")
    print("[collector] Poll interval: {POLL_INTERVAL_SEC}s")
    print("[collector] Retention: {RETENTION_HOURS}h")
  }

  on_stop fn() {
    print("[collector] Shutting down monitoring service...")
    print("[collector] Flushing pending alerts...")
  }

  // --- Error Handler ---

  on_error fn(err, req, res) {
    print("[collector][ERROR] {err.message}")
    // Add request ID for tracing
    req_id = req.headers["x-request-id"] |> unwrapOr("unknown")
    print("[collector][TRACE] request_id={req_id}")

    res.status(500)
    res.json({
      error: "Internal collector error",
      request_id: req_id
    })
  }
}

// --- API Server ---

server "api" {
  env PORT: Int = 3001

  // --- Middleware for Tracing ---

  middleware fn trace(req, res) {
    req_id = req.headers["x-request-id"] |> unwrapOr(uuid())
    req.id = req_id
    res.setHeader("X-Request-ID", req_id)
    print("[api][TRACE] {req.method} {req.path} request_id={req_id}")
  }

  // --- Endpoints ---

  fn get_health() {
    {
      status: "ok",
      server: "api",
      uptime: Process.uptime(),
      timestamp: Date.now()
    }
  }

  fn get_metrics(service: Option<String>, name: Option<String>, limit_count: Option<Int>) {
    results = MetricRecord.all()

    results = match service {
      Some(s) => results |> filter(fn(m) m.service == s)
      None => results
    }

    results = match name {
      Some(n) => results |> filter(fn(m) m.name == n)
      None => results
    }

    results
      |> sort_by(fn(a, b) b.timestamp - a.timestamp)
      |> take(limit_count |> unwrapOr(100))
  }

  fn get_alerts(active_only: Option<Bool>) {
    alerts = AlertRecord.all()

    match active_only {
      Some(true) => alerts |> filter(fn(a) !a.resolved)
      _ => alerts
    }
  }

  fn resolve_alert(id: Int) -> Result<AlertRecord, String> {
    alert = AlertRecord.find(id) |> ok_or("Alert not found")!
    AlertRecord.update(id, { resolved: true })
    Ok(alert)
  }

  fn get_health_report() -> HealthReport {
    services = services_to_monitor |> map(fn(svc) {
      latest = MetricRecord.where({ service: svc.name, name: "response_time_ms" })
        |> sort_by(fn(a, b) b.timestamp - a.timestamp)
        |> first()

      ServiceHealth {
        name: svc.name,
        status: match latest {
          Some(m) if m.value < svc.threshold_ms => "healthy"
          Some(_) => "degraded"
          None => "unknown"
        },
        uptime: 99.9,
        last_check: latest |> map(fn(m) m.timestamp) |> unwrapOr("never"),
        response_ms: latest |> map(fn(m) m.value |> to_int()) |> unwrapOr(0)
      }
    })

    active_alerts = AlertRecord.where({ resolved: false })
      |> map(fn(a) Alert {
        id: a.id |> to_string(),
        service: a.service,
        severity: match a.severity {
          "Critical" => Critical
          "Warning" => Warning
          _ => Info
        },
        message: a.message,
        timestamp: a.timestamp,
        resolved: a.resolved
      })

    HealthReport {
      services: services,
      active_alerts: active_alerts,
      metrics_count: MetricRecord.all() |> len(),
      timestamp: Date.now()
    }
  }

  // --- Ingest Endpoint ---

  fn ingest_metric(metric: Metric) {
    publish("metric_ingested", metric)
    { status: "accepted" }
  }

  // --- Routes ---

  route GET "/health" => get_health
  route GET "/api/metrics" => get_metrics
  route GET "/api/alerts" => get_alerts
  route POST "/api/alerts/:id/resolve" => resolve_alert
  route GET "/api/report" => get_health_report
  route POST "/api/metrics/ingest" => ingest_metric
}
```

## Running It

```bash
# Start both servers
tova dev monitor.tova

# The collector runs on the default port, the API on port 3001
# Collector: scheduled health checks run automatically
# API: curl http://localhost:3001/api/report
```

## What This Demonstrates

### Named Servers

```tova
server "collector" { ... }
server "api" { port 3001; ... }
```

Two named servers in one file. The collector handles scheduled tasks and event processing. The API serves endpoints for dashboards and external queries. Each runs as an independent process.

### Scheduled Tasks

```tova
schedule "health_check" cron("*/30 * * * * *") {
  // Runs every 30 seconds
  services_to_monitor |> each(fn(service) { ... })
}

schedule "cleanup" cron("0 * * * *") {
  // Runs every hour — removes old metrics
}
```

Cron expressions define the schedule. Tasks run in the background and can access server state, models, and the event bus.

### Background Jobs

```tova
background fn send_alert_notification(alert: Alert) {
  await fetch(webhook_url, { method: "POST", body: JSON.stringify(alert) })
}

// Spawn from anywhere in the server
spawn_job(send_alert_notification, alert)
spawn_job(aggregate_metrics, "api", 5)
```

`background fn` declares a job that can be spawned asynchronously. `spawn_job` enqueues the job without blocking the caller.

### Event Bus

```tova
// Publish from anywhere
publish("alerts", alert)
publish("metric_ingested", metric)

// Subscribe with handlers
subscribe "alerts" fn(alert: Alert) {
  AlertRecord.create(...)
  match alert.severity {
    Critical => spawn_job(send_alert_notification, alert)
    _ => {}
  }
}
```

`publish()` and `subscribe` create a decoupled event system. Handlers run asynchronously. The alerts handler stores the alert, sends notifications for high-severity events, and triggers metric aggregation for critical alerts.

### Lifecycle Hooks

```tova
on_start {
  print("[collector] Starting monitoring service...")
}

on_stop {
  print("[collector] Shutting down...")
}
```

`on_start` runs when the server boots (after database initialization). `on_stop` runs during graceful shutdown.

### Service Discovery with Circuit Breaker

```tova
discover "api" {
  url: "http://localhost:3001",
  health: "/health",
  circuit_breaker: {
    failure_threshold: 3,
    reset_timeout: 30.seconds,
    half_open_requests: 1
  }
}
```

`discover` registers an external service. The circuit breaker tracks failures: after 3 consecutive failures, it opens the circuit (stops sending requests) for 30 seconds, then allows 1 test request before fully closing.

### Distributed Tracing

```tova
middleware fn trace(req, res) {
  req_id = req.headers["x-request-id"] |> unwrapOr(uuid())
  req.id = req_id
  res.setHeader("X-Request-ID", req_id)
}
```

The trace middleware propagates request IDs across services. When the collector calls the API health endpoint, the request ID flows through, enabling end-to-end tracing in logs.

### Error Handler with Tracing

```tova
on_error fn(err, req, res) {
  req_id = req.headers["x-request-id"] |> unwrapOr("unknown")
  print("[collector][ERROR] {err.message} request_id={req_id}")
  res.status(500)
  res.json({ error: "Internal error", request_id: req_id })
}
```

The error handler logs the request ID alongside the error for correlation.

## Key Patterns

**Named servers for separation.** The collector gathers data and processes events. The API serves queries. Each has its own port, middleware, and lifecycle.

**Event bus for decoupling.** Publishers don't know about subscribers. The alerts channel connects health checks to storage, notifications, and aggregation without direct coupling.

**Background jobs for async work.** Notifications, aggregation, and cleanup run in the background without blocking request handlers or scheduled tasks.

**Circuit breakers for resilience.** External service calls use circuit breakers to prevent cascading failures when a dependency is down.
